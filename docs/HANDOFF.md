# Mana Vault handoff

Last updated: 2026-11-19, version 0.8.0.

## Project

Mana Vault is Devon's self-hosted Magic: The Gathering collection and deck manager (repository Shwhat/mana-vault). It runs as one Docker container (Node.js 22, Fastify, SQLite) and serves a React interface for desktop browsers and phones. Version 0.1.0 rebuilt the interface in the OpenSchem design style (program-design-guide skill, "look and shell" adoption), added sign-in, per-account preferences, undo, the About guide and Dockhand-ready deployment. Version 0.2.0 added multiple collections per account, set completion, bulk editing, per-account ownership of collections and decks, sending (copy, share, transfer) with an Inbox, and deck rename and delete. Version 0.3.0 added prices and values, statistics, deck ownership, wishlists, the trade list and trade calculator, copy details (finish, condition, language, trade count), filter tags, the binder layout and flavor name matching. The 0.3.0 features came from a comparison with AeroEagle/mtg-collection-viewer. Version 0.4.0 rebuilt the camera scanner as a continuous, ManaBox-style live scanner with a scanned list. Version 0.5.0 added the Android app (Capacitor around the same interface) with device sign-in, offline use and sync, phone text recognition and Inbox notifications. Version 0.6.0 linked deck cards to collection copies, added proxies and copy details, import and export windows for seven formats, a ManaBox-style scanner with settings and a printing picker, the card page with rulings, a ribbon-only menu with right-click menus, and the phone Home screen. Version 0.7.0 added the Moxfield-style deck builder (Quick add, Edit as text, four views, groups, tags, maybeboard, format checks, playtest, description, history, tokens), the shared collection and deck switcher, the Grid collection layout, and layout fixes from Devon's screenshots. Version 0.8.0 added saved trades (two-column builder, complete with undo, trading between accounts with counter-offers, wishlist matches, public trade binder), card search views (Grid, Binder, List) with paging and owned counts, filters that follow the open view, All collections, the deck header and Add tab, one picker everywhere, ribbon cleanup and scanner fixes (outline and light).

## Rules

- Do not build or change the program until Devon says "build it". Settle the specification first with questions.
- Before building, review the enabled skills and state which apply (program-design-guide, program-about-guide, docker-server-setup at minimum; dataviz for charts). Load each one that applies.
- Do not commit or push until asked. Do not remind Devon about uncommitted work.
- Never use em dashes anywhere (code, comments, docs, interface text). A static test enforces this.
- Answer questions simply and directly, without extra unrequested actions.
- Keep a task list while building, update the README feature list and keep the keyboard shortcut list current (README, About guide page 18 Settings and shortcuts, `SHORTCUTS` in `actions.tsx`, key handling in `main.tsx`).
- Every update ships the server and the Android app together. Attach a debug APK to each build until the app is closer to finished. The `Android app` workflow builds it for every pull request and push to main (artifact `mana-vault-X.Y.Z-debug`; pushes to main also replace the `debug` pre-release on the releases page with it), signed with the shared debug key `apps/android/android/app/debug-shared.p12` so debug builds install over each other. The workspace cannot reach Maven Central, so take the APK from the CI run.
- Update this handoff (here and in the claude.ai manavault project, identical) with every build.
- Raise the version in every place with each delivered build: `package.json`, `apps/server/package.json`, `apps/web/package.json`, `apps/android/package.json` and `package-lock.json` (run `npm install --package-lock-only`). Patch for fixes, minor for features, major only when Devon says so. A static test checks they match.
- Every pull request that changes what the app does, or the rules it follows, also updates the About guide: the affected pages, Capabilities, and a new entry in the release notes. It also raises the version. The version is shown in the guide.
- Every change gets tests; `npm run test:all` must pass before delivery. Where Playwright cannot download its browser, run it with an installed Chrome: `PW_CHANNEL=chrome npm run test:all`.
- Deployment follows the docker-server-setup skill: Dockhand only, no Watchtower, absolute data path, UID 65532, no cloudflared or reverse proxy in the stack.

## Decisions (0.8.0 trading, search views, filters per view)

