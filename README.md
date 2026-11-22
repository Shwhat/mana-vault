# Mana Vault

A self-hosted Magic: The Gathering collection and deck manager. Version 0.8.0.

Mana Vault runs on your own server as one Docker container and is used from a desktop browser, a phone browser (installable as a home screen app) or the Android app. It keeps a local copy of the Scryfall card catalog, your collection and your decks in one SQLite database, behind a sign-in.

The full user guide is built into the app: Help tab, **About Mana Vault**. The pages are in `apps/web/src/about`.

## Features

- Card search with one spot per card name (the newest regular printing, an N printings badge and one OWNED count), or every printing with Show every printing in Options. Filter syntax (`t:dragon c:red mv>=4`, `o:draw`, `set:lea`, `r:rare`, `id:wubg`, `legal:commander`, `usd<1`, `is:custom`, `is:surgefoil`, `is:owned`, `art:cat`, `role:ramp`, `pow>=3`, `tou<2`, `year>=2020`, `a:` artist, `kw:` keyword, `frame:`, `border:`, `lang:`, negation with `-`), flavor name matching and a Filters panel. Results show as a grid of card pictures (the default), binder pages or a list, with owned counts (prices in the list), and load as you scroll with the total in the count line. A Sort menu orders them by Best match (exact names first), name, date, price, mana value, rarity, color, set or owned copies, kept separately for card search, the deck's Add tab and both trade searches.
- Filters for what the art shows (Scryfall Art Tags such as cat, dog or bird) and a card's role (Oracle Tags such as ramp or removal), name, card text, creature type, keyword, artist, power, toughness and price ranges, finishes made in, foil type, frame, release years and owned or not owned.
- Special foils (SURGE FOIL, GALAXY FOIL, TEXTURED FOIL and others) named on every card mark and in the printing chooser.
- Printing chooser in Grid (the default), List or Binder with a card size, finish buttons with prices under each picture, kept per account.
- Undo and Redo arrow buttons in the top bar (desktop and phone), with the change in the tooltip.
- Card layout (View menu): drag the count, printings, finish, status marks, finish lines, price and buttons to the corners of a card picture, the row under it, a second line or the bottom, or hide them; one layout for every section or one per section.
- Live updates: open pages show changes made in the app, on another device or by someone sharing a collection or deck within a second or two (server-sent events), and coming back to card search keeps the search, results and scroll position.
- Collection Grid and Binder show one picture per printing with a pip bar under it for the count, FOIL, ETCHED, Missing, Proxy, condition, language and copies for trade, and no prices; a line per kind of copy under the picture when there is more than one. The same in All collections, deck Grid and Stacks and search pictures.
- Price history: each card database update keeps the day's prices; the card page has a Price history chart and table.
- The Filters panel filters whatever is open: card search, a collection, a deck or a search inside them, each with its own filters that stay when you switch collections or decks.
- All collections: one list of every row in every collection, with each row's collection (wishlists optional).
- The app's own choice lists on every screen, the same on desktop and phone.
- Prices from Scryfall in US dollars (regular, foil, etched) stored with each card database update, with collection and deck values and sorting by price.
- Statistics for collections and decks: stat tiles and bar charts for mana curve, color, type, rarity, finish and top sets; clicking a collection bar filters the list.
- Copy details per collection entry: finish (regular, foil, etched), condition, language, proxy, the number for trade, purchase price, date added, misprint, altered and signed.
- Proxy copies: marked everywhere, worth nothing, left out of completion, value and statistics, and able to fill a deck slot.
- Filter tags (click a set code or rarity), and three collection layouts: a grid of card pictures that loads more while scrolling (Small, Medium, Large), binder pages of nine cards sized to the window with a page box, or a list. Grid is the default; desktop and phone remember their own layout.
- One switcher for collections and decks: a searchable list with sorting (recently opened, name, date created, card count, value, format, commander), details per row and keyboard control. An Options button holds sort, layout, card size, filters and Select.
- Wishlists: collections whose cards are wanted, not owned; add a card, a set's missing cards or a deck's missing cards in one step.
- Deck ownership check: which cards you own across your collections, where they are, and the cost of the missing cards; export the missing cards as text.
- Saved trades (Open, Done, Cancelled): You give searches your cards for trade, You get searches the card database, each line with its own count, finish, condition and an editable price, and a balance bar. Complete a trade in one undoable step (deck cards are flagged, wishlist wants go down), or send it to another account with counter-offers until one side accepts. Wishlist matches both ways, copy or CSV export, and a public trade binder link that needs no sign-in.
- Any number of collections per account (binders, boxes, sets being completed), each copy in one place. In the Collection and Decks tabs one click in the switcher or the panels opens a collection or deck; elsewhere one click in a panel makes it where new cards go, so a search stays open, and a true double click opens it (C cycles the collections). Every owned card is in a collection.
- Change printing for collection copies and deck cards from the right-click menu, including switching to the foil or etched version, for all copies or only some (How many to change, its own first step starting at 1); deck cards link free copies of the new printing in that finish. Collection copies that fill a deck ask whether the deck changes too or keeps its version.
- Deck cards keep a finish (regular, foil, etched), shown as FOIL or ETCHED in every deck view, the Deck list panel, the Card panel and trade lines, and used for prices, set by `*F*` and `*E*` marks, Add as foil, Add as, linked copies or Change printing. A regular and a foil card of one printing are separate deck cards.
- Exact-printing links: Edit as text and decklist imports link lines that name a set and number to free copies of exactly that printing and finish; Link owned copies fills every missing card the same way. Missing cards show Owned, link or Other version owned with Switch.
- Upgrade wanted: mark a deck card with the version you want; it stays owned and is listed in the Ownership tab until a copy of that version is linked.
- Remove asks how many copies to remove, with Reduce to 1 and Remove all; Reduce to 1 also works on picked cards.
- One Add to name button follows the selected collection or deck and opens the printing chooser with the shown printing selected (Enter takes it); a card with one printing skips the printing chooser (one finish adds it at once, more ask only for the finish). An Adding here mark in the panels and ADDING TO in the status bar show where cards go.
- Right-click (long press) menus on collections and decks in the panels and switchers: open, rename, settings or format, Send to print list... (whole deck, missing cards or chosen zones), send, export, delete or leave. The Decks panel groups decks by format with card counts and values.
- Proxies: a print list kept on the server (a deck, its missing cards, a collection, picked rows, a pasted list, tokens, any card), with printing, count and faces per line, sorted eight ways and shown as a list, grid or binder; pictures fetched a few at a time with a retry and a smaller-size fallback, and missing pictures listed before export; Letter, A4, Legal or custom paper, margins, card size, scale, gap, bleed, cut lines or corner marks and background, with a page preview; card backs (standard or uploaded) on mirrored back pages; exports as a 300 DPI PDF, MakePlayingCards pictures with bleed, and an MPC Autofill card list. Printed cards can be added as proxies to a collection or deck.
- Card maker: custom cards with a live preview (one scrolling page on phones), opening on the card opened last, a card list grouped under custom set headings, one floating Symbols window that inserts at the cursor of the mana cost or rules text with Scryfall's full symbol list, suggestions for names, types and keywords, one art library for the server (several uploads at once; the uploader or an admin renames or deletes), Mana Vault's own frames in six styles (Classic, Borderless, Full art, Showcase, Nickname, Showcase Nickname) and every color (hybrids in every style, gold, artifact, colorless, land, vehicle), a frame picker with previews, an automatic legendary crown and power and toughness box, open-licensed card fonts, creature, planeswalker, saga, token, split and double-faced cards, uploaded or card art with move and zoom, and PNG export. Custom cards join the card database for every account, in custom sets with their own codes and symbols (SVG, a Scryfall set symbol or a picture, drawn in rarity colors), edited from a right-click menu with undo, and work like any other card.
- Set completion (off by default for new collections): link a collection to any number of sets; count by main set, every printing or each card name once, and by any finish, regular only, foil only or one of each; Completion and Missing tabs with filters, add-from-list and text or CSV export of the missing list.
- Bulk editing: pick cards with Ctrl+click, Shift+click, Ctrl+A or Select mode; remove, reduce to one copy or move them between collections in one undoable step.
- Collection tracking per printing, regular and foil, with plus, minus, move and remove controls.
- Deck import, Edit as text and Quick add read `*F*` and `*E*` finish marks, and find cards by set and number when the name does not match.
- Decks keep the exact printing, with commander, main deck, sideboard and maybeboard zones; All, Commander, Main, Sideboard and Maybe buttons show one zone (or all) and set where Add puts cards; rename and delete.
- Add deck to collection: the deck's missing cards, or every card as new copies, go into a chosen collection in the deck's printings and finishes, linked to the deck, in one undoable step.
- Deck builder in the Moxfield style, with a header like the collection's (switcher, tabs, filter box, Options, count line) and an Add tab with a card search and + Main, + Side, + Maybe and + Commander buttons that show the count already in the deck: Quick add ("2 Sol Ring"), Edit as text with a check before applying, List, Text, Stacks and Grid views grouped and sorted like every list view, tags on deck cards, In Deck marks with Move to this deck, hover previews and the tokens the deck makes.
- Format checks for 21 formats: deck and sideboard size, copies, banned and not legal cards, and commander color identity.
- Deck tabs for Playtest (opening hand, mulligan, draw, play), Description with a cover card, and History of every change; mana symbols against mana sources in deck statistics.
- Linked deck cards: each deck card is linked to a copy in a collection (one deck per copy). Collection entries show their deck, deck cards show their collection, links follow moves, and unlinked cards show as missing with a + Wishlist button. Cards added straight to a deck go into the deck's own collection or a chosen one.
- Wishlist want counts go down as copies are added, asking which wishlist when a card is on more than one.
- List views in decks, collections, All collections, card search and the print list: group by type, subtype, type and tag, rarity, color, color identity, mana value, set or artist, sort by name, mana value, price, rarity or color, mana symbols, columns on wide screens, folding headings and a menu button per row.
- Collections and decks belong to their account. Send them to another account as a copy, a share (both edit) or a transfer; the receiver accepts from an Inbox as a new item or, for collections, merged into one of theirs.
- Undo and redo for collection and deck edits (150 steps).
- Import window: Mana Vault, Moxfield, ManaBox, Archidekt, Deckbox, TCGplayer or plain text, detected from the file and changeable, into a chosen or new collection, and decklist import (text or CSV), each with a preview and an Import review panel for skipped rows.
- Export window: the whole collection, filtered cards, selected cards, missing cards or a deck, in any of the import formats.
- JSON backup and restore of the signed-in account's own collections and decks, the card records they use, the custom cards and sets made or used, the art library, the uploaded card back and the purchase history. Each backup is marked with the Mana Vault version that made it, and a server refuses backups from a newer version.
- Card database updates from Scryfall on demand or on a schedule, including the set list (printed sizes, symbols, blocks), each printing's finishes, power and toughness, back face pictures, rulings, Art and Oracle tags, the symbol list, name and keyword lists for suggestions, the card back, Scryfall's printing changes (merges move every copy; removed printings are marked), the full Scryfall record of every card, and the card languages chosen in Administration (English and unofficial by default, or any official translations), all kept offline.
- Card pictures kept on the server: choose the sizes (small, normal, large, PNG, art crop, border crop) with an estimated download size each; downloads run in the background after each update, only for new or changed pictures, with pause and resume, a minimum free space and a picture folder that can be moved. The phone app uses the server's pictures. A card whose record fails a check is skipped and listed instead of stopping the update.
- Card page: art, rules text, power and toughness, every version with its market price, and rulings (offline in the app too), with a card actions button.
- Live camera card scanner: scans continuously, finds the exact printing from the set code and collector number (or the card name, with tolerance for reading mistakes), collects cards in a scanned list with edit, +1 and finish controls, and adds the list to a collection or deck as one undo step. Text recognition runs in the browser with files served by Mana Vault, so it works offline. Settings for quick mode, sounds, camera, proxies, a set filter (any number of sets, with chips on the camera screen and a Not in set warning), ignoring promos, preferring foil, total value and copies owned. A printing picker when more than one printing fits, a strip for finish, condition and language, and an Add to window that can create a new collection or deck. Phone Scan tab; desktop scanner window.
- Sign-in with accounts, password changes, sessions and protection against password guessing. Sign-up is open, by one-time invite code, or closed.
- Administration for admins: first-run Setup, Accounts (create, reset password, turn off, make admin, sign out everywhere, delete or move collections to another account), Sign-up and invite codes, Card database, Pictures, Storage and backups (scheduled whole-server backups, download, restore), Devices, Security, Server (version, update check, uptime, Scryfall check, server name, log) and Activity. Environment variables lock their settings.
- Desktop interface in the OpenSchem style: a title bar with the File, Edit, View and Help menus, mode tabs (Home, Search, Collection, Decks, Trade, Proxies) that switch the program, right-click menus on rows, dockable and floating panels (Filters, Collections, Decks, Card, Deck list, Import review) that dock and snap together, panel tabs that wrap, saved workspaces in the account menu, status bar and light, dark or system theme.
- Phone layout with a Home screen, bottom tabs (Home, Search, Collection, Decks, Trade, Proxies, Scan), a nested top-right menu, long-press menus on rows, full-screen sheets and 44 pixel touch targets.
- Prices on pictures (View menu, off by default): a price pip on every card picture.
- Suggestions while typing in card search (names, `t:`, `kw:`, `a:`), Quick add, the scanner and the Filters panel, also offline in the app. Android app: in Search one tap picks a collection or deck and a double tap opens it.
- Preferences (theme, foil, target zone, where new cards go and the open collection, proxy sheet settings, collection sort and list grouping, layout and card size, switcher sorting and recently opened items, deck view, groups and sort, print list sort and layout, prices on pictures, panels, workspaces, last deck) saved per account on the server.
- Android app (Android 8.0 or newer, APK on the GitHub releases page): every phone feature, sign-in per phone with a device list, offline use of collections, decks, card search and scanning (including new collections and decks) with full search syntax offline, background sync as soon as the phone is online and a Sync now button, https only, sharing lists in to import and pictures or PDFs to read as receipts, update checks against your own server, the phone's own text recognition for scanning, notifications for new Inbox offers, and an opening started on the web page offered for scanning (in the open app, and as an Opening started notification with Start scanning).
- Purchase history (Purchases tab): purchases of products and single cards (found with pictures and every printing, scanned in, or taken from the scanned list) with tax and shipping spread over the lines, receipts read from a photo, PDF or screenshot and kept with the entry, places shared on the server, who paid shipping on each sale, trade entries with Gave, Got, Net and Original cost, packs opened one at a time (Open how many packs?, Next pack, Move to pack..., cost and values per pack) that tie pulled cards (they stay on the pack until Remove from pack..., with Value when pulled, Pulled value and Value now), grid tables with picking several rows (Delete picked..., Remove picked from pack...), Add existing copies... by collection, receipts read with a Match cards step for single cards, sealed values over time, card and product sales, trades recorded when completed, imported purchase prices, and Spent, Received, Value now and Gain or loss with a chart and CSV export.
- Built-in About guide with release notes.

