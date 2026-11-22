//! The HTTP API of spec §4: `/fhir/Bundle` for IPS document Bundles.

use axa::{
    Error, Result,
    error::ErrorDetail,
    extract::{Json, Path},
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
        .add("/", post(create))
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