- Specification: `docs/SPEC-0.8.0.md` in the claude.ai project. Devon said "build push merge".
- Card search: `GET /api/cards?paged=1&offset=N` returns `{ total, cards }`, each card with `owned` (non-proxy copies in owned or shared non-wishlist collections). Without `paged` the old array answer stays (Quick add suggestions use it). The app's offline search supports the same parameters. `useCardSearch` (`card-search.ts`) loads 60 at a time; `CardResults` (`components/CardResults.tsx`) draws Grid, Binder (9 per page, loads ahead) or List, used by card search, the deck Add tab and both trade searches. Owned counts change at once after Add to collection through `ownedHooks` in the store (every open search registers its `owned` updater). Prefs `searchLayout`, `searchLayoutPhone`, `searchSize`.
- Filters per view (`filters.ts`): scopes `cards`, `collection`, `deck`, `deckAdd`, `tradeGive`, `tradeGet` held in `filterSets` in the store (memory only, not prefs). `filterScope` follows the view, the deck tab and the trade search last focused (`tradeSide`). `matchesFilters` applies the panel locally to collection rows and deck cards; collection rows carry `legal` (comma list from `legalFormats` on the server), deck cards use `legalities`. Facets and the filter box are no longer cleared on collection switch.
- All collections: id `all` (`ALL_COLLECTIONS`) stored as `openCollection`. Rows come from `GET /api/library/cards` (`?wishlists=1` with pref `allWishlists`) with `collection_id` and `collection_name`. `entryKey` includes the collection, and `byCollection` groups rows so remove, move, trade marks, Copy details and counts act on each row's own collection (one undo step). Only the Cards tab; completion and statistics are per collection.
- Deck view: header like the collection header; tab `add` (DeckTab) holds Quick add, Edit as text and the search. Zone buttons count by oracle id and zone.
- Picker (`components/Picker.tsx`) replaces every native select; Enter on a picker inside a form submits the form (dialogs confirm with Enter as before). Tests use `choose(page, locator, value | { label })` from the fixtures.
- Ribbon: Home Add group removed; Trade tab Open (view.trade), Trade (trade.new, trade.complete, trade.send), Share (trade.copy, trade.share). T and G stay as keys and add to the open trade (a new trade is started when none is open).
- Trades (`apps/server/src/trades.ts`, client `trade-state.tsx`, `views/TradeView.tsx`, `components/TradeDialogs.tsx`): tables `trades`, `trade_lines` (side relative to the owner; `present` flips sides for the partner), `trade_shares`. A line change by either account sets `turn_id` to the other account (counter-offer). Local complete stores a JSON record; undo calls `/reopen`, which reverses it. Accepting a proposal completes both sides and cannot be undone. Deck warning before complete is done in the browser from the source collections' `decks` field. Price `null` means the card database price. The open trade id is kept in localStorage `mana-vault.openTrade`. `/share/:token` is the only public page (`PUBLIC_PATHS` pattern in the guard).
- Scanner: `guideBox` keeps the outline clear of the right-side buttons (`GUIDE_SIDE = 64`). Light: the scanner looks for a back camera with `torch` capability (remembered in localStorage `mana-vault.torchCamera`), then in the app the native `setTorch` (CameraManager), else the note "This camera has no light". Must be checked on a phone.
- Phone bottom bar: Home, Search, Collection, Decks, Trade, Scan at 10.5 px labels; the top bar gets Filters (collection, deck, trade) and Trades with a count.
- Chrome's `Element.scrollTo` now returns a promise; effects must not return it (React treats it as a cleanup).

## Decisions (0.7.0 deck builder, switchers, card views)

