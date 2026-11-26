//! The HTTP API of spec §4: `/fhir/Bundle` for IPS document Bundles.

use axa::{
    Error, Result,
    error::ErrorDetail,
    extract::{Json, Path, Query},
    prelude::*,
};
use axum::{
    Extension,
    http::{
        HeaderValue, StatusCode,
        header::{CACHE_CONTROL, CONTENT_TYPE, LOCATION},
    },
};
use serde_json::{Value, json};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    auth::Caller,
    ips,
    store::{self, Access},
};

/// The media type of every Bundle this service answers with.
pub const FHIR_JSON: &str = "application/fhir+json";

/// The path of the Bundle collection.
pub const BUNDLES: &str = "/fhir/Bundle";

/// The routes of this service's API, without Axa's health routes.
#[must_use]
pub fn bundles() -> Routes {
    Routes::new()
        .prefix(BUNDLES)
        .add("/", get(list).post(create))
        .add("/{id}", get(read).delete(remove))
}

/// `POST /fhir/Bundle`: check and store an IPS document, answering `201` with it. The
/// document and its access-log row are written together, or neither is.
async fn create(
    State(ctx): State<AppContext>,
    Extension(caller): Extension<Caller>,
    Json(mut bundle): Json<Value>,
) -> Result<Response> {
    ips::check(&bundle).map_err(refusal)?;
    let id = Uuid::new_v4();
    if let Some(object) = bundle.as_object_mut() {
        // `ips::check` has already refused anything but an object.
        object.insert("id".to_owned(), json!(id.to_string()));
    }
    let mut tx = ctx.db.begin().await?;
    store::insert(&mut tx, id, &bundle).await?;
    store::log_access(
        &mut tx,
        &caller,
        Access::Create,
        id,
        StatusCode::CREATED.as_u16(),
    )
    .await?;
    tx.commit().await?;
    tracing::info!(%id, "stored an IPS document");
    let mut response = fhir_json(StatusCode::CREATED, &bundle)?;
    response.headers_mut().insert(
        LOCATION,
        HeaderValue::try_from(format!("{BUNDLES}/{id}")).map_err(Error::wrap)?,
    );
    Ok(response)
}

/// How many documents a page holds unless `_count` says otherwise (S-API-8).
const DEFAULT_COUNT: usize = 20;
/// The most `_count` may ask for.
const MAX_COUNT: usize = 100;

/// Where a page of the list starts: after the document `id`, stored at `micros`
/// microseconds since the epoch. It names a time, not a row, so it outlives the
/// deletion of that document (S-API-8). Written `{micros}_{id}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Cursor {
    micros: i64,
    id: Uuid,
}

impl Cursor {
    /// A cursor this service issued, or `None`: digits, `_`, and a v4 id.
    fn parse(text: &str) -> Option<Self> {
        let (micros, id) = text.split_once('_')?;
        if micros.is_empty() || !micros.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        Some(Self {
            micros: micros.parse().ok()?,
            id: parse_id(id)?,
        })
    }
}

impl std::fmt::Display for Cursor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}_{}", self.micros, self.id)
    }
}

/// What a list request asks for: the page size, and where the page starts.
#[derive(Debug, PartialEq, Eq)]
struct PageQuery {
    count: usize,
    after: Option<Cursor>,
}

impl PageQuery {
    /// Read `_count` and `_cursor`; any other parameter is ignored, as FHIR servers do.
    fn from_query(query: &HashMap<String, String>) -> Result<Self> {
        let count = match query.get("_count") {
            None => DEFAULT_COUNT,
            Some(text) => text
                .parse::<usize>()
                .ok()
                .filter(|count| (1..=MAX_COUNT).contains(count))
                .ok_or_else(|| {
                    bad_request(
                        "invalid_count",
                        "_count is a whole number from 1 to 100",
                        "_count",
                    )
                })?,
        };
        let after = query
            .get("_cursor")
            .map(|text| {
                Cursor::parse(text).ok_or_else(|| {
                    bad_request(
                        "invalid_cursor",
                        "_cursor is not one this service issued",
                        "_cursor",
                    )
                })
            })
            .transpose()?;
        Ok(Self { count, after })
    }

