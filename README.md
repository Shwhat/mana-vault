# mana-vault

A self-hosted, local-first Magic: The Gathering collection manager focused on deck building.

## Current status

The first working slice includes card search, collection tracking, and deck creation with Normal and Theme modes. The app code is local; it does not include Scryfall's card database.

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

This downloads Scryfall's `default_cards` bulk file (a large download) and streams card printings into the local SQLite database. It needs internet access and enough disk space for both the downloaded JSON and database. Set `SCRYFALL_DATA_PATH` or `DATABASE_PATH` to choose different locations.

## Included features

- Search card names, types, and rules text; filter by color, type, and set
- Track quantities per printing, including foil copies
- Create Normal decks (printing-independent) or Theme decks (printing-specific)
- Add and remove cards from decks
- Export collections and decks as generic CSV; export decks as plain text
- Compact, responsive interface with light and dark themes
- Installable PWA shell; the card database and API still require the server to be reachable

## Not built yet

- Full Scryfall search syntax, more filters, and art-theme search
- Import from deck and collection files; site-specific CSV layouts
- Card database updates and backup/restore workflows
- Offline card data and camera scanning
- Authentication, Docker packaging, and deployment setup

The app does not have authentication yet. Keep it on a trusted network; do not expose it directly to the public internet.

## Development checks

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Data and secrets

Collection data and card database files stay outside Git in `data/`. Do not commit `.env` files, credentials, backups, or collection exports.
