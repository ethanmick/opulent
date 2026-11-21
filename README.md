# opulent

A bare-bones Electron + TypeScript + [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) app.  
No forge, no boilerplate, no scaffolding. Just the absolute minimum setup that:

- Runs in dev mode on macOS/Linux/Windows
- Runs SQLite on worker threads: one writer, several readers
- Displays a trivial React UI
- Can be packaged for distribution (SQLite included)

---

## Project structure

```
src/
├── shared/            # imported by main, preload (types only) and renderer
│   ├── accounts.ts    # account kinds and record types
│   └── contract.ts    # every database operation: mode, tables, input schema
└── main/
    ├── index.ts       # Electron main process
    ├── preload.ts     # exposes window.db
    ├── ipc.ts         # db:call handler and db:changed broadcast
    └── db/
        ├── client.ts      # routes calls to the writer or a reader thread
        ├── worker.ts      # thread entry: one SQLite connection each
        ├── migrate.ts     # versioned, forward-only migrations
        ├── migrations/
        ├── operations.ts  # operation name -> implementation
        └── queries/       # the only code that contains SQL
renderer/src/          # React UI; reads through useDbQuery
scripts/smoke.mjs      # end-to-end check against a running build
```

## Database layer

better-sqlite3 is synchronous, so it never runs on the main thread. The main
process owns a client that talks to worker threads:

- **One writer thread** holds the only read-write connection. Writes queue in
  order, and each one runs as a single transaction.
- **Two reader threads** hold read-only connections. WAL mode lets them read
  while the writer is busy.
- **Operations are named.** The renderer calls
  `window.db.call('accounts.create', input)`. The main process validates the
  input against `src/shared/contract.ts`, then sends it to the right thread.
- **Change events.** After a write commits, every window receives `db:changed`
  with the tables it touched. `useDbQuery` re-runs reads that depend on them.
- **Migrations** run in the writer before any reader opens. An existing
  database is copied to `app.db.v<N>.bak` before it is upgraded.

To add an operation: declare it in `contract.ts`, write its SQL in `queries/`,
and register it in `operations.ts`. The compiler flags whichever step is
missing.

## Requirements

- Node.js ≥ 22.12
- pnpm 10 (`corepack enable` picks up the pinned version)
- macOS, Windows or Linux on x64 or arm64. No native toolchain is needed: `better-sqlite3` ships N-API prebuilds for these platforms.

---

## Install

```bash
git clone <this-repo>
cd opulent
pnpm install
```

ℹ️ Since v13, `better-sqlite3` uses N-API, so its bundled prebuilt binary loads in any Electron version. There is no `electron-rebuild` step. The Electron binary itself downloads on the first `electron` run.

⸻

Scripts

- pnpm dev → compile TS and start Electron in dev mode
- pnpm build → compile the main process and bundle the renderer
- pnpm test → run the unit and worker-thread tests
- pnpm typecheck → type-check main, tests and renderer
- pnpm smoke dev → drive the dev build end to end (needs `pnpm dev:renderer` running)
- pnpm smoke <executable> → the same against a packaged app
- pnpm start → start Electron with compiled code
- pnpm dist → create distributable builds via electron-builder
- pnpm run pack → package into unpacked app directory

## What happens on startup

In src/main/index.ts:

1. The writer thread opens app.getPath('userData')/app.db and applies pending migrations
2. The reader threads open the same file read-only
3. The IPC handler is registered and the window opens
4. On quit, the readers close first and the writer last, which folds the write-ahead log back into app.db

⸻

Packaging notes

- Native modules: the `.node` prebuilds must live outside `app.asar`. This is handled via:

```
"asarUnpack": ["node_modules/better-sqlite3/prebuilds/*.node"]
```

- `"npmRebuild": false` stops electron-builder from compiling better-sqlite3 from source. A locally compiled `build/Release` binary takes precedence over the prebuilds, so never let one sneak in.
- `better-sqlite3`'s SQLite sources (`deps/`, `src/`) are excluded from the package; only `lib/` and `prebuilds/` are needed at runtime.
- Cross-arch builds (macOS): every build contains both `darwin-arm64.node` and `darwin-x64.node`, so any arch works:

```bash
pnpm dist --mac --arm64
pnpm dist --mac --x64
pnpm dist --mac --universal
```

- Universal builds need `mac.x64ArchFiles` to cover the darwin prebuilds, because they are identical in the x64 and arm64 halves.

- Database location: Always use app.getPath('userData'). Do not write next to your code files, since those are inside app.asar when packaged.

⸻

Common pitfalls & fixes

- `was compiled against a different Node.js version` error
  - Something compiled better-sqlite3 from source (`node_modules/better-sqlite3/build/Release/better_sqlite3.node` exists). Delete `node_modules/better-sqlite3/build` so the N-API prebuild is used.
- `.node` module not found after packaging
  - Check `asarUnpack` includes `node_modules/better-sqlite3/prebuilds/*.node`.
- Platforms without a prebuild (e.g. 32-bit)
  - better-sqlite3 falls back to compiling with node-gyp, which needs Python and a C++ toolchain.

## License

MIT
