# AssettoMan

Web-based manager for Assetto Corsa & Assetto Corsa Competizione dedicated servers, built for unraid. It creates and controls game server containers (via the proven [ich777](https://github.com/ich777) unraid images), writes their config files, hosts mod downloads, and serves a public community page.

## Features

- **First-run setup** — create the admin account on first login; admins can add **manager** accounts that can run/configure servers but can't manage accounts
- **Three server types**
  - **Assetto Corsa** — vanilla dedicated server via `ghcr.io/ich777/steamcmd:assettocorsa` (SteamCMD, needs a Steam account with Guard disabled)
  - **Assetto Corsa Modded** — same server plus mod car/track zips you upload; auto-extracted into `content/`, optionally published as public downloads
  - **ACC** — via `ghcr.io/ich777/accompetizione-server` (Wine; drop `accServer.exe` from the Steam "ACC Dedicated Server" tool into `acc/`)
- **Full config UIs** — every ACC `cfg/*.json` file (settings, event incl. session list, eventRules, assistRules, entrylist, bop) and AC `server_cfg.ini` + `entry_list.ini` (sessions, dynamic track, weather slots, assists, penalties)
- **At-a-glance status** — running/stopped, live track, player count (AC via its HTTP API), start/stop/restart, container logs, file browser
- **Public page** (`/public`, no login) — live server cards, how-to-join, rules, car/track mod downloads
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
- The manager writes `serverfiles/cfg/cm_content/content.json` (download links for cars/track) for Content Manager. Vanilla acServer does not serve that file to CM — it is picked up when the server runs via AssettoServer or CM's server wrapper. The public page's download links work regardless.
- AC live telemetry uses the acServer UDP plugin protocol (`UDP_PLUGIN_LOCAL_PORT` / `UDP_PLUGIN_ADDRESS`, auto-written at start). `PLUGIN_ADDRESS` overrides the address servers send events to.
