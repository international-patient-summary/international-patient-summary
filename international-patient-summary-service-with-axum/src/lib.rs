//! International Patient Summary service: stores and serves HL7 FHIR International
//! Patient Summary (IPS) document Bundles for the `international-patient-summary-ui-with-svelte`
//! viewer. Built on Axum with Axa and sqlx over Postgres.
//!
//! [`main`](../src/main.rs) is ordinary Axa: configuration, logging, the pool, the
//! routes of [`app_routes`], and the server. The specification is `spec/index.md`.

pub mod ips;
pub mod routes;
pub mod store;

use axa::{
    AppContext, Environment, Result,
    config::{Config, Defaults, MB},
    context::Db,
    routes::AppRoutes,
};

/// The migrations in `migrations/`, compiled in.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

/// The database name stem: `_development` and `_test` are added outside production.
pub const DATABASE: &str = "international_patient_summary_service";

/// The largest request body, matching the viewer's input limit (spec §4.1).
pub const BODY_LIMIT: usize = 10 * MB;

/// This service's defaults, which the environment overrides.
#[must_use]
pub fn defaults() -> Defaults {
    Defaults {
        database: DATABASE,
        body_limit: BODY_LIMIT,
        ..Defaults::default()
    }
}

/// Every route: Axa's health routes and the Bundle API.
#[must_use]
pub fn app_routes() -> AppRoutes {
    AppRoutes::with_default_routes().add_route(routes::bundles())
}

/// The context handlers receive, with readiness waiting on pending migrations.
#[must_use]
pub fn context(environment: Environment, pool: Db, config: Config) -> AppContext {
    let mut ctx = AppContext::new(environment, pool.clone(), config);
    ctx.health_checks = ctx.health_checks.migrations(move || {
        let pool = pool.clone();
        async move { axa::postgres_sqlx::pending(&pool, &MIGRATOR).await }
    });
    ctx
}

/// Refuse to serve where patient data would be reachable by anyone: this version has no
/// authentication (spec §6, tasks P3), so it serves only in development and test.
///
/// # Errors
///
/// In a production-like environment.
pub fn refuse_unauthenticated_production(environment: &Environment) -> Result<()> {
    if environment.is_production_like() {
        return Err(axa::Error::string(
            "this service stores patient data and has no authentication yet; \
             it serves only in development and test (spec §6, tasks P3)",
        ));
    }
    Ok(())
}
