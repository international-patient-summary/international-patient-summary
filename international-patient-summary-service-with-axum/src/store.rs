//! The SQL this service runs. Every query binds its values; none builds SQL from input.

use axa::context::Db;
use serde_json::Value;
use sqlx::types::Json;
use uuid::Uuid;

/// The tables this service owns, for `db truncate`.
pub const TABLES: &[&str] = &["ips_documents"];

/// Store `bundle` under `id`.
///
/// # Errors
///
/// A database error, including the table's check constraint when `bundle.id` is not `id`.
pub async fn insert(pool: &Db, id: Uuid, bundle: &Value) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO ips_documents (id, bundle) VALUES ($1, $2)")
        .bind(id)
        .bind(Json(bundle))
        .execute(pool)
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
pub async fn delete(pool: &Db, id: Uuid) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM ips_documents WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}
