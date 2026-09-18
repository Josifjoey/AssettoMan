# AGENTS.md — AssettoMan

Web app that manages Assetto Corsa / ACC dedicated game servers on unraid.

## Stack

- Frontend: React 18 + Vite + TypeScript + Tailwind (port 5176 dev, proxies `/api` + `/downloads` → :3010)
- Backend: Node ESM + Express (`server/src/`), SQLite via `sqlite`+`sqlite3` (WAL), JWT cookie auth (`am_token`), bcryptjs
- Game servers: NOT run by this app directly — managed as **sibling Docker containers** (ich777 unraid images) via `/var/run/docker.sock` + dockerode

## Layout

- `server/src/paths.js` — `DATA_DIR` (container-side data root) ↔ `HOST_DATA_DIR` (host path used when creating bind mounts for game containers). Critical mapping — game containers bind host paths.
- `server/src/docker.js` — dockerode wrapper + `buildContainerSpec()` per type
- `server/src/configAc.js` — writes `serverfiles/cfg/server_cfg.ini` + `entry_list.ini`; `listInstalledContent()` scans `content/cars|tracks`
- `server/src/configAcc.js` — writes `acc/cfg/*.json` (settings/event/eventRules/assistRules/entrylist/bop/configuration)
- `server/src/constants.js` — ACC tracks/car-model IDs/defaults, AC defaults, image names, default ports
- `server/src/status.js` — cached live status; AC queried via HTTP `/INFO` on its HTTP port (container IP → GAME_HOST → host.docker.internal); ACC = container state + track from cfg
- `server/src/routes/` — auth, accounts (admin-only), servers, content (mod zip upload/extract via yauzl), public (unauth), system

## Conventions

- IDs `crypto.randomUUID()`, timestamps ISO-8601, booleans as INTEGER 0/1
- Secrets (steam creds) stored server-side, masked `•••` on read, never persisted back over real values
- Server types: `ac` | `ac_modded` | `acc`. ac_modded shares the steamcmd image; only difference is mod content management
- ACC needs `accServer.exe` manually dropped into `<data_dir>/acc/`; AC needs Steam creds env (USERNAME/PASSWRD, Guard disabled)
- DB migrations: additive only, `CREATE TABLE IF NOT EXISTS`
- Don't let edits to a *running* server's config through — API returns 409; UI disables forms

## Commands

- `npm run build` — tsc + vite build (verification gate)
- `node --check server/src/*.js server/src/routes/*.js` — server syntax check
- `npm run server:dev` / `npm run dev` — dev servers
- Docker image built by `.github/workflows/docker-publish.yml` → `ghcr.io/josifjoey/assettoman`
- unraid template: `assettoman-unraid-template.xml` (docker.sock mount + `HOST_DATA_DIR` are required)