- Specification: `docs/SPEC-0.7.0.md` in the claude.ai project. Devon said "build it" with two questions open; the defaults taken were the full Moxfield feature list, and fixing the right-click menu contrast (the menu was white with light text in the dark theme) plus giving binder and grid cards the same menu.
- Zones: `maybeboard` added to `deck_cards.zone` (table rebuilt with ids kept so links survive). Maybeboard cards are left out of card counts, stats, ownership, missing counts and legality, and are never linked when added.
- `deck_cards.tags` (one tag per line, up to 12 of 40 characters), `decks.description` (Markdown, 20,000 characters), `decks.cover_card_id`, table `deck_history` (newest 500 per deck, written by `logDeck` in `decks.ts` for adds, count and zone changes, removes, renames, format, description, cover, tags, imports and text edits). Cards get `produced_mana` and `tokens` (JSON of Scryfall `all_parts` tokens) from the bulk import; they fill in with the next card database update.
- Formats: 21, each a Scryfall legality key except casual. Legality is computed in the browser (`deck-rules.ts` `checkDeck`): commander formats (size 100, or 60 for standardbrawl and oathbreaker, singleton, commander color identity on the main deck only), other formats (60 minimum, 15 sideboard, 4 copies or 1 restricted), basics and "any number" cards unlimited, "up to N" cards use N, banned and not_legal flagged. Casual is not checked. Sideboard is ignored for commander formats.
- Edit as text: `POST /api/decks/:id/replace` (`?preview=1` reports only). Lines without a set keep the printing already in the deck; kept cards keep links and tags; unmatched lines are dropped, so a card whose line does not match is removed (the dialog says so in red). Undo uses `restoreDeck`, which now also restores tags.
- Quick add resolves names with `GET /api/cards/resolve` (same matching as decklist import, `printingFinder` in `deck-import.ts`) and then uses `addToDeck` with a quantity and zone.
- Switcher (`components/Switcher.tsx`) replaces the native collection select and the phone Decks sheet. Sort prefs `collectionSwitchSort`, `deckSwitchSort`; `recent` holds open times (300 newest) and is saved at once like the open collection. Deck summaries now carry commander names, the cover image (cover card or first commander), description, created and updated dates; collection summaries carry `createdAt`.
- Collection layout prefs per device type: `collectionLayout` (desktop) and `collectionLayoutPhone`; new accounts get `grid`, saved prefs keep their old value. `gridSize` s, m, l. B toggles binder and grid. Grid renders 60 cards at a time and adds 60 when a sentinel nears the view (IntersectionObserver). Binder pockets are sized from the area with a ResizeObserver.
- Options button holds sort, layout, card size, In decks filter, For trade only and Select several cards (the old Select button); its badge counts the trade and deck filters. "+ Add" makes the open collection the target and runs Find.
- About closes on `select`, non-quiet `openDeck`, `openCollection` and `setCardPage` (`leaveAbout` in the store). Decks panel opens on one click.
- Docking: dragging a floating window by its grip uses the same drop targets as tab drags (the moving window gets `pointer-events: none`); `dockGroup` moves all its panels, `snapEdges` snaps to other floating windows within 10 px. Panel tabs wrap instead of shrinking.
- Phone fixes: a size for every `.btn .ico` (icons had no size and filled their buttons), the scanner edit button has a label, the empty Home header is hidden.
- Description Markdown uses the About renderer; links render only for http(s) and site paths (this also applies to the About guide).
- Tests: new browser tests start accounts in the list layout through `signUp` (it waits for the first prefs save, then changes the layout); pass `grid = true` to keep the grid. `switchTo` and `useWorkspace` helpers replace the old selects.

## Decisions (0.6.0 storage, formats, scanner and menus)

- Specification: `docs/SPEC-0.6.0.md` in the claude.ai project.
- Every owned card is in a collection. A deck card is linked to collection copies (table `deck_links`); one deck per copy, so a second deck shows the card as missing. Decks can hold missing cards, shown with a + Wishlist button. Normal decks were removed: every deck keeps the printing (old Normal decks became theme decks with the newest printing). Linking another printing switches the deck card to that printing. Existing decks are not linked automatically.
- Adding straight to a deck asks for the deck's own collection (created on first use, named after the deck) or a chosen collection; the choice is remembered per deck (`decks.collection_id`) and confirmed each time. When the card is in more than one collection, the app asks which copy to link.
- Links follow moves (free copies move first, then linked ones). Removing a linked copy makes the deck card missing. Sending a deck does not carry links.
- Proxies are part of the copy key: no value, left out of completion, value, statistics and the trade list, can fill a deck slot, and are marked everywhere.
- Wishlist want counts go down by one per copy added, oldest wishlist entry first (Devon left this choice to me).
- Completion rule None is the default for new collections and hides the Completion and Missing tabs; existing collections kept their rule.
- Import detects the format (Mana Vault, Moxfield, ManaBox, Archidekt, Deckbox, TCGplayer, plain text) and lets the user change it. ManaBox extra columns are stored as copy details: purchase price, currency, date added, misprint, altered, signed, proxy. Export works on the whole collection, filtered, selected or missing cards, or a deck.
- The app goes offline only when a request fails and a health probe also fails; the Sync chip is always shown and is the Sync now button. New collections and decks can be made offline (the phone picks the id).
- The ribbon is the only menu (the menu bar was removed). Import and Export open windows; other related commands share one dropdown. Deck and collection commands are added to the existing tabs when one is open; commands that do not apply are hidden. Button size: Large, Compact or Icons only. Right-click on rows, long press on phones.
- Phone: bottom bar Home, Search, Collection, Decks, Scan; the former More items are in the nested top-right menu.
- Explanatory notes and banners ("AI notes") were removed from the interface; nothing replaces the deck banner.
- Rulings come from the Scryfall rulings bulk file with each card database update and are kept offline in the app (`/api/rulings/compact`).

