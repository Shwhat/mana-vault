# Mana Vault

A self-hosted Magic: The Gathering collection and deck manager. Version 0.8.0.

Mana Vault runs on your own server as one Docker container and is used from a desktop browser, a phone browser (installable as a home screen app) or the Android app. It keeps a local copy of the Scryfall card catalog, your collection and your decks in one SQLite database, behind a sign-in.

The full user guide is built into the app: Help tab, **About Mana Vault**. The pages are in `apps/web/src/about`.

## Features

- Card search across every printing, with filter syntax (`t:dragon c:red mv>=4`, `o:draw`, `set:lea`, `r:rare`, `id:wubg`, `legal:commander`, `usd<1`, `eur>=20`, negation with `-`), flavor name matching and a Filters panel. Results show as a grid of card pictures (the default), binder pages or a list, with prices and owned counts, and load as you scroll with the total in the count line.
- The Filters panel filters whatever is open: card search, a collection, a deck or a search inside them, each with its own filters that stay when you switch collections or decks.
- All collections: one list of every row in every collection, with each row's collection (wishlists optional).
- The app's own choice lists on every screen, the same on desktop and phone.
- Prices from Scryfall (USD regular, foil, etched; EUR regular, foil) stored with each card database update, shown in USD or EUR, with collection and deck values and sorting by price.
- Statistics for collections and decks: stat tiles and bar charts for mana curve, color, type, rarity, finish and top sets; clicking a collection bar filters the list.
- Copy details per collection row: finish (regular, foil, etched), condition, language, proxy, the number for trade, purchase price and currency, date added, misprint, altered and signed.
- Proxies: marked everywhere, worth nothing, left out of completion, value and statistics, and able to fill a deck slot.
- Filter tags (click a set code or rarity), and three collection layouts: a grid of card pictures that loads more while scrolling (Small, Medium, Large), binder pages of nine cards sized to the window with a page box, or a list. Grid is the default; desktop and phone remember their own layout.
- One switcher for collections and decks: a searchable list with sorting (recently opened, name, date created, card count, value, format, commander), details per row and keyboard control. An Options button holds sort, layout, card size, filters and Select.
- Wishlists: collections whose cards are wanted, not owned; add a card, a set's missing cards or a deck's missing cards in one step.
- Deck ownership check: which cards you own across your collections, where they are, and the cost of the missing cards; export the missing cards as text.
- Saved trades (Open, Done, Cancelled): You give searches your cards for trade, You get searches the card database, each line with its own count, finish, condition and an editable price, and a balance bar. Complete a trade in one undoable step (deck cards are flagged, wishlist wants go down), or send it to another account with counter-offers until one side accepts. Wishlist matches both ways, copy or CSV export, and a public trade binder link that needs no sign-in.
- Any number of collections per account (binders, boxes, sets being completed), each copy in one place, with a target collection for adding (C cycles it). Every owned card is in a collection.
- Set completion (off by default for new collections): link a collection to any number of sets; count by main set, every printing or each card name once, and by any finish, regular only, foil only or one of each; Completion and Missing tabs with filters, add-from-list and text or CSV export of the missing list.
- Bulk editing: pick rows with Ctrl+click, Shift+click, Ctrl+A or Select mode; remove or move them between collections in one undoable step.
- Collection tracking per printing, regular and foil, with plus, minus, move and remove controls.
- Decks keep the exact printing, with commander, main deck, sideboard and maybeboard zones and a target zone for adding; rename and delete.
- Deck builder in the Moxfield style, with a header like the collection's (switcher, tabs, filter box, Options, count line) and an Add tab with a card search and + Main, + Side, + Maybe and + Commander buttons that show the count already in the deck: Quick add ("2 Sol Ring"), Edit as text with a check before applying, List, Text, Stacks and Grid views grouped by type, mana value, color, rarity or tag and sorted by name, mana value or price, tags on deck cards, hover previews and the tokens the deck makes.
- Format checks for 21 formats: deck and sideboard size, copies, banned and not legal cards, and commander color identity.
- Deck tabs for Playtest (opening hand, mulligan, draw, play), Description with a cover card, and History of every change; mana symbols against mana sources in deck statistics.
- Linked deck cards: each deck card is linked to a copy in a collection (one deck per copy). Collection rows show their deck, deck rows show their collection, links follow moves, and unlinked cards show as missing with a + Wishlist button. Cards added straight to a deck go into the deck's own collection or a chosen one.
- Wishlist want counts go down as copies are added.
- Collections and decks belong to their account. Send them to another account as a copy, a share (both edit) or a transfer; the receiver accepts from an Inbox as a new item or, for collections, merged into one of theirs.
- Undo and redo for collection and deck edits (150 steps).
- Import window: Mana Vault, Moxfield, ManaBox, Archidekt, Deckbox, TCGplayer or plain text, detected from the file and changeable, into a chosen or new collection, and decklist import (text or CSV), each with a preview and an Import review panel for skipped rows.
- Export window: the whole collection, filtered cards, selected cards, missing cards or a deck, in any of the import formats.
- JSON backup and restore of the signed-in account's own collections and decks and the card records they use.
- Card database updates from Scryfall on demand or on a schedule, including the set list (printed sizes), each printing's finishes, power and toughness, and rulings.
- Card page: art, rules text, power and toughness, every version with its market price, and rulings (offline in the app too), with a card actions button.
- Live camera card scanner: scans continuously, finds the exact printing from the set code and collector number (or the card name, with tolerance for reading mistakes), collects cards in a scanned list with edit, +1 and finish controls, and adds the list to a collection or deck as one undo step. Text recognition runs in the browser with files served by Mana Vault, so it works offline. Settings for quick mode, sounds, camera, proxies, a set filter (any number of sets, with chips on the camera screen and a Not in set warning), ignoring promos, preferring foil, total value and copies owned. A printing picker when more than one printing fits, a strip for finish, condition and language, and an Add to window that can create a new collection or deck. Phone Scan tab; desktop scanner window.
- Sign-in with accounts, password changes, 30-day sessions and protection against password guessing. New accounts can be turned off.
- Desktop interface in the OpenSchem style: title bar, customizable ribbon (the only menu) with deck and collection commands added to their tabs when one is open, large, compact or icons-only buttons, right-click menus on rows, dockable and floating panels (Filters, Collections, Decks, Card, Deck list, Import review) that dock and snap together, panel tabs that wrap, saved workspaces, status bar and light, dark or system theme.
- Phone layout with a Home screen, bottom tabs (Home, Search, Collection, Decks, Scan), a nested top-right menu, long-press menus on rows, full-screen sheets and 44 pixel touch targets.
- Preferences (theme, foil, target zone, target and open collection, currency, collection sort, layout and card size, switcher sorting and recently opened items, deck view, groups and sort, ribbon, panels, workspaces, last deck) saved per account on the server.
- Android app (Android 8.0 or newer, APK on the GitHub releases page): every phone feature, sign-in per phone with a device list, offline use of collections, decks, card search and scanning (including new collections and decks) with sync when the connection returns and a Sync now button, the phone's own text recognition for scanning, and notifications for new Inbox offers.
- Built-in About guide with release notes.