## Keyboard shortcuts

| Key | Action |
|---|---|
| / | Find card |
| 1, 2, 3, 4, 5, 6 | Card search, collection, deck, trade, proxies, purchases view |
| Up, Down | Previous or next row |
| Enter | Add the selected card to the collection or deck selected last |
| Shift+Enter | Add the selected card to the open deck |
| F | Switch Add as foil |
| Z | Cycle the zone shown and the target zone (All, Commander, Main, Sideboard, Maybe) |
| C | Cycle the target collection |
| W | Add the selected card to the wishlist |
| E | Copy details of the selected collection row |
| B | Switch the collection between binder and grid |
| Page Up, Page Down | Previous or next binder page |
| Ctrl+A | Pick every card the collection filter shows |
| Ctrl+click, Shift+click | Pick more rows, or a range |
| Delete | Remove the picked collection rows |
| Ctrl+Z, Ctrl+Y (or Ctrl+Shift+Z) | Undo, redo |
| Ctrl+O | Open deck |
| Q | Go to Quick add in the open deck |
| Esc | Close the window, menu, About guide or Administration, or clear the selection |

## Install with Dockhand

Mana Vault is published as `ghcr.io/shwhat/mana-vault:latest` (amd64 and arm64) by GitHub Actions on every push to `main`. The GitHub package must be public, or Dockhand needs registry credentials for ghcr.io.