## Decisions (0.5.0 Android app)

- Specification: `docs/ANDROID-SPEC.md` in the claude.ai project. Devon chose: Capacitor wrapper around the existing interface, full phone parity plus scanning, offline and notifications, server address entered in the app, read and edit offline with server-wins sync, background check every 15 minutes (no Firebase), on-device text recognition (ML Kit), code in `apps/android`, sideloaded APK from GitHub releases. Devon said "build it" without answering the four open points; the proposed defaults were taken: plain http only for home network addresses (with a warning), Android 8.0 minimum (API 26), app name "Mana Vault" with the existing icon, update check against GitHub releases (the repository is public).
- The app always uses the phone shell (`useNarrow() || isApp()`). The bundled interface is served by Capacitor from https://localhost; the server allows that origin (CORS in `mobile.ts`) and accepts `Authorization: Bearer <device token>`. Device tokens are hashed like sessions, have no expiry, are listed in Devices... and removed by Remove, Sign out or a password change on another device.
- Offline: `apps/web/src/android/offline.ts` wraps `request()` in the app. GET answers are kept in IndexedDB (cache store, keyed by URL); offline they come from there, card search, card details and printings from the compact card list (`catalog.ts`). Changes that can wait (collection card add, set, add many, move, rename collection when rules and sets are unchanged, deck card add, change, remove, deck rename, prefs) are applied to the copy and queued; others say "You are offline. This needs a connection to the server." Online changes are also applied to the copy so it stays right if the connection drops.
- Sync (`POST /api/sync`): queued changes are replayed in order through `app.inject` with the caller's headers; each change id is applied once (table `sync_changes`, kept 30 days). Collection PUT and deck PATCH carry the count the phone saw (`base`) and are applied as a difference. 4xx results are listed in Changes not applied; 5xx keeps the queue. After sending, `GET /api/sync/state` (revision that changes with every successful change, new offers, catalog date) decides whether to download the copy again and the card list (`GET /api/catalog/compact`, gzip JSON with an ETag).
- Undo while offline queues the reverse change (the spec said it would remove the queued change; queuing the reverse has the same result).
- Scanning in the app: `readOnPhone` in `recognize.ts` sends one JPEG of the card area to ML Kit and sorts lines by position (`sortLines`). Matching rules moved to `apps/server/src/scan-core.ts`, shared by the server and the phone.
- Native code is Java (the Capacitor template language), not Kotlin as the spec said. Settings in EncryptedSharedPreferences. Notifications: WorkManager periodic work (15 minutes, unmetered when Check only on Wi-Fi), reads `/api/sync/state`, notifies for offers newer than the last one shown; tapping opens the Inbox.
- Left out of 0.5.0 (spec items): share-to-app imports and deep links; a managed image cache with a size setting (images use the WebView cache); background sync of queued changes from the worker (changes are sent when the app runs); offline statistics not opened before.

## Decisions (0.4.0 scanner specification)

- Modeled on ManaBox (screenshots from Devon): live camera, continuous scanning with no capture button, a last-card strip and a scanned list. Built on branch `scanner-0.4.0`, started before 0.3.0 was merged and then rebased onto it.
- Recognition reads the name line and the bottom-left information line (collector number and set code) with Tesseract.js in the browser. Set code plus collector number gives the exact printing when it agrees with the name; otherwise the name is fuzzy-matched on the server (`POST /api/scan/match`), including front faces and flavor names (a flavor name picks the printing that carries it).
- Name-only matches always take the newest printing (regular before promos and variants), or the printing in a set read from the information line. No set lock.
- A name match needs two equal reads in a row; a set and number match needs one. A card in view is counted once; two empty reads mean it left.
- Read modes cycle after a miss and stay while reads find a card: the card's own lines, then overlapping narrow strips around the top and bottom (wide), then strips for a card about 62% of the outline (small). Crops that are mostly dark are inverted (dark title bars). One large crop was tried and fails (empty table hides the text).
- Scanned list kept in localStorage per account (`mana-vault.scan.<userId>`), rows merged by printing and finish. Edit (quantity, finish, printing), remove, Clear (asks), Add a card by name (same fuzzy match), Add to (any collection, wishlist or deck; one undo step; collections through `POST /cards/add` as NM English, foil rows of etched-only printings as etched; decks use the target zone).
- Last card strip: Normal or Foil, printing (opens the edit window), +1. Torch, tap to focus and continuous autofocus where the camera supports them. Scanner settings in prefs: `scanVibrate`, `scanFoil`, `scanCamera`.
- Phone: Scan tab in the bottom bar (Cards, Collection, Decks, Scan, More); the scanner replaces the view. Desktop: large window, camera left and list right.
- OCR files (worker, two core builds, English best_int model) are bundled under `/ocr` by a Vite plugin; no CDN. Choosing a photo was dropped.
- Condition, language and prices are not set or shown by the scanner (agreed before 0.3.0 added copy details).