## Keyboard shortcuts

| Key | Action |
|---|---|
| / | Find card |
| 1, 2, 3, 4 | Card search, collection, deck, trade view |
| Up, Down | Previous or next row |
| Enter | Add the selected card to the collection |
| Shift+Enter | Add the selected card to the open deck |
| F | Switch Add as foil |
| Z | Cycle the target zone |
| C | Cycle the target collection |
| W | Add the selected card to the wishlist |
| E | Copy details of the selected collection row |
| B | Switch the collection between binder and grid |
| Page Up, Page Down | Previous or next binder page |
| T | Add the selected collection row to the trade (you give) |
| G | Add the selected card to the trade (you get) |
| Ctrl+A | Pick every row the collection filter shows |
| Ctrl+click, Shift+click | Pick more rows, or a range |
| Delete | Remove the picked collection rows |
| Ctrl+Z, Ctrl+Y (or Ctrl+Shift+Z) | Undo, redo |
| Ctrl+N, Ctrl+O | New deck, open deck |
| Q | Go to Quick add in the open deck |
| Esc | Close the window, menu or About guide, or clear the selection |

## Install with Dockhand

Mana Vault is published as `ghcr.io/shwhat/mana-vault:latest` (amd64 and arm64) by GitHub Actions on every push to `main`. The GitHub package must be public, or Dockhand needs registry credentials for ghcr.io.

**1. On the Docker host**, check the port is free (no output means free), then create the data folder for the container's user (UID 65532):

```bash
sudo ss -ltnp | grep ':3417 '
sudo mkdir -p /opt/mana-vault/data
sudo chown -R 65532:65532 /opt/mana-vault/data
```

**2. In Dockhand**, add a Git stack:

- Repository: `https://github.com/Shwhat/mana-vault`
- Compose path: `docker-compose.yml`
- Environment variables: the ones in `.env.example` (see Configuration below). Change `MANAVAULT_PORT` if 3417 is taken.

Deploy the stack and check its logs for `Server listening`.

