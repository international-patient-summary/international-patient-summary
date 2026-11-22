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
    /// `GET /fhir/Bundle/{id}`.
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
    sqlx::query(
        "INSERT INTO ips_access_log (subject, issuer, action, bundle_id, status) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(caller.subject.as_deref())
    .bind(caller.issuer.as_deref())
    .bind(access.as_str())
    .bind(id)
    // Fallback `i16::MAX`: an HTTP status is at most 599, so it always fits; the column is a `smallint`.
    .bind(i16::try_from(status).unwrap_or(i16::MAX))
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