## Decisions (0.3.0)

Devon said "build all of it now" for the seven proposals without a question round, so these choices were made during the build and can be revisited:

- Prices: Scryfall's usd, usd_foil, usd_etched, eur, eur_foil stored on `cards` at each catalog update; no price history. Currency pref `currency` (usd or eur), never converted. Copy price: regular, foil, etched (falls back to foil); EUR foil price for foil and etched. Normal decks priced at the cheapest printing, Theme decks at the chosen printing.
- Copy key: a collection row is printing + finish (`foil` column 0 regular, 1 foil, 2 etched) + condition (M, NM, LP, MP, HP, DMG) + language (Scryfall code); `trade` is the count for trade (0 to quantity). Old rows become NM English. The API accepts `foil` as a boolean or 0 to 2; condition and language default to NM and en.
- Wishlist: `collections.kind` ('collection' or 'wishlist'), a checkbox in Collection settings. Excluded from owned counts, ownership and the trade list. Wishlist commands use the first owned wishlist, creating one named Wishlist when there is none.
- Deck ownership: copies in owned and shared collections (not wishlists), allocated commander, main, sideboard; any finish counts; copies are not reserved across decks.
- Trade: trade list = rows with trade > 0 in collections the account owns. The trade calculator lives in the browser (store state) until reload; it never changes collections.
- Statistics: computed on the server (`insights.ts`); single accent hue bars (dataviz: magnitude, not identity), Cards or Value measure, hover and focus tooltips; type counts each main type, front face only; curve excludes lands. Collection bars set filter tags.
- Filter tags (`Facets` in the store): set, rarity, color, type, mana value, finish, for trade; client-side, cleared on collection switch. Sort pref `collectionSort`, layout pref `collectionLayout` (list or binder, 9 per page).
- Flavor names: `cards.flavor_name`; search (plain words and `name:`) and both imports match flavor names and the front face of two-faced cards.
- New keys: 4 trade view, W wishlist, E copy details, B binder, Page Up/Down binder pages, T you give, G you get.
- Backup version 3 adds kind and copy details; versions 1 and 2 still restore.

## Decisions (0.2.0 specification)

- Each account owns its collections and decks. Pre-0.2.0 shared data moves to the oldest account (collection named Main collection). Every new account gets an empty Main collection.
- Each physical copy lives in one collection. Add to collection uses a target collection (pref `targetCollection`, key C). Move commands shift copies between collections.
- Collections link to any number of sets (or none). Completion rule chosen per collection: main (numbered up to Scryfall printed_size; without it, numbered non-promo non-variant), all (every printing), names (one of each oracle card, printings from the linked sets only). Finish rule: any, regular, foil, both (one of each); finishes a printing never had are left out of the total. Etched counts as foil (0.3.0).
- Missing view: counts and percent, list with set, rarity and color filters, add from the list, export as text or CSV.
- Bulk editing: Ctrl+click, Shift+click, Ctrl+A, Select mode on phones; remove and move as one undo step.
- Sending: sender picks Copy, Share or Transfer and it stays fixed. The receiver accepts or declines and chooses how it enters their library: new item with a name, or (collections sent as Copy or Transfer) merge into an existing collection; Share accepts with an optional personal display name. Recipients are picked from this server's account list.
- Deck rename and delete are included; members of a shared item can only leave it.

## Decisions (0.1.0 specification)

- Scope: OpenSchem look and shell on the existing React + TypeScript + Vite and Node/Fastify/SQLite stack. Not a rewrite to plain JS or Go.
- Desktop shell on wide screens; phone layout under 900 px (bottom tabs Cards, Collection, Decks, More; sheets; 44 px targets).
- Sign-in follows the OpenSchem method: PBKDF2 hashes, HTTP-only cookie with automatic secure flag behind HTTPS, rate limits, safety header (`X-Mana-Vault: 1`) on every change, signup switch `MANAVAULT_SIGNUP`.
- Preferences are per account.
- Undo covers collection and deck card edits by sending the reverse change. Imports, restores, deck creation and catalog updates are not undoable.
- Tests: server unit tests, static checks, and a Playwright browser suite.