    /// The URL of this page, or of the page after `cursor` at the same size.
    fn url(count: usize, cursor: Option<Cursor>) -> String {
        match cursor {
            None => format!("{BUNDLES}?_count={count}"),
            Some(cursor) => format!("{BUNDLES}?_count={count}&_cursor={cursor}"),
        }
    }
}

/// `GET /fhir/Bundle`: a page of the stored documents, newest first, as a `searchset`
/// Bundle (S-API-7). An entry is its document subsetted to what a list shows. Each
/// document listed is logged as a read before the page is sent (S-API-9, S-AUDIT-1).
async fn list(
    State(ctx): State<AppContext>,
    Extension(caller): Extension<Caller>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Response> {
    let PageQuery { count, after } = PageQuery::from_query(&query)?;
    // One more than a page, to know whether another follows.
    let limit = i64::try_from(count.saturating_add(1)).map_err(Error::wrap)?;
    let after_key = after.map(|cursor| (cursor.micros, cursor.id));
    let mut rows = store::list(&ctx.db, limit, after_key).await?;
    let more = rows.len() > count;
    rows.truncate(count);

    if !rows.is_empty() {
        let ids: Vec<Uuid> = rows.iter().map(|row| row.id).collect();
        let mut connection = ctx.db.acquire().await?;
        store::log_reads(&mut connection, &caller, &ids, StatusCode::OK.as_u16()).await?;
    }

    let more_after = rows.last().map(|row| Cursor {
        micros: row.micros,
        id: row.id,
    });
    let entries: Vec<Value> = rows.into_iter().map(listing).collect();
    let mut links = vec![json!({ "relation": "self", "url": PageQuery::url(count, after) })];
    if let (true, Some(next)) = (more, more_after) {
        links.push(json!({ "relation": "next", "url": PageQuery::url(count, Some(next)) }));
    }
    fhir_json(
        StatusCode::OK,
        &json!({ "resourceType": "Bundle", "type": "searchset", "link": links, "entry": entries }),
    )
}

/// The FHIR tag that marks a resource as only part of itself.
const SUBSETTED: &str = "http://terminology.hl7.org/CodeSystem/v3-ObservationValue";

/// A list entry (S-API-7): the document, subsetted to what a list shows and tagged so.
fn listing(row: store::Listed) -> Value {
    let mut entries = vec![json!({ "resource": row.composition })];
    entries.extend(row.subject);
    json!({
        "fullUrl": format!("{BUNDLES}/{}", row.id),
        "resource": {
            "resourceType": "Bundle",
            "id": row.id.to_string(),
            "type": "document",
            "meta": { "tag": [{ "system": SUBSETTED, "code": "SUBSETTED" }] },
            "entry": entries,
        },
        "search": { "mode": "match" },
    })
}

/// A `400` problem naming the query parameter at fault.
fn bad_request(code: &str, detail: &str, parameter: &str) -> Error {
    Error::CustomError(
        StatusCode::BAD_REQUEST,
        ErrorDetail {
            errors: Some(json!([{ "parameter": parameter }])),
            ..ErrorDetail::new(code, detail)
        },
    )
}

/// `GET /fhir/Bundle/{id}`: the stored document, or `404`. The read is logged before
/// the document is sent, and a read that cannot be logged sends nothing.
async fn read(
    State(ctx): State<AppContext>,
    Extension(caller): Extension<Caller>,
    Path(id): Path<String>,
) -> Result<Response> {
    let Some(id) = parse_id(&id) else {
        return not_found();
    };
    let found = store::find(&ctx.db, id).await?;
    let status = if found.is_some() {
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    };
    let mut connection = ctx.db.acquire().await?;
    store::log_access(&mut connection, &caller, Access::Read, id, status.as_u16()).await?;
    match found {
        Some(bundle) => fhir_json(StatusCode::OK, &bundle),
        None => not_found(),
    }
}

/// `DELETE /fhir/Bundle/{id}`: `204` once gone, or `404` if it never was. The deletion
/// and its access-log row are written together.
async fn remove(
    State(ctx): State<AppContext>,
    Extension(caller): Extension<Caller>,
    Path(id): Path<String>,
) -> Result<Response> {
    let Some(id) = parse_id(&id) else {
        return not_found();
    };
    let mut tx = ctx.db.begin().await?;
    let deleted = store::delete(&mut tx, id).await?;
    let status = if deleted {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    };
    store::log_access(&mut tx, &caller, Access::Delete, id, status.as_u16()).await?;
    tx.commit().await?;
    if deleted {
        tracing::info!(%id, "deleted an IPS document");
        Ok(StatusCode::NO_CONTENT.into_response())
    } else {
        not_found()
    }
}

/// An id this service could have issued. Anything else is a `404`, as an unknown id is.
fn parse_id(text: &str) -> Option<Uuid> {
    Uuid::try_parse(text)
        .ok()
        .filter(|id| id.get_version_num() == 4)
}

/// A `422` problem saying why the body is not an IPS document, and where.
fn refusal(why: ips::Refusal) -> Error {
    Error::CustomError(
        StatusCode::UNPROCESSABLE_ENTITY,
        ErrorDetail {
            errors: Some(json!([{ "pointer": why.pointer() }])),
            ..ErrorDetail::new(why.code(), why.detail())
        },
    )
}

/// `body` as FHIR JSON, never cached: it is a patient's record.
fn fhir_json(status: StatusCode, body: &Value) -> Result<Response> {
    let bytes = serde_json::to_vec(body)?;
    Ok((
        status,
        [
            (CONTENT_TYPE, HeaderValue::from_static(FHIR_JSON)),
            (CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        bytes,
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use uuid::Uuid;

    use super::{Cursor, DEFAULT_COUNT, MAX_COUNT, PageQuery};

    const ID: &str = "2b39610e-a2d8-4548-9e5f-eaa9ecd0fc08";

    fn query(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
            .collect()
    }

    #[test]
    fn a_cursor_reads_back_what_it_writes() {
        let cursor = Cursor {
            micros: 1_795_000_000_000_000,
            id: Uuid::try_parse(ID).expect("uuid"),
        };
        assert_eq!(Cursor::parse(&cursor.to_string()), Some(cursor));
    }

    #[test]
    fn a_cursor_this_service_did_not_issue_is_refused() {
        for text in [
            "",
            "_",
            "12",
            &format!("_{ID}"),
            &format!("-1_{ID}"),
            &format!("+1_{ID}"),
            &format!("1 _{ID}"),
            "12_not-a-uuid",
            "12_00000000-0000-0000-0000-000000000000",
            &format!("99999999999999999999_{ID}"),
        ] {
            assert_eq!(Cursor::parse(text), None, "{text:?}");
        }
    }

    #[test]
    fn a_page_query_defaults_and_bounds_its_count() {
        let page = PageQuery::from_query(&query(&[])).expect("default");
        assert_eq!(
            page,
            PageQuery {
                count: DEFAULT_COUNT,
                after: None
            }
        );
        for count in ["1", "100"] {
            assert!(PageQuery::from_query(&query(&[("_count", count)])).is_ok());
        }
        for count in ["0", "101", "-1", "ten", ""] {
            assert!(
                PageQuery::from_query(&query(&[("_count", count)])).is_err(),
                "{count:?}"
            );
        }
        let page = PageQuery::from_query(&query(&[("_count", "7"), ("other", "x")])).expect("ok");
        assert_eq!(page.count, 7);
        assert_eq!(MAX_COUNT, 100);
    }

    #[test]
    fn a_page_url_carries_its_size_and_cursor() {
        assert_eq!(PageQuery::url(5, None), "/fhir/Bundle?_count=5");
        let cursor = Cursor {
            micros: 42,
            id: Uuid::try_parse(ID).expect("uuid"),
        };
        assert_eq!(
            PageQuery::url(5, Some(cursor)),
            format!("/fhir/Bundle?_count=5&_cursor=42_{ID}")
        );
    }
}