**1. On the Docker host**, check the port is free (no output means free), then create the data and picture folders for the container's user (UID 65532). The picture folder can be on another drive; set `MANAVAULT_PICTURES_HOST` to it.

```bash
sudo ss -ltnp | grep ':3417 '
sudo mkdir -p /opt/mana-vault/data /opt/mana-vault/pictures
sudo chown -R 65532:65532 /opt/mana-vault/data /opt/mana-vault/pictures
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

**5. In the browser**, open the address and choose **Create account**. The first account is the admin, and Mana Vault opens Setup: download the card database, choose the picture sizes to keep and the picture folder. Every step can be skipped and changed later in **Administration** (account menu). Sign-up (open, invite codes or closed) is set in Administration, Sign-up.

When updating from 0.11.0 or earlier: the oldest account becomes the admin, and Setup opens once for it. Remove `MANAVAULT_SIGNUP` and `MANAVAULT_CARD_UPDATE_INTERVAL_HOURS` from the stack's environment to manage them in Administration (a value set there locks the setting). Create the pictures folder above before redeploying. Run Update card database once so tags, special foils and price history are filled in.

## Automatic updates

In Dockhand, turn on automatic image updates for the `app` container with a schedule (for example weekly). Dockhand pulls each new image published by GitHub Actions and recreates the container; the data folder is kept. Optionally turn on Git auto sync or a webhook for the stack so changes to `docker-compose.yml` redeploy it.

## Install from the command line

**On the Docker host:**

```bash
sudo mkdir -p /opt/mana-vault/data /opt/mana-vault/pictures
cd /opt/mana-vault
sudo curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/Shwhat/mana-vault/main/docker-compose.yml
sudo curl -fsSLo .env.example https://raw.githubusercontent.com/Shwhat/mana-vault/main/.env.example
sudo cp .env.example .env
sudo nano .env
sudo chmod 600 .env
sudo chown -R 65532:65532 /opt/mana-vault/data /opt/mana-vault/pictures
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