## Code map

| Path | Contents |
|---|---|
| `apps/server/src/app.ts` | Fastify app: request guard and security headers, account routes (new accounts get a Main collection), prefs, card search and card detail (prices, flavor name, owned per collection with etched and trade, wanted in wishlists), collection imports, decks (scoped by owner and members, rename, delete), backups, catalog status, SPA fallback for `/about/...` |
| `apps/server/src/library.ts` | Access checks, collections CRUD (kind), `collectionValue`, `ENTRY_COLUMNS`, copy keys in POST/PUT (`trade`)/move, bulk add `POST /cards/add` (returns before and after for undo), set completion and missing, members, shares |
| `apps/server/src/insights.ts` | `summarize` (stat tiles and buckets), `deckOwnership`, routes `/api/collections/:id/stats`, `/api/decks/:id/stats`, `/api/decks/:id/ownership`, `/api/trade` |
| `apps/server/src/copies.ts` | Copy key parsing (`readCopyKey`, `readCondition`, `readLanguage`, `readFinish`), conditions and languages, `priceSql` per currency |
| `apps/server/src/scan.ts` | Scan matching: `NameMatcher` (in-memory trigram index of names, front faces and flavor names, rebuilt when the catalog changes), `readInfoLine`, `matchScan`; routes `POST /api/scan/match` and `GET /api/cards/:cardId/printings` |
| `apps/server/src/sets.ts` | Scryfall set list storage (`saveSets`) and set search (`listSets`) |
| `apps/server/src/auth.ts` | Users, sessions (token hashes), prefs table, PBKDF2, rate limiter, cookie helpers |
| `apps/server/src/index.ts` | Startup, environment variables, `-healthcheck` flag |
| `apps/server/src/database.ts` | Schema and migrations: cards (finishes, promo, variation; prices and flavor_name in 0.3.0), sets, collections (kind), collection_cards (0.3.0 key with condition, language, trade; `upgradeCopies` rebuilds the 0.2.0 table), members, shares, decks.owner_id; `cardPricesStatement` |
| `apps/server/src/backup.ts` | Backup version 4 per account (proxy, copy details, deck collection, deck links); before that version 3 (collections with kind, copies with finish, condition, language, trade, decks, deck cards, card records); versions 1 and 2 restore with defaults |
| `apps/server/src/collection-import.ts`, `deck-import.ts`, `card-search.ts`, `catalog-updater.ts`, `import-*.ts` | Import (condition, language, etched, tradelist counts, `nameMatch` for flavor and front face names), search (`usd`, `eur`, flavor names) and catalog logic; the bulk import stores prices and flavor names |
| `apps/server/src/decks.ts` | Deck routes: list, create (id from the caller), rename, format, description, cover card and deck collection, cards with links, tags, legality data and missing counts, link copies (`linkCopies`, switches printing), candidates; `ZONES`, `FORMATS`, `logDeck` |
| `apps/server/src/deck-builder.ts` | Deck builder routes: `GET /api/cards/resolve`, deck card tags, `replace` (edit as text, `replaceDeck`), history, tokens |
| `apps/server/src/links.ts` | Deck link helpers: `linkedCount`, `trimLinks`, `addLink`, `moveLinks`, `capDeckCardLinks`, `deckLinks`, `collectionLinks`, `touchDeckCollections` |
| `apps/web/src/formats.ts` | Export formats (`EXPORT_FORMATS`, `exportText`) |
| `apps/web/src/components/FileWindows.tsx`, `ContextMenu.tsx` | Import and Export windows; right-click and long-press row menus |
| `apps/web/src/views/HomeView.tsx`, `CardPage.tsx` | Phone Home screen; card page (versions, rulings, card actions button) |
| `apps/web/src/main.tsx` | Boot (`WebRoot`, or `AppRoot` with the app sign-in screen), keyboard shortcuts, desktop or phone shell, scanner, `useAppFeatures` (Back button, sync events, offers from notifications, update check) |
| `apps/web/src/android/` | `platform.ts` (native plugin interface, settings, server address rules, Back button), `net.ts` (requests with the device token), `offline.ts` (copy, queue, local changes, sync), `catalog.ts` (card list, offline search and scan matching), `idb.ts`, `AppScreens.tsx` (sign-in screen, sync chip, Devices, Changes not applied, update check) |
| `apps/server/src/mobile.ts` | Devices table and routes, `deviceUser`, CORS for https://localhost, `/api/sync`, `/api/sync/state`, `Revision`, `/api/catalog/compact` |
| `apps/server/src/scan-core.ts` | Scan matching rules shared with the app: `normalize`, `buildNameIndex`, `bestName`, `readInfoLine` |
| `apps/android/` | Capacitor project: `capacitor.config.json`, `android/` (Gradle, `ManaVaultPlugin.java`, `Settings.java`, `InboxWorker.java`, `MainActivity.java`, icons). Version from the root package.json. `.github/workflows/android.yml` builds it |
| `apps/web/src/store.tsx` | App state (`useStoreState`): undo stack, collections, facets and sort (`visibleCollection`), binder page, statistics, ownership, trade list, trade calculator (`TradeLine`), imports and exports (Moxfield CSV with condition, language, finish, tradelist) |
| `apps/web/src/scan-state.tsx` | Scanned list (`useScanState`, kept in localStorage), finishes (`finishCode`), `matchText`, Add to as one undo step, `scanTargets` |
| `apps/web/src/recognize.ts` | Tesseract worker from `/ocr`, the card outline geometry (`guideBox`, `guideInVideo`), crop and contrast (`prepare`), read modes (`readCard`); `window.__manaVaultScanText` replaces recognition in tests |
| `apps/web/src/library-state.tsx` | Collections CRUD, row picking, bulk remove and move, `editCopy`, `markTrade`, wishlist helpers, deck missing export, offers |
| `apps/web/src/types.ts` | Shared types; `priceOf`, `money`, `copyKey`, `copyLabel`, facet helpers (`cardTypes`, `colorKey`, `curveKey`, same rules as the server) |
| `apps/web/src/components/LibraryDialogs.tsx` | Collection settings (Wishlist checkbox) with the set picker, Copy details (`copyDialog`), Move, Send, Inbox, Accept, Sharing and Rename deck dialogs |
| `apps/web/src/views/CollectionView.tsx` | Collection header (switcher, Options, + Add, count line) and the Cards (chips, list, `Binder`, `Grid`, `Pocket`), Completion, Missing and Statistics tabs; the `Meter` |
| `apps/web/src/views/StatsView.tsx` | `StatsPanel`: stat tiles, `BarList`, mana curve columns |
| `apps/web/src/views/TradeView.tsx` | Trade view: trade picker, balance bar, two columns with lines (`LineRow`) and searches (`GiveSearch`, `GetSearch`), wishlist matches |
| `apps/web/src/trade-state.tsx` | `useTradeState`: trades, open trade, lines, complete with undo, send, accept, decline, copy, export, share link |
| `apps/web/src/components/TradeDialogs.tsx` | New, Rename, Complete, Send, Accept and Share trade binder dialogs |
| `apps/server/src/trades.ts` | Trade tables and routes, completing and reopening, proposals, matches, share link and the public `/share/:token` page |
| `apps/web/src/card-search.ts`, `filters.ts` | Paged card search hook; filter scopes, `matchesFilters`, `searchParams` |
| `apps/web/src/components/CardResults.tsx`, `Options.tsx`, `Picker.tsx` | Search result views and `useViewSearch`; the Options button, `Segments`, `LayoutRows`; the app's choice list |
| `apps/web/src/views/Views.tsx` | Card search (prices, tags, + Wishlist), `OwnershipTab`, `NoDeck`, `Quantity`, `zoneGroups` |
| `apps/web/src/views/DeckView.tsx` | The deck view: header with switcher and format badge, Cards tab (Quick add, legality bar, List, Text, Stacks, Grid, tokens, hover preview), Ownership, Statistics with Mana symbols and sources, Playtest, Description, History |
| `apps/web/src/deck-rules.ts` | Grouping and sorting deck cards, `checkDeck` legality, `manaBalance`, `deckText`, `parseQuickAdd`, `shuffle` |
| `apps/web/src/components/Switcher.tsx`, `DeckDialogs.tsx` | The collection and deck switcher; Tags, Deck format and Edit as text dialogs |
| `apps/web/src/narrow.ts` | `useNarrow`, `usePhone` |
| `apps/web/src/actions.tsx` | The `ACTIONS` map: every command with label, short label, icon, key; shortcut list; workspace list |
| `apps/web/src/ribbon.ts` | `DEFAULT_RIBBON` (tabs Home, Collection, Decks, Trade, View, Help; groups with `context`), `RIBBON_MENUS` dropdowns, account and app menus |
| `apps/web/src/dock.ts` | Panel registry, layout model, presets, move and remove operations |
| `apps/web/src/prefs.ts` | Preference defaults (currency, collectionSort, collectionLayout), merge (ribbon reset on new version), save to server, theme |
| `apps/web/src/icons.tsx` | `RI` inline SVG icon table (trade, stats, binder, edit, wish, copy, owned, usd, eur added) |
| `apps/web/src/components/` | Ribbon (with TitleBar and DropDown), RibbonCustomize, Dock, StatusBar (PRICES toggle), Dialog, Shell (desktop and phone, Scan tab), About, CardScanner (camera with focus and torch, scanning loop and lock-on, last card strip, scanned list, edit and Add to dialogs) |
| `apps/web/src/panels/Panels.tsx` | Filters, Collections (values, Wishlist badge), Decks, Card (prices, etched, wanted), Deck list, Import review panels |
| `apps/web/src/about/` | About guide pages `01-overview.md` to `22-release-notes.md` (09 Prices and statistics and 10 Wishlists and trading added in 0.3.0, 16 Android app in 0.5.0) |
| `apps/web/src/static.test.ts` | Static checks: guide order and links, release note version, every label in the guide, versions equal, no em dashes |
| `apps/web/public/login.html` | Self-contained sign-in page |
| `apps/web/vite.config.ts` | Vite config, including the plugin that serves and bundles the OCR files under `/ocr` |
| `tests/e2e/` | Playwright suites (`app.spec.ts`, `collections.spec.ts`, `insights.spec.ts`, `scanner.spec.ts`, `android.spec.ts` with a stand-in for the native plugin and the built files served as Capacitor does; the browser runs with a fake camera), fixtures, sample-data server (`serve.mjs`, with sample prices and a flavor name) |
| `docker-compose.yml`, `.env.example`, `Dockerfile` | Dockhand-ready deployment (unchanged in 0.3.0) |

