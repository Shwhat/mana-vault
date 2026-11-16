# mana-vault

A self-hosted, local-first Magic: The Gathering collection manager focused on deck building.

## Current status

The working app includes card search, collection tracking, deck creation with Normal and Theme modes, and CSV collection import. The card catalog must still be loaded from Scryfall.

## Run locally

Requirements: Node.js 22.5 or newer.

```powershell
npm.cmd install
npm.cmd run dev:server
```

In a second terminal:

```powershell
npm.cmd run dev:web
```

Open the Vite URL shown in the second terminal (normally `http://localhost:5173`).

The server stores its SQLite database at `data/mana-vault.sqlite` by default. Override this with `DATABASE_PATH` if needed. The `data/` folder is ignored by Git.
The API listens on `127.0.0.1` by default. Set `HOST=0.0.0.0` only when you intentionally want to accept connections from your trusted local network; there is no login yet.

## Use on an Android phone

Mana Vault is an installable web app. Open its HTTPS address in Chrome on Android, open the browser menu, and choose **Install app** or **Add to Home screen**. The app includes Android-sized home-screen icons and a camera scanner that can use the rear/front camera or scan a photo selected from the phone.

The browser requires HTTPS for camera access, except on `localhost`. The local Docker Compose setup binds only to the computer itself, so a phone cannot reach it by default. Do not expose this unauthenticated app to the public internet; only make it reachable to trusted users through a private, HTTPS-protected setup. The API and database must remain reachable while using the installed app; the PWA shell does not provide offline collection access.

## Load the card catalog

From the repository root, run:

```powershell
npm.cmd run import:cards --workspace=@mana-vault/server
```

This reads the current `default_cards` URL from Scryfall's bulk-data metadata, downloads the compressed JSONL feed, decompresses it as a stream, and imports one record at a time into SQLite. Cards without a top-level type line use the available card-face type lines, or an empty type line if Scryfall omits both. The prior uncompressed JSON-array feed is still accepted for compatibility. Download progress and periodic import counts are printed to the console. To refresh the catalog later, run:

```powershell
npm.cmd run update:cards
```

You can also select **Cards → Update card database** in the app. The server downloads and imports the latest catalog in the background; the app shows when it is running and reports failures. Refreshes update existing card records in place and preserve collection quantities and decks. The catalog status and last successful refresh time appear in the sidebar. To opt in to an automatic refresh, set `CARD_UPDATE_INTERVAL_HOURS` to a whole number from `1` to `8760` before starting the server; for example, `168` refreshes weekly. The default `0` disables scheduled refreshes. The first scheduled refresh runs after the configured interval, so load the catalog once manually first. The download needs internet access and enough disk space for the compressed download, expanded JSONL file, and database. Set `SCRYFALL_DATA_PATH` or `DATABASE_PATH` to choose different locations.

The container image includes the same importer as `node apps/server/dist/import-cards.js`. In the container, the default database and downloaded/decompressed bulk data both live under `/data`.

## Included features

- Search card names, types, and rules text; filter by color, type, set, rarity, format legality, and mana value
- Use common Scryfall-style filters such as `t:dragon c:red mv>=4`, `o:draw`, `set:lea`, `r:rare`, and `legal:commander` (filters combine with AND)
- Track quantities per printing, including foil copies
- Refresh the local card catalog from the app; scheduled refreshes are optional
- Import Moxfield-style collection CSVs using card name, set/edition, collector number, count, and foil
- Preview collection CSV and decklist matches before choosing to import; unmatched rows are listed for review. Theme decks require an exact set and collector number.
- Create Normal decks (printing-independent) or Theme decks (printing-specific)
- Add and remove cards from decks
- Export collections and decks as CSV; export decks as plain text
- Download and restore a JSON backup of your collection, decks, and the card printings those records need. Backups are validated and summarized before you confirm a restore. Restore replaces the current collection and decks; it does not include the full Scryfall catalog.
- Scan a card with a desktop or phone camera; in-browser OCR suggests a name search that you confirm before adding a printing
- Compact, responsive interface with light and dark themes
- Installable PWA shell; the card database and API still require the server to be reachable

## Still to come

- Full Scryfall search syntax (for example OR groups), other site-specific CSV layouts, and art-theme search
- Offline card data and more advanced camera identification
- Authentication

The app does not have authentication yet. Keep it on a trusted network; do not expose it directly to the public internet.
Camera access requires HTTPS except on `localhost`. The first OCR scan downloads the English recognition model from the Tesseract model host; live camera frames and selected photos are processed in the browser and are not uploaded to Mana Vault.

## Container image

Every push to `main` builds and publishes `ghcr.io/shwhat/mana-vault:latest` for both `linux/amd64` and `linux/arm64`. Version tags also publish matching image tags. The image contains the API and built web app; mount `/data` persistently for the SQLite database and Scryfall bulk file. Set the GitHub Container Registry package visibility to public if the server should pull without registry credentials.

## Local Docker deployment

Docker Compose builds the image locally, persists the database and card catalog in a named volume, and binds the app to localhost. From the repository root:

```powershell
docker compose up -d --build
```

Open `http://localhost:3000`. To enable scheduled catalog refreshes, create a `.env` file containing `CARD_UPDATE_INTERVAL_HOURS=168` before starting Compose. The default is disabled. The service includes a health check and restarts unless stopped.

The Compose setup is intentionally localhost-only because the app has no authentication. Do not expose port 3000 to the internet or an untrusted network.

For a full recovery archive, stop the app before copying the volume so SQLite files are consistent. These PowerShell commands save the database and downloaded Scryfall data together; protect the resulting archive because it contains your collection and decks:

```powershell
docker compose stop app
docker run --rm -v mana-vault-data:/data -v "${PWD}:/backup" alpine tar -czf /backup/mana-vault-data.tar.gz -C /data .
docker compose start app
```

Restore a full archive with the app stopped:

```powershell
docker compose stop app
docker run --rm -v mana-vault-data:/data -v "${PWD}:/backup" alpine tar -xzf /backup/mana-vault-data.tar.gz -C /data
docker compose start app
```

The in-app JSON backup is another option for moving collection and deck records, but it does not include the complete card catalog. Keep backups off the host and verify they are readable before relying on them.

## Development checks

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Data and secrets

Collection data and card database files stay outside Git in `data/`. Do not commit `.env` files, credentials, backups, or collection exports.