**Administration, Storage and backups** writes whole-server backups (every account, collection, deck, setting and the card database) on a schedule into `/opt/mana-vault/data/backups`, and restores them. Pictures are not included; they can be downloaded again.

The in-app **Download backup** (File menu) saves the signed-in account's own collections and decks as JSON and can be restored from the app; it does not include other accounts or the full card catalog. A Docker volume is not a backup.

To restore a server backup: stop the stack, extract the archive into `/opt/mana-vault`, run `sudo chown -R 65532:65532 /opt/mana-vault/data`, and start the stack.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `MANAVAULT_PORT` | `3417` | Host port the app is published on |
| `MANAVAULT_DATA_DIR` | `/opt/mana-vault/data` | Host folder for the database, owned by 65532:65532 |
| `MANAVAULT_PICTURES_HOST` | `/opt/mana-vault/pictures` | Host folder for downloaded card pictures, owned by 65532:65532 |
| `MANAVAULT_PICTURES_DIR` | `/pictures` in Docker | Picture folder inside the container. Set by the compose file; it locks the folder in Administration |
| `MANAVAULT_BACKUP_DIR` | empty (`backups` in the data folder) | Folder for whole-server backups; locks it in Administration |
| `MANAVAULT_SIGNUP` | empty | `open`, `invite` or `closed` (`on` and `off` also work). Empty means it is set in Administration |
| `MANAVAULT_SECURE_COOKIE` | empty (`auto`) | `auto` marks the session cookie secure for HTTPS requests, including through a proxy; `always` or `never` force it |
| `MANAVAULT_CARD_UPDATE_INTERVAL_HOURS` | empty (168 in Administration) | Hours between automatic Scryfall updates, 1 to 8760; `0` turns them off. Empty means it is set in Administration |
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
| `apps/web/src` | React interface: `store.tsx` (state), `library-state.tsx` (collections, picking rows, decks admin, offers), `actions.tsx` (every command), `menus.ts` (the menu bar, mode tabs and account menu as data), `formats.ts` (export formats), `dock.ts` (panel layout model), `components/`, `panels/`, `views/`, `about/` (guide pages), `style.css` |
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
