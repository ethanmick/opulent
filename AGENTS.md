# Data modelling

- Any value that changes over time is stored as timeseries data: one row per observation, in its own table, keyed by the entity and the time the value applies to (e.g. `account_values`).
- Entity tables (e.g. `accounts`) hold only stable attributes: identity and facts that do not vary over time.
- The current value of anything is derived by querying the latest observation. Never store it on the entity row.

# Database layer

- SQLite runs only on worker threads, reached through the client in `src/main/db/client.ts`. Never open a connection on the main thread, and never add a second writer.
- Every operation is declared in `src/shared/contract.ts`. SQL lives only in `src/main/db/queries/`.
- A write is one named operation that runs as one transaction. Do not split a logical change across several calls.
- Migrations in `src/main/db/migrations/` are append-only. Never edit or reorder one that has shipped.
- Money is stored as an integer count of the currency's minor unit. Instants are stored as canonical UTC text (`YYYY-MM-DDTHH:MM:SS.sssZ`).