**3. On the Docker host**, confirm it answers locally:

```bash
curl -I http://127.0.0.1:3417
```

A `302` redirect to `/login` means it is running.

**4. In the Cloudflare Tunnel** (on its own LXC), add a public hostname that points to `http://SERVER_IP:3417`. No `cloudflared` or reverse proxy is needed in this stack. The session cookie is marked secure automatically for HTTPS requests through the tunnel.

**5. In the browser**, open the address, choose **Create account**, then load the card catalog with **Database**, **Update card database**. When updating an existing install to 0.2.0, run Update card database once so set completion gets printed sizes and finishes. When everyone who needs an account has one, set `MANAVAULT_SIGNUP=off` in Dockhand and redeploy.

## Automatic updates

In Dockhand, turn on automatic image updates for the `app` container with a schedule (for example weekly). Dockhand pulls each new image published by GitHub Actions and recreates the container; the data folder is kept. Optionally turn on Git auto sync or a webhook for the stack so changes to `docker-compose.yml` redeploy it.

## Install from the command line

**On the Docker host:**

```bash
sudo mkdir -p /opt/mana-vault/data
cd /opt/mana-vault
sudo curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/Shwhat/mana-vault/main/docker-compose.yml
sudo curl -fsSLo .env.example https://raw.githubusercontent.com/Shwhat/mana-vault/main/.env.example
sudo cp .env.example .env
sudo nano .env
sudo chmod 600 .env
sudo chown -R 65532:65532 /opt/mana-vault/data
sudo docker compose config -q
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100
curl -I http://127.0.0.1:3417
```

## Manual update

**In Dockhand:** pull and redeploy the stack, then check its logs.

**On the Docker host (command line install):**

```bash
cd /opt/mana-vault
sudo cp docker-compose.yml docker-compose.yml.backup-$(date +%Y%m%d-%H%M%S)
sudo cp .env .env.backup-$(date +%Y%m%d-%H%M%S)
sudo docker compose pull
sudo docker compose up -d
sudo docker compose logs --tail=100
```

Never remove the stack together with its volumes and never run `docker compose down -v`. An update never requires deleting or recreating the data folder.

## Moving from the earlier mana-vault-data volume

Versions before 0.1.0 kept the database in a Docker volume named `mana-vault-data`, ran as a different user, and were reachable only on localhost. **On the Docker host**, with the old stack stopped, copy the data into the new folder and set its owner:

```bash
sudo mkdir -p /opt/mana-vault/data
sudo docker run --rm -v mana-vault-data:/from -v /opt/mana-vault/data:/to alpine sh -c 'cp -a /from/. /to/'
sudo chown -R 65532:65532 /opt/mana-vault/data
```

Then deploy as above. Rename `CARD_UPDATE_INTERVAL_HOURS` to `MANAVAULT_CARD_UPDATE_INTERVAL_HOURS` (the old name still works). Keep the old volume until the new install is confirmed working.

## Backup

Back up, and keep one copy off the Docker host:

- `/opt/mana-vault/data` (the database, including all accounts, collections, decks and shares). For a consistent copy, stop the stack first, or copy while the app is idle.
- The stack's environment values (in Dockhand, or `/opt/mana-vault/.env`).
- `docker-compose.yml`.

**On the Docker host:**

```bash
sudo tar -czf ~/mana-vault-backup-$(date +%Y%m%d).tar.gz -C /opt/mana-vault data
```

The in-app **Download backup** (File menu) saves the signed-in account's own collections and decks as JSON and can be restored from the app; it does not include other accounts or the full card catalog. A Docker volume is not a backup.

To restore a server backup: stop the stack, extract the archive into `/opt/mana-vault`, run `sudo chown -R 65532:65532 /opt/mana-vault/data`, and start the stack.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `MANAVAULT_PORT` | `3417` | Host port the app is published on |
| `MANAVAULT_DATA_DIR` | `/opt/mana-vault/data` | Host folder for the database, owned by 65532:65532 |
| `MANAVAULT_SIGNUP` | `on` | `on` shows Create account; `off` turns new accounts off |
| `MANAVAULT_SECURE_COOKIE` | `auto` | `auto` marks the session cookie secure for HTTPS requests, including through a proxy; `always` or `never` force it |
| `MANAVAULT_CARD_UPDATE_INTERVAL_HOURS` | `168` | Hours between automatic Scryfall updates, 1 to 8760; `0` turns them off |
| `TZ` | `America/Los_Angeles` | Time zone for logs |

The image sets `HOST`, `PORT` (3000 inside the container), `DATABASE_PATH`, `SCRYFALL_DATA_PATH` and `WEB_DIST_PATH`.

