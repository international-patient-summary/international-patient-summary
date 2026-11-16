//! The service's entry point: `start`, `db`, `task`, `check`, and `health`, as Axa's command line has them.

use std::process::ExitCode;

use axa::{
    Environment, Error, Result,
    cli::{self, Command, DbCommand},
    config::Config,
    logger, postgres_sqlx, server,
};
use ips_service::{MIGRATOR, app_routes, context, defaults, refuse_unauthenticated_production};

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<()> {
    let cli = cli::parse(
        env!("CARGO_PKG_NAME"),
        env!("CARGO_PKG_VERSION"),
        env!("CARGO_PKG_DESCRIPTION"),
    );
    let environment = cli
        .environment
        .as_deref()
        .map_or_else(Environment::from_env, Environment::parse);
    let defaults = defaults();
    if matches!(cli.command, Command::Check) {
        return cli::check(&environment, &defaults);
    }
    // `health` asks the server on this machine, for an image with no curl; it connects to nothing else.
    if let Command::Health { ready, port } = cli.command {
        return cli::health(&environment, &defaults, ready, port).await;
    }

    let mut config = Config::from_env(&environment, &defaults)?;
    config.apply_cli(&cli);
    logger::init(env!("CARGO_CRATE_NAME"), &config.logger);

    match cli.command {
        Command::Start { worker, all, .. } => {
            if worker || all {
                return Err(Error::string("this service has no job worker"));
            }
            refuse_unauthenticated_production(&environment)?;
            let pool = axa::db::connect(&config.database).await?;
            if config.database.auto_migrate {
                postgres_sqlx::migrate(&pool, &MIGRATOR)
                    .await
                    .map_err(Error::wrap)?;
            }
            let server_config = config.server.clone();
            let router = app_routes().into_app(context(environment, pool, config))?;
            server::serve(router, &server_config).await
        }
        Command::Db { command } => {
            let pool = axa::db::connect(&config.database).await?;
            database(&pool, &command).await
        }
        Command::Task { .. } => Err(Error::string("this service has no tasks")),
        Command::Check | Command::Health { .. } => unreachable!("answered before configuration"),
    }
}

/// Carry out a `db` command. `cli::parse` has already refused `down`, `reset`, and
/// `truncate` outside development and test, and without `AXA_DESTROY_DATA=true`.
async fn database(pool: &axa::context::Db, command: &DbCommand) -> Result<()> {
    match command {
        DbCommand::Migrate => postgres_sqlx::migrate(pool, &MIGRATOR)
            .await
            .map_err(Error::wrap),
        DbCommand::Down { steps } => postgres_sqlx::revert(pool, &MIGRATOR, *steps)
            .await
            .map_err(Error::wrap),
        DbCommand::Reset => postgres_sqlx::dangerously_recreate(pool, &MIGRATOR)
            .await
            .map_err(Error::wrap),
        DbCommand::Truncate => Ok(postgres_sqlx::truncate(pool, ips_service::store::TABLES).await?),
        DbCommand::Status => {
            for migration in postgres_sqlx::status(pool, &MIGRATOR).await? {
                let mark = if migration.applied {
                    "applied"
                } else {
                    "pending"
                };
                println!("{mark}\t{}\t{}", migration.version, migration.description);
            }
            Ok(())
        }
    }
}
