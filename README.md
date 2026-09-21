# AssettoMan

Web-based manager for Assetto Corsa & Assetto Corsa Competizione dedicated servers, built for unraid. It creates and controls game server containers (via the proven [ich777](https://github.com/ich777) unraid images), writes their config files, hosts mod downloads, and serves a public community page.

## Features

- **First-run setup** — create the admin account on first login; admins can add **manager** accounts that can run/configure servers but can't manage accounts
- **Four server types**
  - **Assetto Corsa** — vanilla dedicated server via `ghcr.io/ich777/steamcmd:assettocorsa` (SteamCMD, needs a Steam account with Guard disabled)
  - **Assetto Corsa Modded** — same server plus mod car/track zips you upload; auto-extracted into `content/`, optionally published as public downloads
  - **Assetto Corsa — AssettoServer** — `compujuckel/assettoserver` (Docker Hub, no Steam needed) or local `AssettoServer.exe`; serves `cm_content/content.json` to Content Manager, plus AI traffic / WeatherFX / Steam auth via `extra_cfg.yml`. Local: extract `assetto-server-win-x64.zip` into `serverfiles/` so `AssettoServer.exe` sits next to `cfg/`
  - **ACC** — via `ghcr.io/ich777/accompetizione-server` (Wine; drop `accServer.exe` from the Steam "ACC Dedicated Server" tool into `acc/`)
- **Full config UIs** — every ACC `cfg/*.json` file (settings, event incl. session list, eventRules, assistRules, entrylist, bop) and AC `server_cfg.ini` + `entry_list.ini` (sessions, dynamic track, weather slots, assists, penalties)
- **At-a-glance status** — running/stopped, live track, player count (AC via its HTTP API), start/stop/restart, container logs, file browser
- **Live timing** — `/admin/live` for staff (server picker, map, timing tower, per-car detail, admin controls) and `/live` for the public (same picker, spectator view). Powered by the AC UDP plugin protocol
- **Content metadata** — "Import names, images & maps" copies ui/previews/track maps from a local AC install (`ac_install_path` in Settings, auto-detected); car/track images also fall back to external content links' preview images (e.g. an Assetto World page) when files aren't installed
- **Public page** (site root `/`, no login) — live server cards, how-to-join, rules, car/track mod downloads
- **Audit log**, JWT cookie auth, SQLite (WAL) — zero external services

## Architecture

```
┌──────────────────────────────────────────────┐
│ AssettoMan container (this repo)             │
│  React UI + Express API + SQLite             │
│  /var/run/docker.sock ──────────────┐        │
└─────────────────────────────────────┼────────┘
                                      │ creates / controls
        ┌─────────────────────────────▼──────────────────────────┐
        │  sibling game containers (ich777 images)               │
        │  steamcmd:assettocorsa · accompetizione-server          │
        │  bind-mounted back into /app/server/data/servers/<id>  │
        └─────────────────────────────────────────────────────────┘
```

The manager writes configs into `DATA_DIR/servers/<id>/…`, then bind-mounts the **host** equivalent (`HOST_DATA_DIR`) into each game container it creates through the Docker socket.

## Running on unraid

1. Push this repo to GitHub — the workflow publishes `ghcr.io/<you>/assettoman:latest`
2. Install via Community Apps / `assettoman-unraid-template.xml`, or `docker run`:

```bash
docker run -d --name AssettoMan \
  -p 3010:3010 \
  -v /mnt/user/appdata/assettoman/data:/app/server/data \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e HOST_DATA_DIR=/mnt/user/appdata/assettoman/data \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  ghcr.io/josifjoey/assettoman:latest
```

3. Open `http://<unraid>:3010` → create the admin account → New Server → Provision → Start.

**Ports to forward for games** (UDP+TCP): AC `9600` (+`8081` TCP for status), ACC `9201` — or whatever you set per-server.

## Cloudflare Tunnel

- ✅ Web UI: `assetto.eclipx.io` → tunnel to `http://<unraid>:3010` works fine (also set `COOKIE_SECURE=true`)
- ❌ Game traffic: public-hostname tunnels carry HTTP/TCP only — AC/ACC need **UDP**, so keep the game port forwards (or look at Cloudflare Spectrum, which is paid)

Recommended hybrid: tunnel for the manager + public page, port-forward only the game ports.

## Run on Windows (no Docker / no unraid)

The backend serves the built UI itself, so it's a single process:

```bat
npm install && cd server && npm install && cd ..
npm run build
npm run server     :: UI + API on http://localhost:3010
```

(or just run `start-windows.bat`, which does all of this)

Then in **New Server → Runtime → Local**:

| Type | Put the exe at |
|---|---|
| `ac` / `ac_modded` | `<data>/servers/<id>/serverfiles/acServer.exe` (+ `content/` folders) |
| `assettoserver` | `<data>/servers/<id>/serverfiles/AssettoServer.exe` (from `assetto-server-win-x64.zip`) |
| `acc` | `<data>/servers/<id>/acc/accServer.exe` |

The game process runs detached with its console output appended to
`<data>/servers/<id>/run/console.log` and a `run.pid` file — so it keeps
running if you restart the manager, and the manager still shows status/logs
and can stop it (taskkill by PID, verified by exe name to avoid PID reuse).
Live telemetry works on localhost — no forwarding needed.

## Development

```bash
npm install && cd server && npm install && cd ..
npm run start:all   # vite :5176 (proxy → :3010) + server :3010
```

Env vars: `PORT`, `DATA_DIR`, `HOST_DATA_DIR`, `DOCKER_SOCKET`, `JWT_SECRET`, `GAME_HOST`, `COOKIE_SECURE`, `FRONTEND_URL`, `PLUGIN_ADDRESS`.

- `PLUGIN_ADDRESS` (optional): overrides the address AC servers send UDP telemetry to. By default the manager auto-detects its own bridge IP — in Docker mode the sibling game container sends UDP packets straight to the manager's bridge IP, so no extra published port is needed.

## Notes

- Steam credentials for AC are stored server-side in SQLite and never sent to clients (returned masked).
- AC needs a Steam account (any account, no game ownership required) with **Steam Guard disabled** for SteamCMD.
- ACC needs `accServer.exe` copied from the Steam "Assetto Corsa Competizione Dedicated Server" tool — put it in `<data>/servers/<id>/acc/`.
- Mod zips are extracted with layout detection: `content/cars/…`, `cars/…`, or bare folders all work; zip-slip paths are dropped.
- The manager writes `serverfiles/cfg/cm_content/content.json` (download links for cars/track) for Content Manager. Vanilla acServer does not serve that file to CM — use the **AssettoServer** type (EnableServerDetails) or CM's server wrapper. The public page's download links work regardless.
- AC live telemetry uses the acServer UDP plugin protocol (`UDP_PLUGIN_LOCAL_PORT` / `UDP_PLUGIN_ADDRESS`, auto-written at start). `PLUGIN_ADDRESS` overrides the address servers send events to.