## Development

Requirements: Node.js 22.5 or newer.

```bash
npm install
npm run dev:server     # API on 127.0.0.1:3000
npm run dev:web        # interface on http://localhost:5173
npm run update:cards   # load the Scryfall catalog into data/mana-vault.sqlite
```

### Checks

```bash
npm run typecheck
npm test               # server tests and static checks (About guide, versions, banned characters)
npm run test:e2e       # builds, then runs the Playwright browser suite against a sample database
npm run test:all       # all of the above
```

The browser suite uses Playwright's Chromium (`npx playwright install chromium` once). Set `PW_CHANNEL=chrome` to use an installed Chrome instead.

### Project layout

| Path | Contents |
|---|---|
| `apps/server/src` | Fastify server: API, sign-in (`auth.ts`), collections, set completion and sending (`library.ts`), decks (`decks.ts`), deck card links (`links.ts`), set list (`sets.ts`), search, imports, backups, catalog updates |
| `apps/web/src` | React interface: `store.tsx` (state), `library-state.tsx` (collections, picking rows, decks admin, offers), `actions.tsx` (every command), `ribbon.ts` (ribbon and its dropdowns as data), `formats.ts` (export formats), `dock.ts` (panel layout model), `components/`, `panels/`, `views/`, `about/` (guide pages), `style.css` |
| `apps/web/public` | Sign-in page, icons, manifest and service worker |
| `apps/android` | Android app: Capacitor project (`android/`), native plugin, icons |
| `apps/web/src/android` | The app's side of the interface: platform layer, device sign-in, offline copy and sync (`offline.ts`), card list (`catalog.ts`), app screens |
| `apps/server/src/mobile.ts` | Device sign-in, cross-origin access for the app, `/api/sync`, `/api/sync/state`, `/api/catalog/compact`, `/api/rulings/compact` |
| `tests/e2e` | Playwright browser tests (including the Android app with a stand-in for its native plugin) and the sample-data test server |
| `docs/HANDOFF.md` | Project handoff: rules, code map, open items |

## Android app

The app lives in `apps/android`: a Capacitor project that carries the built interface (`apps/web/dist`) and a Java plugin (`ManaVaultPlugin.java`, `Settings.java`, `InboxWorker.java`) for text recognition, encrypted settings, the background Inbox check, file sharing and the Back button. Its version comes from the root `package.json`.

### Building on a computer

Requirements: Node.js 22.5 or newer, Java 21 and the Android SDK (platform 36, build tools 36). Point `ANDROID_HOME` at the SDK, or put `sdk.dir=...` in `apps/android/android/local.properties`.

```bash
npm install
npm run build -w @mana-vault/web
npm run apk:debug -w @mana-vault/android   # apps/android/android/app/build/outputs/apk/debug/app-debug.apk
```

### Releases

The `Android app` workflow builds a debug app for every pull request that changes the interface or the app, and for every push to main, and keeps it with the run as `mana-vault-X.Y.Z-debug` (Actions, the run, Artifacts). After each push to main the APK is also on the **Debug build** pre-release on the releases page (tag `debug`), which the app's update check ignores. Debug builds are signed with the shared debug key in `apps/android/android/app/debug-shared.p12`, so each one installs over the one before it; the release app uses its own key and needs the debug app uninstalled first. For a version tag (`vX.Y.Z`) it builds the release app, signs it and attaches `mana-vault-X.Y.Z.apk` to the GitHub release.

Signing needs a release key, made once on any computer with Java (keep the file and passwords safe and out of Git; an app signed with another key cannot update the installed app):

```bash
keytool -genkeypair -v -keystore mana-vault-release.jks -alias manavault -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 mana-vault-release.jks
```

Then in GitHub, Settings, Secrets and variables, Actions, add these repository secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The base64 text of the key file |
| `ANDROID_KEYSTORE_PASSWORD` | The key store password |
| `ANDROID_KEY_ALIAS` | `manavault` (the alias used above) |
| `ANDROID_KEY_PASSWORD` | The key password |

To publish a version: merge to main, then tag it, for example `git tag v0.5.0 && git push origin v0.5.0`.

The server needs no change for the app: it accepts the app's requests at the same address used in a browser. When it is reached through Cloudflare Tunnel, the app uses the same https address.

## Data and secrets

Collection data and card database files stay outside Git. Do not commit `.env` files, credentials, backups, collection exports or Android signing keys (`*.jks`, `*.keystore`).

Mana Vault is not produced by or endorsed by Scryfall or Wizards of the Coast.
