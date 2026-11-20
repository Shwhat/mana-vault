# Technical

## Architecture

| Part | Technology |
|---|---|
| Interface | React and TypeScript, built with Vite into static files |
| Server | Node.js 22 with Fastify, serving the interface and a JSON API |
| Database | SQLite (built into Node.js), one file in the data folder |
| Card data | Scryfall Default Cards bulk data and the rulings file, read as streams |
| Card text recognition | Tesseract.js with the English model, running in the browser; its files are served by Mana Vault from /ocr. In the Android app, Google ML Kit text recognition on the phone |
| Scan matching | The server compares the text read from a card with every card name (edit distance over a three-letter index) and with set codes and collector numbers |
| Sign-in | PBKDF2-SHA256 password hashes (600,000 rounds), HTTP-only session cookie, request safety header on every change |
| Container | Docker image for amd64 and arm64, running as user 65532, published to ghcr.io/shwhat/mana-vault |
| Android app | The same interface inside Capacitor, with a Java plugin for text recognition, encrypted settings, the background Inbox check (WorkManager), file sharing and the Back button. Its copy of the library is kept in IndexedDB |
| Phone sign-in | A random device token per phone, sent as a Bearer token; the server stores only its SHA-256 hash. The server accepts requests from the app's page origin (https://localhost) |
| Sync | Changes made offline are sent in order to /api/sync with a unique id each; the server applies each once and keeps the ids for 30 days. /api/sync/state reports a revision that changes with every change, and new offers |

## Installation

Mana Vault runs as one Docker container from the repository's docker-compose.yml. The full steps, for Dockhand and for the command line, are in the repository README. In short:

1. On the Docker host, create the data folder and give it to the container's user: `sudo mkdir -p /opt/mana-vault/data` and `sudo chown -R 65532:65532 /opt/mana-vault/data`.
2. In Dockhand, add a Git stack for the repository with compose path docker-compose.yml, enter the variables below, and deploy.
3. Check it locally with `curl -I http://127.0.0.1:3417`, then add a route in the Cloudflare Tunnel to SERVER_IP:3417.
4. Sign in, create the first account, then set MANAVAULT_SIGNUP to off if no one else should create accounts.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| MANAVAULT_PORT | 3417 | Host port the app is published on |
| MANAVAULT_DATA_DIR | /opt/mana-vault/data | Host folder for the database, owned by 65532:65532 |
| MANAVAULT_SIGNUP | on | on shows Create account on the sign-in page; off turns new accounts off |
| MANAVAULT_SECURE_COOKIE | auto | auto marks the session cookie secure for HTTPS requests (including through Cloudflare Tunnel); always or never force it |
| MANAVAULT_CARD_UPDATE_INTERVAL_HOURS | 168 in docker-compose.yml, 0 otherwise | Hours between automatic card database updates, 1 to 8760; 0 turns them off |
| TZ | America/Los_Angeles | Time zone for server logs |

The image also sets HOST, PORT (3000 inside the container), DATABASE_PATH, SCRYFALL_DATA_PATH and WEB_DIST_PATH; these do not need changing.

## Updates

- GitHub Actions checks, tests and publishes a new image for every change to the main branch.
- For a version tag (vX.Y.Z), GitHub Actions also builds the Android app, signs it with the release key kept in the repository secrets, and attaches `mana-vault-X.Y.Z.apk` to the GitHub release. The app installs over the previous one only when it is signed with the same key.
- Dockhand installs new images, on a schedule or when you pull and redeploy the stack.
- Database changes needed by a new version are applied automatically when the server starts. The data folder never needs to be deleted or recreated.
- The version is shown at the top of this guide.

## Health check

The container checks itself every 30 seconds by running the server with `-healthcheck`, which asks the running server for its health and reports healthy or unhealthy to Docker and Dockhand.

## Limits

- Sending is limited to accounts on the same server.
- Imports accept files up to 5 MB and 5,000 rows; backups up to 250 MB.
- Set completion needs Scryfall's set list for printed sizes; it arrives with the first card database update after installing 0.2.0.
- Card images need internet access to Scryfall's image servers.
- Prices are as old as the last card database update, and are not kept over time.
- Trades are with accounts on the same server. A trade sent to another account cannot be undone once accepted.
- A copy fills one deck card at a time; decks from other accounts never use your copies.
- Power, toughness, two-faced rules text and rulings arrive with the first card database update after installing 0.6.0.
- The scanner's live camera needs HTTPS or a local address (in the browser).
- The Android app reads English card text, checks for offers about every 15 minutes rather than at once, and signs in to one server and account at a time.

## Third-party components

| Component | Used for | License |
|---|---|---|
| React, React DOM | Interface | MIT |
| Vite | Building the interface | MIT |
| Tesseract.js, Tesseract.js core | Card text recognition | Apache 2.0 |
| pdf-lib | Making the proxy PDF | MIT |
| fflate | Making the zip files of MakePlayingCards pictures | MIT |
| Tesseract English model (@tesseract.js-data/eng) | Card text recognition | Apache 2.0 |
| Capacitor (@capacitor/core, @capacitor/android, @capacitor/cli) | Android app | MIT |
| Google ML Kit text recognition | Card text recognition in the Android app | ML Kit terms of service |
| AndroidX (AppCompat, WorkManager, Security) | Android app | Apache 2.0 |
| Fastify, @fastify/static | Web server | MIT |
| csv-parse | Reading CSV files | MIT |
| stream-json, stream-chain | Reading the card catalog | BSD 3-Clause |
| Scryfall data | Card information and images | Scryfall data is provided under its own terms. Mana Vault is not produced by or endorsed by Scryfall or Wizards of the Coast |
