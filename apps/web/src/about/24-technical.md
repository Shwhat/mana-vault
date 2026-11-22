# Technical

## Architecture

| Part | Technology |
|---|---|
| Interface | React and TypeScript, built with Vite into static files |
| Server | Node.js 22 with Fastify, serving the interface and a JSON API |
| Database | SQLite (built into Node.js), one file in the data folder |
| Card data | Scryfall Default Cards, All Cards (other card languages), Art Tags, Oracle Tags and rulings bulk files, read as streams, and Scryfall's set list, set symbols, symbol list, migrations, catalogs and card back. The full record of every printing is kept gzip-compressed in the database |
| SVG symbols | Set symbols (Scryfall's and uploaded ones) are cleaned on the server: scripts, event handlers, outside links and embedded pages are removed, and they are sent with a content security policy that allows no scripts |
| Card pictures | Downloaded from cards.scryfall.io into the picture folder, six at a time, keyed by Scryfall's picture address and its change stamp. Every picture address the server sends is rewritten to /pictures/, which sends the saved file or redirects to Scryfall |
| Server backups | SQLite VACUUM INTO a new file; a restore is put in place when the server starts again |
| Card text recognition | Tesseract.js with the English model, running in the browser; its files are served by Mana Vault from /ocr. In the Android app, Google ML Kit text recognition on the phone |
| Receipts | The server reads PDF receipts with pdf.js (pdfjs-dist) and pictures with Tesseract.js, using the same model files served from /ocr. Receipts are kept in the database with their entry |
| App updates | /api/app/latest gives the server's version and /api/app/apk the app for it, which the server fetches once from the GitHub release and keeps in the data folder (apk) |
| Scan matching | The server compares the text read from a card with every card name (edit distance over a three-letter index) and with set codes and collector numbers |
| Sign-in | PBKDF2-SHA256 password hashes (600,000 rounds), HTTP-only session cookie, request safety header on every change |
| Container | Docker image for amd64 and arm64, running as user 65532, published to ghcr.io/shwhat/mana-vault |
| Android app | The same interface inside Capacitor, with a Java plugin for text recognition, encrypted settings, the background Inbox check and background sync (WorkManager), files shared in and out, and the Back button. It connects over https only. Its copy of the library is kept in IndexedDB |
| Phone sign-in | A random device token per phone, sent as a Bearer token; the server stores only its SHA-256 hash. The server accepts requests from the app's page origin (https://localhost) |
| Live updates | Server-sent events on /api/events. Each change (any request that changes something) is sent to the open pages and apps of the account and of the accounts sharing a collection, deck, trade or offer with it, except the page that made it (named by its x-mana-vault-client header). A comment every 25 seconds keeps tunnels and proxies from closing the stream; the page connects again on its own. The app signs in to the stream with its device token in the address |
| Sync | Changes made offline are sent in order to /api/sync with a unique id each; the server applies each once and keeps the ids for 30 days. /api/sync/state reports a revision that changes with every change, and new offers |

## Installation

Mana Vault runs as one Docker container from the repository's docker-compose.yml. The full steps, for Dockhand and for the command line, are in the repository README. In short:

1. On the Docker host, create the data and picture folders and give them to the container's user: `sudo mkdir -p /opt/mana-vault/data /opt/mana-vault/pictures` and `sudo chown -R 65532:65532 /opt/mana-vault/data /opt/mana-vault/pictures`.
2. In Dockhand, add a Git stack for the repository with compose path docker-compose.yml, enter the variables below, and deploy.
3. Check it locally with `curl -I http://127.0.0.1:3417`, then add a route in the Cloudflare Tunnel to SERVER_IP:3417.
4. Create the first account; it is the admin, and Setup opens. Sign-up and the other server settings are in Administration.

Updating from 0.11.0 or earlier: create the picture folder above before redeploying, and remove MANAVAULT_SIGNUP and MANAVAULT_CARD_UPDATE_INTERVAL_HOURS from the stack's environment to manage them in Administration. Then run Update card database once so tags, special foils, unofficial languages and price history are filled in.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| MANAVAULT_PORT | 3417 | Host port the app is published on |
| MANAVAULT_DATA_DIR | /opt/mana-vault/data | Host folder for the database, owned by 65532:65532 |
| MANAVAULT_PICTURES_HOST | /opt/mana-vault/pictures | Host folder for card pictures, owned by 65532:65532. Can be on another drive |
| MANAVAULT_PICTURES_DIR | /pictures (set by docker-compose.yml) | The picture folder inside the container. Locks the picture folder in Administration |
| MANAVAULT_BACKUP_DIR | Empty (the backups folder in the data folder) | Folder for whole-server backups. Locks the backup folder in Administration |
| MANAVAULT_SIGNUP | Empty | open, invite or closed (on and off also work). Empty means it is set in Administration. Locks Sign-up |
| MANAVAULT_SECURE_COOKIE | Empty (auto) | auto marks the session cookie secure for HTTPS requests (including through Cloudflare Tunnel); always or never force it |
| MANAVAULT_CARD_UPDATE_INTERVAL_HOURS | Empty (168 in Administration) | Hours between automatic card database updates, 0 to 8760; 0 turns them off. Locks Update every |
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
- Card pictures not downloaded to the server need internet access to Scryfall's image servers.
- Prices are as old as the last card database update. Price history has one entry per day a price changed, from the first update with 0.12.0.
- Only English printings and Scryfall's unofficial languages are kept; official translations are not.
- The server update check reads GitHub's release list; installing an update is done in Dockhand.
- Trades are with accounts on the same server. A trade sent to another account cannot be undone once accepted.
- A copy fills one deck card at a time; decks from other accounts never use your copies.
- Power, toughness, two-faced rules text and rulings arrive with the first card database update after installing 0.6.0.
- The scanner's live camera needs HTTPS or a local address (in the browser).
- In the Android app without a connection, searches by art tags and Oracle tags (`art:`, `otag:`) need the server.
- Removed deck links are kept for 60 minutes, so undo of a remove can link the copies again; after that, undo puts the cards back as missing.
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
| pdf.js (pdfjs-dist) | Reading PDF receipts on the server | Apache 2.0 |
| Crimson Pro, Merriweather Sans (@fontsource) | Card maker fonts, bundled with the interface | SIL Open Font License 1.1 |
| Google ML Kit text recognition | Card text recognition in the Android app | ML Kit terms of service |
| AndroidX (AppCompat, WorkManager, Security) | Android app | Apache 2.0 |
| Fastify, @fastify/static | Web server | MIT |
| Scryfall data and pictures (Art Tags and Oracle Tags included) | Card data, tags, prices and card pictures | Scryfall's API terms; card pictures are by Wizards of the Coast |
| csv-parse | Reading CSV files | MIT |
| stream-json, stream-chain | Reading the card catalog | BSD 3-Clause |
| Scryfall data | Card information and images | Scryfall data is provided under its own terms. Mana Vault is not produced by or endorsed by Scryfall or Wizards of the Coast |