## Open bugs

None known.

## Open ideas

- Android app: sharing CSV or text files into the app, deep links, instant notifications, more than one server or account, background sync of waiting changes; leaving the browser OCR files (about 11 MB) and the x86 libraries out of the APK (55 MB now).
- Price history and price change alerts (prices are a snapshot of the last catalog update).
- A built-in demo document (program-design-guide section 6) was not part of the 0.1.0 specification.
- Optional command line (program-design-guide section 3) was not built.
- The ribbon customize window uses a shared Name box for new and renamed tabs and groups.
- Card images in the binder come from Scryfall; without internet the pockets show card names.

## Known limits

- The Android app has had one camera test on a phone (0.5.0); 0.6.0 was tested in Chromium with a stand-in for the native plugin. ML Kit reading, the camera permission, notifications, the share sheet and the Back button need checking on a phone.
- The app's release signing needs the four `ANDROID_*` repository secrets (README, Android app); without them the tag build fails with a clear message.
- Offline in the app: card search matches names only (no search syntax), prices only for cards opened before, statistics only when opened before.
- The scanner reads English text. Real OCR was checked with synthetic card pictures through Chromium's fake camera (normal, dark title bar, small, large and off-center cards, name-only cards, a sequence of cards); it has not yet been tried on a phone with real cards, foils or sleeves.
- The live camera needs HTTPS or localhost. The OCR files add about 11 MB to the image (about 7 MB is loaded by a browser).
- Sending works only between accounts on the same server. Offers have no expiry.
- Main set needs Scryfall's printed size for each set; it arrives with the first card database update after 0.2.0. Prices and flavor names arrive with the first card database update after 0.3.0.
- Undo history is per page load and reverses by sending the reverse change; a concurrent edit to the same card by someone else is overwritten by an undo.
- Trades work online only (not queued offline in the app). Accepting a trade with another account cannot be undone.
- Imports up to 5 MB and 5,000 rows; backups up to 25 MB.
- Card images load from Scryfall's servers.
- The server serves the built files registered at startup; restart it after rebuilding the interface (Docker does this on every deploy).

## Where work stopped

0.1.0 to 0.8.0 are merged to main (0.8.0 in the pull request for branch `v0.8.0`). All checks pass (`PW_CHANNEL=chrome npm run test:all`: typecheck, 123 server tests, 25 web tests, 36 browser tests). The debug APK for 0.8.0 comes from the `Android app` workflow on the merge to main (Debug build pre-release). Next: check the scanner light and outline on a phone (the light needs a real device), try trading between two accounts, then a phone test of the scanner with real cards, then create the release key and the four repository secrets and tag a release.
