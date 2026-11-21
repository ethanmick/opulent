# minimal-electron-bsql

A bare-bones Electron + TypeScript + [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) app.  
No forge, no boilerplate, no scaffolding. Just the absolute minimum setup that:

- Runs in dev mode on macOS/Linux/Windows
- Uses `better-sqlite3` from the **main process**
- Creates a SQLite DB at startup, inserts + selects a row
- Displays a trivial HTML UI
- Can be packaged for distribution (SQLite included)

---

## Project structure

```
minimal-electron-bsql/
├── src/
│ └── main/
│ └── index.ts # Electron main process
├── renderer/
│ └── index.html # Minimal UI
├── package.json
├── tsconfig.json
```

## Requirements

- Node.js ≥ 22.12
- pnpm 10 (`corepack enable` picks up the pinned version)
- macOS, Windows or Linux on x64 or arm64. No native toolchain is needed: `better-sqlite3` ships N-API prebuilds for these platforms.

---

## Install

```bash
git clone <this-repo>
cd minimal-electron-bsql
pnpm install
```

ℹ️ Since v13, `better-sqlite3` uses N-API, so its bundled prebuilt binary loads in any Electron version. There is no `electron-rebuild` step. The Electron binary itself downloads on the first `electron` run.

⸻

Scripts

- pnpm dev → compile TS and start Electron in dev mode
- pnpm build → compile TypeScript only
- pnpm start → start Electron with compiled code
- pnpm dist → create distributable builds via electron-builder
- pnpm run pack → package into unpacked app directory

## What happens on startup

In src/main/index.ts:

1. Database file created at app.getPath('userData')/app.db
2. A table messages is created (if not exists)
3. One row "hello from better-sqlite3" is inserted
4. A SELECT runs and the row is logged to console
5. Window shows renderer/index.html → just <main>hi</main>

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
