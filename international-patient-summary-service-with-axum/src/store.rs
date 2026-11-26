//! The SQL this service runs. Every query binds its values; none builds SQL from input.

use axa::context::Db;
use serde_json::Value;
use sqlx::{PgConnection, types::Json};
use uuid::Uuid;

use crate::auth::Caller;

/// The tables this service owns, for `db truncate`.
pub const TABLES: &[&str] = &["ips_documents", "ips_access_log"];

/// What a caller did to a document, as the access log records it (S-AUDIT-1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    /// `POST /fhir/Bundle`.
    Create,
    /// `GET /fhir/Bundle/{id}`, or each document of `GET /fhir/Bundle`.
    Read,
    /// `DELETE /fhir/Bundle/{id}`.
    Delete,
}

impl Access {
    fn as_str(self) -> &'static str {
        match self {
            Self::Create => "create",
            Self::Read => "read",
            Self::Delete => "delete",
        }
    }
}

/// Record that `caller` did `access` to the document `id`, answered with `status`.
/// Only the token's subject and issuer, never a name, an email, or content.
///
/// # Errors
///
/// A database error: the caller then gets a `500`, and no document (S-AUDIT-1).
pub async fn log_access(
    connection: &mut PgConnection,
    caller: &Caller,
    access: Access,
    id: Uuid,
    status: u16,
) -> Result<(), sqlx::Error> {
    let status = status_column(status)?;
    sqlx::query(
        "INSERT INTO ips_access_log (subject, issuer, action, bundle_id, status) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(caller.subject.as_deref())
    .bind(caller.issuer.as_deref())
    .bind(access.as_str())
    .bind(id)
    .bind(status)
    .execute(connection)
    .await?;
    Ok(())
}

/// Store `bundle` under `id`.
///
/// # Errors
///
/// A database error, including the table's check constraint when `bundle.id` is not `id`.
pub async fn insert(
    connection: &mut PgConnection,
    id: Uuid,
    bundle: &Value,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO ips_documents (id, bundle) VALUES ($1, $2)")
        .bind(id)
        .bind(Json(bundle))
        .execute(connection)
        .await?;
    Ok(())
}

/// The Bundle stored under `id`, if any.
///
/// # Errors
///
/// A database error.
pub async fn find(pool: &Db, id: Uuid) -> Result<Option<Value>, sqlx::Error> {
    let row: Option<Json<Value>> =
        sqlx::query_scalar("SELECT bundle FROM ips_documents WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|Json(bundle)| bundle))
}

/// What a list shows of a stored document (spec S-API-7): its id, its storage time in
/// microseconds since the epoch (for the cursor), the Composition with only `title`,
/// `date` and `subject.reference`, and the subject's entry with only its `name`, if the
/// document holds it.
#[derive(Debug)]
pub struct Listed {
    /// The document's id.
    pub id: Uuid,
    /// When it was stored, in microseconds since the epoch.
    pub micros: i64,
    /// The subsetted Composition.
    pub composition: Value,
    /// The subsetted entry of the Composition's subject, if the document holds one.
    pub subject: Option<Value>,
}

/// A row of [`list`]'s query, by column position.
#[derive(sqlx::FromRow)]
struct ListedRow(Uuid, i64, Json<Value>, Option<Json<Value>>);

/// Up to `limit` stored documents, newest first, continuing after the cursor `after`
/// (storage time in microseconds, id) if there is one. A cursor holds a time, not a row,
/// so a page boundary survives the deletion of the document it ended on. The subset is
/// built in SQL, so a page never loads a whole document.
///
/// The time goes back to a `timestamptz` as `epoch + micros × 1 µs`. Postgres multiplies an
/// interval by a `float8`, which holds every whole number below 2⁵³ exactly: any time before
/// the year 2255. The ordering uses the `ips_documents_created_at` index.
///
/// # Errors
///
/// A database error.
pub async fn list(
    pool: &Db,
    limit: i64,
    after: Option<(i64, Uuid)>,
) -> Result<Vec<Listed>, sqlx::Error> {
    let (micros, id) = after.map_or((None, None), |(micros, id)| (Some(micros), Some(id)));
    let rows: Vec<ListedRow> = sqlx::query_as(
        "SELECT d.id, (extract(epoch FROM d.created_at) * 1000000)::bigint, \
           jsonb_strip_nulls(jsonb_build_object( \
             'resourceType', 'Composition', \
             'title', c.resource -> 'title', \
             'date', c.resource -> 'date', \
             'subject', jsonb_build_object('reference', c.resource #> '{subject,reference}'))), \
           s.entry \
         FROM ips_documents d \
         CROSS JOIN LATERAL (SELECT d.bundle #> '{entry,0,resource}' AS resource, \
                                    d.bundle #>> '{entry,0,resource,subject,reference}' AS reference) c \
         LEFT JOIN LATERAL ( \
           SELECT jsonb_strip_nulls(jsonb_build_object( \
                    'fullUrl', e -> 'fullUrl', \
                    'resource', jsonb_build_object( \
                      'resourceType', e #> '{resource,resourceType}', \
                      'id', e #> '{resource,id}', \
                      'name', e #> '{resource,name}'))) AS entry \
           FROM jsonb_array_elements(d.bundle -> 'entry') WITH ORDINALITY AS t(e, at) \
           WHERE at > 1 AND ( \
             e ->> 'fullUrl' = c.reference \
             OR (e #>> '{resource,resourceType}') || '/' || (e #>> '{resource,id}') = c.reference \
             OR e ->> 'fullUrl' LIKE '%/' || c.reference) \
           ORDER BY at LIMIT 1) s ON true \
         WHERE $1::bigint IS NULL \
            OR (d.created_at, d.id) < ('epoch'::timestamptz + $1::bigint * interval '1 microsecond', $2::uuid) \
         ORDER BY d.created_at DESC, d.id DESC LIMIT $3",
    )
    .bind(micros)
    .bind(id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|ListedRow(id, micros, Json(composition), subject)| Listed {
            id,
            micros,
            composition,
            subject: subject.map(|Json(entry)| entry),
        })
        .collect())
}

/// Record that `caller` read each of the documents `ids`, answered with `status`.
///
/// # Errors
///
/// A database error: the caller then gets a `500`, and no list (S-AUDIT-1).
pub async fn log_reads(
    connection: &mut PgConnection,
    caller: &Caller,
    ids: &[Uuid],
    status: u16,
) -> Result<(), sqlx::Error> {
    let status = status_column(status)?;
    sqlx::query(
        "INSERT INTO ips_access_log (subject, issuer, action, bundle_id, status) \
         SELECT $1, $2, 'read', unnest($3::uuid[]), $4",
    )
    .bind(caller.subject.as_deref())
    .bind(caller.issuer.as_deref())
    .bind(ids)
    .bind(status)
    .execute(connection)
    .await?;
    Ok(())
}

/// Delete the Bundle stored under `id`, answering whether there was one.
///
/// # Errors
///
/// A database error.
pub async fn delete(connection: &mut PgConnection, id: Uuid) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM ips_documents WHERE id = $1")
        .bind(id)
        .execute(connection)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// The `ips_access_log.status` column is a `smallint`. An HTTP status always fits; one that does not is a defect,
/// so it is refused, not logged as some other value (RCA-P-9, RCA-IN-2).
fn status_column(status: u16) -> Result<i16, sqlx::Error> {
    i16::try_from(status)
        .map_err(|_| sqlx::Error::Protocol("ips_access_log.status: does not fit a smallint".into()))
}

#[cfg(test)]
mod tests {
    use super::status_column;

    #[test]
    fn a_status_that_fits_the_column_is_kept_and_one_that_does_not_is_refused() {
        assert_eq!(status_column(200).expect("fits"), 200);
        assert_eq!(status_column(599).expect("fits"), 599);
        assert_eq!(
            status_column(i16::MAX.unsigned_abs()).expect("the largest"),
            i16::MAX
        );
        let error = status_column(i16::MAX.unsigned_abs() + 1).expect_err("one past the largest");
        assert!(error.to_string().contains("ips_access_log.status"));
        assert!(status_column(u16::MAX).is_err());
    }
}
