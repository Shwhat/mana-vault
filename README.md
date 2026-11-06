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

## Load the card catalog

From the repository root, run:

```powershell
npm.cmd run import:cards --workspace=@mana-vault/server
```

This reads the current `default_cards` URL from Scryfall's bulk-data metadata, downloads the compressed JSONL feed, decompresses it as a stream, and imports one record at a time into SQLite. The prior uncompressed JSON-array feed is still accepted for compatibility. Download progress and periodic import counts are printed to the console. To refresh the catalog later, run:

```powershell
npm.cmd run update:cards
```

Refreshes update existing card records in place and preserve collection quantities and decks. The catalog status and last successful refresh time appear in the sidebar. The download needs internet access and enough disk space for the compressed download, expanded JSONL file, and database. Set `SCRYFALL_DATA_PATH` or `DATABASE_PATH` to choose different locations.

The container image includes the same importer as `node apps/server/dist/import-cards.js`. In the container, the default database and downloaded/decompressed bulk data both live under `/data`.

## Included features

- Search card names, types, and rules text; filter by color, type, set, rarity, format legality, and mana value
- Use common Scryfall-style filters such as `t:dragon c:red mv>=4`, `o:draw`, `set:lea`, `r:rare`, and `legal:commander` (filters combine with AND)
- Track quantities per printing, including foil copies
- Import Moxfield-style collection CSVs using card name, set/edition, collector number, count, and foil
- Import decklists from common text formats and CSVs with name, quantity, printing, and board/zone columns; unmatched rows are listed for review. Theme decks require an exact set and collector number.
- Create Normal decks (printing-independent) or Theme decks (printing-specific)
- Add and remove cards from decks
- Export collections and decks as CSV; export decks as plain text
- Download and restore a JSON backup of your collection, decks, and the card printings those records need. Restore replaces the current collection and decks; it does not include the full Scryfall catalog.
- Scan a card with a desktop or phone camera; in-browser OCR suggests a name search that you confirm before adding a printing
- Compact, responsive interface with light and dark themes
- Installable PWA shell; the card database and API still require the server to be reachable

## Still to come

- Full Scryfall search syntax (for example OR groups), other site-specific CSV layouts, and art-theme search
- Automatic/scheduled card catalog updates; refreshes are started manually
- Offline card data and more advanced camera identification
- Authentication

The app does not have authentication yet. Keep it on a trusted network; do not expose it directly to the public internet.
Camera access requires HTTPS except on `localhost`. The first OCR scan downloads the English recognition model from the Tesseract model host; the camera image is processed in the browser and is not uploaded to Mana Vault.

## Container image

Every push to `main` builds and publishes `ghcr.io/shwhat/mana-vault:latest` for both `linux/amd64` and `linux/arm64`. Version tags also publish matching image tags. The image contains the API and built web app; mount `/data` persistently for the SQLite database and Scryfall bulk file. Set the GitHub Container Registry package visibility to public if the server should pull without registry credentials.

## Development checks

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Data and secrets

Collection data and card database files stay outside Git in `data/`. Do not commit `.env` files, credentials, backups, or collection exports.
