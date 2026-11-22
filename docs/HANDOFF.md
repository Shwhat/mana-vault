# Mana Vault handoff

Last updated: 2026-11-22, version 0.18.0.

## Project

Mana Vault is Devon's self-hosted Magic: The Gathering collection and deck manager (repository Shwhat/mana-vault). It runs as one Docker container (Node.js 22, Fastify, SQLite) and serves a React interface for desktop browsers and phones. Version 0.1.0 rebuilt the interface in the OpenSchem design style (program-design-guide skill, "look and shell" adoption), added sign-in, per-account preferences, undo, the About guide and Dockhand-ready deployment. Version 0.2.0 added multiple collections per account, set completion, bulk editing, per-account ownership of collections and decks, sending (copy, share, transfer) with an Inbox, and deck rename and delete. Version 0.3.0 added prices and values, statistics, deck ownership, wishlists, the trade list and trade calculator, copy details (finish, condition, language, trade count), filter tags, the binder layout and flavor name matching. The 0.3.0 features came from a comparison with AeroEagle/mtg-collection-viewer. Version 0.4.0 rebuilt the camera scanner as a continuous, ManaBox-style live scanner with a scanned list. Version 0.5.0 added the Android app (Capacitor around the same interface) with device sign-in, offline use and sync, phone text recognition and Inbox notifications. Version 0.6.0 linked deck cards to collection copies, added proxies and copy details, import and export windows for seven formats, a ManaBox-style scanner with settings and a printing picker, the card page with rulings, a ribbon-only menu with right-click menus, and the phone Home screen. Version 0.7.0 added the Moxfield-style deck builder (Quick add, Edit as text, four views, groups, tags, maybeboard, format checks, playtest, description, history, tokens), the shared collection and deck switcher, the Grid collection layout, and layout fixes from Devon's screenshots. Version 0.8.0 added saved trades (two-column builder, complete with undo, trading between accounts with counter-offers, wishlist matches, public trade binder), card search views (Grid, Binder, List) with paging and owned counts, filters that follow the open view, All collections, the deck header and Add tab, one picker everywhere, ribbon cleanup and scanner fixes (outline and light). Version 0.9.0 added Proxies (a print list kept on the server, sheet settings with a page preview, PDF, MakePlayingCards and MPC Autofill exports, adding printed cards as proxies), the card maker (custom cards in custom sets, saved to the card database for every account), change printing for deck cards and collection copies, adding to the collection or deck selected last, the Decks panel grouped by format with values, right-click menus on collections and decks, `*F*` and `*E*` marks in deck lists, and card database updates that skip bad records. Version 0.10.0 added a finish for every deck card and finish buttons in the printing chooser, so deck cards and collection copies can switch to their foil or etched version. Version 0.11.0 refined card tracking between decks and collections: exact-printing links from Edit as text and imports, Link owned copies, Owned and Other version owned marks with Switch, deck cards that follow their copies' printing and finish, a choice to keep a deck's version when a copy changes, How many to change, Upgrade wanted, finish badges everywhere, Remove how many and Reduce to 1, Add buttons with finishes that name the destination, and Target and Adding here marks. Version 0.12.0 added the admin role and Administration (first-run Setup, Accounts, Sign-up with invite codes, Card database, Pictures, Storage and backups, Devices, Security, Server, Activity), card pictures kept on the server, the full Scryfall data offline (Art and Oracle tags, raw records, unofficial languages), price history, grouped card search, one Add to name button with the printing chooser, picture stacks with finish lines, special foils and many new filters. Version 0.13.0 made one click on a collection or deck pick where cards go (a double click opens it), added Sort to every card search with Best match first, removed the trade buttons and T and G keys outside Trade, replaced prices and text lines on card pictures with pips, added zone buttons that show one zone and set the add zone, added Add deck to collection, and removed Ctrl+N. Version 0.13.1 made card search faster. Version 0.14.0 replaced the ribbon with a menu bar (File, Edit, View, Help) and mode tabs, fixed account delete and blank proxy pictures, added the card maker's symbol picker, frame styles and phone preview, print list sort and views, and prices on pictures. Version 0.15.0 added the pip bar under card pictures, one tap to open in the app, custom set editing with SVG and Scryfall set symbols, one Symbols window, the art library, more Scryfall data (set symbols, symbols, printing changes, name and keyword lists, card back), suggestions, card backs for proxies and card languages. Version 0.16.0 added purchase history (the Purchases tab). Version 0.17.0 reworked purchases (single cards by search, scan or scanned list, a set list, receipts, shared places, who paid shipping, trade figures, opening buttons), added grouped list views everywhere, made prices USD only, added Send to print list... on decks, In Deck marks with Move to this deck, the wishlist question, undo that restores deck links, the card maker's new styles, frames, crown, P/T box, split and saga layouts, frame picker and fonts, one shared art library, phone layout fixes, and Android sharing, background sync, full offline search, https only and server update checks. Version 0.18.0 added the card layout (View, Card layout...: pips and buttons placed around card pictures, per account, one layout or one per section), one OWNED pip in search, live updates (server-sent events), scanning on the phone into an opening started on the web, pulls that stay on their pack (Gone, Remove from pack..., Value when pulled, Pulled value, Value now), purchase tables as grids, the finish choice for cards with one printing, the new click rules for collections and decks, a kept search when coming back, workspaces in the account menu and the Administration overlap fix.

## Rules

- Do not build or change the program until Devon says "build it". Settle the specification first with questions. Since 0.11.0, "build it" means build, push and merge (Devon, 2026-11-20).
- Before building, review the enabled skills and state which apply (program-design-guide, program-about-guide, docker-server-setup at minimum; dataviz for charts). Load each one that applies.
- Do not commit or push until asked. Do not remind Devon about uncommitted work.
- A change to how cards look or what they can do goes to every place the same thing appears (collection List, Binder and Grid, All collections, card search, deck List, Text, Stacks and Grid, the Deck list panel, the Card panel and card page, trade lines, the scanned list, proxies), not only the view Devon mentions. Use one shared component or helper so the places cannot drift apart.
- Never use em dashes anywhere (code, comments, docs, interface text). A static test enforces this.
- Answer questions simply and directly, without extra unrequested actions.
- Keep a task list while building, update the README feature list and keep the keyboard shortcut list current (README, About guide page 21 Settings and shortcuts, `SHORTCUTS` in `actions.tsx`, key handling in `main.tsx`).
- Every update ships the server and the Android app together. Attach a debug APK to each build until the app is closer to finished. The `Android app` workflow builds it for every pull request and push to main (artifact `mana-vault-X.Y.Z-debug`; pushes to main also replace the `debug` pre-release on the releases page with it), signed with the shared debug key `apps/android/android/app/debug-shared.p12` so debug builds install over each other. The workspace cannot reach Maven Central, so take the APK from the CI run.
- Update this handoff (here and in the claude.ai manavault project, identical) with every build.
- Raise the version in every place with each delivered build: `package.json`, `apps/server/package.json`, `apps/web/package.json`, `apps/android/package.json` and `package-lock.json` (run `npm install --package-lock-only`). Patch for fixes, minor for features, major only when Devon says so. A static test checks they match.
- Every pull request that changes what the app does, or the rules it follows, also updates the About guide: the affected pages, Capabilities, and a new entry in the release notes. It also raises the version. The version is shown in the guide.
- Every change gets tests; `npm run test:all` must pass before delivery. Where Playwright cannot download its browser, run it with an installed Chrome: `PW_CHANNEL=chrome npm run test:all`.
- The app is in early development: change things when they need to change. Do not hold back or work around a change to keep older versions, older files or older data working (Devon, 2026-11-22). Mark stored formats with the app version rather than a separate number.
- Deployment follows the docker-server-setup skill: Dockhand only, no Watchtower, absolute data path, UID 65532, no cloudflared or reverse proxy in the stack.

## Next (0.19.0)

- Nothing is specified. Follow-ups to ask Devon: whether the card layout editor, live updates, scanning into an opening from the phone (and the Opening started notification), Remove from pack, the three pack figures and the purchase grids work the way Devon wants; whether the Scanned list should also get a picture view with pips (it has no pictures with pips, so the card layout has no Scanned list section).
- Still to ask from 0.17.0: the purchase window (Find cards, Scan, From scanned list, set list), receipts, places, the shipping choice, trade tiles, list views, the phone card maker page and the wrapping rows.
- Left from earlier specs: a chart of one entry's value over time on the purchase entry page (SPEC-0.15.0).

## Decisions (0.18.0 card layout, live updates, openings across devices, pulls on packs)

- Specification: `docs/SPEC-0.18.0.md` in the claude.ai project. Devon answered by click-through prompts and said "build it".
- Card layout: `card-layout.ts` (model: items count, printings, finish, marks, price, buttons; places tl, tr, bl, br, left, right, full, bottom; `moveItem`, `setSame`, `readCardLayout`) and `components/CardFrame.tsx` (`CardFrame` used by search results, collection Stack, deck Picture and the print list picture; the Card layout window). Pref `cardLayout` (`same`, `all`, `sections`). Sections: search, collection, deck, trade, proxies. Deck Stacks puts the rows above the picture (`above`).
- The FOIL count pip was the owned foil count, not printings; search now shows one OWNED pip with the total (tooltip by finish).
- Click rules: `pickOrOpen(key, pick, open, opensOnClick)` in PickOpen.tsx. Panels open on one click in the collection and deck views; elsewhere one click picks and `event.detail >= 2` (or a double tap within 350 ms) opens. Switchers always open on one click. The Android app follows the same rules.
- Search kept: `useCardSearch` skips a fetch when the search key (filters, group, currency, sort, round) equals the last completed one; `reload()` refetches the loaded pages in place (owned counts) and runs when CardsView mounts; result lists keep their scroll position by list name.
- Live updates: `events.ts` (server) and `live.ts` (browser and app). GET /api/events is server-sent events; the onResponse hook publishes every successful change to the account and everyone sharing a collection, deck, open trade or offer with it, skipping the page named by `x-mana-vault-client` (`CLIENT_ID` in api.ts). The app signs in to the stream with `?device=<token>`. Only shared settings (`SHARED_PREFS` in live.ts) are adopted from other devices, and only when no local save is pending (`prefsPending`), so prefs cannot ping-pong.
- Openings across devices: changes to `/api/purchases/.../open` and `/api/purchases/openings/...` send the active opening in the event; `/api/sync/state` has `opening`; InboxWorker shows Opening started with Start scanning once per opening (`lastOpening` in Settings, also set by the app when it already knows the opening); the notification uses the offer extra `scan:<id>`. The scanner's Add to... fills in the opening's collection.
- Pulls stay on packs: `x-mana-vault-undo: undo|redo` marks undo and redo requests (`asUndo` in api.ts, `undoStepOf` in copy-events.ts). Lowering copies unties only on "undo"; raising copies ties unless "undo". `purchase_ties.value_then` (filled from price history once for older ties) is Value when pulled. DELETE /api/purchases/ties/:id returns `held` and `have`; POST /api/purchases/ties/restore puts a tie back as it was; POST /api/purchases/ties/packs names the packs for the remove note. Entry ties carry `valueThen`, `sold`, `traded`, `gone`; openings carry `valueWhenPulled`, `valuePulled` (Pulled value), `valueNow`, `gone`.
- One printing: `addCard` and `PrintingList single` skip the chooser; `FinishChoice`/`chooseFinish` ask only the finish, focused on the Add as foil choice.
- Workspaces live in `ACCOUNT_MENU` (expanded with `useWorkspaceActions`); `cardLayout` is in the View menu.

## Decisions (0.17.0 purchases, list views, USD only, card maker, Android)

- Specification: `docs/SPEC-0.17.0.md` in the claude.ai project. Devon answered every question by click-through prompts and said "build it".
- Single cards in a purchase are never typed: Find cards (search grid, then the printing list inline), Scan (scanner target "This purchase", `scanningForPurchase` in PurchaseDialogs.tsx) or From scanned list.... A purchase starts with no lines.
- Places are server-wide (`places` table, `purchase_entries.place_id`). Any account adds and edits; admins merge (undo with `/api/places/restore`) and delete. The first start of 0.17.0 turns existing place text into places. Backups restore places by name.
- Shipping on sales is per entry (`shipping_by`: `buyer` default, `me`). Fees always lower the money in.
- Receipts: the server reads PDFs (pdfjs-dist legacy build) and pictures (tesseract.js with the /ocr model files); the Android app reads camera photos with ML Kit first. Receipts are kept in `purchase_receipts` (BLOB, 20 MB limit) and in account backups.
- Ties move with copies (`copiesMoved` copy event from move and printing routes).
- List views share `list-groups.ts` and `GroupedList.tsx`; groups and folded headings are per account (`listGroups`, `listFolds`). Devon chose to keep the FOIL pip, not a rainbow mark.
- USD only: EUR columns are nulled once (flag `eur_dropped`), the `eur:` filter and every currency switch are gone.
- Undo of removing deck cards: removed links are kept in `removed_links` for 60 minutes (`RELINK_MINUTES`) and relinked by undo.
- Wishlists: `lowerWishlists` returns `wishAsk` when a card is on more than one wishlist; `askWishlists` (WishlistAsk.tsx) asks once per batch and posts `/api/wishlists/lower`.
- Change printing with more than one card: one dialog with two steps (`TwoSteps` in PrintingDialog.tsx), how many first starting at 1.
- Card maker frames are drawn by Mana Vault (Devon asked to extract Cardforge's frames; declined because they are not ours to copy, and Devon accepted). Fonts are Crimson Pro and Merriweather Sans (OFL, @fontsource).
- Art library is one for the server (flag `art_library_shared` joins libraries once, deduped); the uploader or an admin renames and deletes.
- Android: SEND intent for text, CSV, PDF and pictures; SyncWorker (WorkManager, CONNECTED) sends waiting changes; the server's sync ids make resends harmless. https only, except localhost and 127.0.0.1 so the tests keep working. Android 8.0 stays the minimum. Update checks call `/api/app/latest`; `/api/app/apk` fetches the release APK once into `<data>/apk`.
- Backups (0.17.1): the `version` field holds the Mana Vault version that made the backup (`APP_VERSION` in backup.ts, read from the server's package.json), not a separate number. A backup from a newer version is refused (`compareVersions`); numbered backups 1 to 7 still restore. Entry snapshots carry the place, who paid shipping and the receipt, and a restore joins places by name. Pictures in the shared art library are backed up by the account that added them.
- Offline search uses `compileQuery` (query-match.ts), mirroring the server parser; `art:` and `otag:` still need the server.

## Code map

| Path | Contents |
|---|---|
| `apps/server/src/app.ts` | Fastify app: request guard and security headers, account routes (new accounts get a Main collection), prefs, card search and card detail (prices, flavor name, owned per collection with etched and trade, wanted in wishlists), collection imports, decks (scoped by owner and members, rename, delete), backups, catalog status, SPA fallback for `/about/...` |
| `apps/server/src/library.ts` | Access checks, collections CRUD (kind), `collectionValue`, `ENTRY_COLUMNS`, copy keys in POST/PUT (`trade`)/move, bulk add `POST /cards/add` (returns before and after for undo), set completion and missing, members, shares |
| `apps/server/src/insights.ts` | `summarize` (stat tiles and buckets), `deckOwnership`, routes `/api/collections/:id/stats`, `/api/decks/:id/stats`, `/api/decks/:id/ownership`, `/api/trade` |
| `apps/server/src/copies.ts` | Copy key parsing (`readCopyKey`, `readCondition`, `readLanguage`, `readFinish`), conditions and languages, `priceSql` per currency |
| `apps/server/src/scan.ts` | Scan matching: `NameMatcher` (in-memory trigram index of names, front faces and flavor names, rebuilt when the catalog changes), `readInfoLine`, `matchScan`; routes `POST /api/scan/match` and `GET /api/cards/:cardId/printings` |
| `apps/server/src/sets.ts` | Scryfall set list storage (`saveSets`, with symbol address and details), set search (`listSets`), `setDetails`, `setsWithSymbols` |
| `apps/server/src/scryfall-extras.ts` | Set symbols, symbology, migrations (`applyMigrations`, `mergePrinting`, `mergeHooks`), catalogs and `suggest`, card back, `importScryfallExtras` |
| `apps/server/src/receipts.ts` | Receipt reading: `pdfText`, `pictureText`, `parseReceipt` (date, place, products, set codes, tax, shipping) |
| `apps/server/src/app-updates.ts` | `/api/app/latest` and `/api/app/apk` (public), the APK fetched once from the GitHub release |
| `apps/server/src/extras.ts` | Routes for set symbols, symbology, suggestions and lists, card backs, the art library and Administration's card database parts and language estimate; `importCustomArt`, `addToArtLibrary` |
| `apps/server/src/svg.ts` | `cleanSvg` and `SVG_HEADERS` |
| `apps/server/src/purchases.ts`, `copy-events.ts` | Purchase history tables, figures, chart, routes, backups; events for copies added or lowered and trades done or undone |
| `apps/web/src/views/PurchasesView.tsx`, `components/PurchaseDialogs.tsx`, `purchase-state.ts` | The Purchases view, its windows and the active opening |
| `apps/web/src/components/CustomSets.tsx`, `SymbolPicker.tsx`, `ArtLibrary.tsx`, `Suggest.tsx` | Custom sets window and Edit set; Symbols window, `SymbolGlyph`, `SymbolText`; art library window; text fields with suggestions |
| `apps/server/src/auth.ts` | Users (admin, disabled, must change), sessions (token hashes), prefs table, PBKDF2, rate limiter, cookie helpers |
| `apps/server/src/settings.ts` | Server settings with defaults, input checks, environment locks (`settingsFromEnvironment`) |
| `apps/server/src/admin.ts` | Administration routes (`/api/admin/...`): overview, settings, accounts, invites, devices, activity, server check and log, folder browser, server backups and restore; `logActivity`, `startBackupSchedule`, `applyPendingRestore` |
| `apps/server/src/pictures.ts` | Card pictures on the server: `/pictures/*`, the onSend address rewrite, background downloads, estimates, move; `localPicture` |
| `apps/server/src/logs.ts` | `captureLogs` keeps the newest 500 log lines for Administration |
| `apps/web/src/views/AdminView.tsx` | Administration and Setup pages, `chooseServerFolder`, `forcePasswordChange` |
| `apps/web/src/views/PriceHistory.tsx` | Price history chart and table on the card page |
| `apps/server/src/index.ts` | Startup, environment variables, `-healthcheck` flag |
| `apps/server/src/database.ts` | Schema and migrations: cards (finishes, promo, variation; prices and flavor_name in 0.3.0), sets, collections (kind), collection_cards (0.3.0 key with condition, language, trade; `upgradeCopies` rebuilds the 0.2.0 table), members, shares, decks.owner_id; `cardPricesStatement` |
| `apps/server/src/custom.ts` | Custom sets and custom cards: routes, card data reading (`readCardInput`, `manaValueOf`, `colorsIn`), `customCardUse`, pictures and art, `CUSTOM_PUBLIC` |
| `apps/server/src/proxies.ts` | Print list, full-size card pictures through the server (`scryfallSize`), mana symbols, tokens of a list |
| `apps/web/src/card-render.ts` | Card maker drawing: `FaceDesign`, frames and palettes, `frameOf`, text layout with symbols, `renderCard`, `loadPicture` |
| `apps/web/src/components/CardMaker.tsx` | The card maker: list, fields, art, card data, custom sets window (`SetManager`), save, duplicate, delete, PNG export |
| `apps/web/src/proxy-print.ts`, `proxy-state.tsx` | Page layout (`layoutPages`, `facesOf`, `readSheet`), PDF, MakePlayingCards zip, MPC Autofill list; the print list state |
| `apps/web/src/views/ProxiesView.tsx` | Proxies view: Print tab (adding, lines, sheet settings, preview, exports) and the Card maker tab; `addFromDeckDialog` |
| `apps/web/src/components/PrintingDialog.tsx`, `ItemMenus.tsx` | The printing chooser (How many to change); collection and deck right-click menus and rename dialogs |
| `apps/web/src/components/CardMarks.tsx`, `AddButtons.tsx` | Shared card marks (finish and Upgrade wanted badges, CountPip and FinishPip for pictures, Owned and Other version owned, Remove how many); Add buttons and menu items with finishes that name the destination |
| `apps/web/src/components/PickOpen.tsx`, `zones.ts`, `search-sort.ts` | One click picks and a second opens (`pickOrOpen`); the zone button actions; search sorting kept in the browser (`sortFound`, `matchRank`, `plainWords`) |
| `apps/server/src/backup.ts` | Account backups marked with the app version since 0.17.1 (`APP_VERSION`, `compareVersions`); numbered layouts before that: 7 purchases, 6 art library, 5 custom sets and cards; version 4 (proxy, copy details, deck collection, deck links); before that version 3 (collections with kind, copies with finish, condition, language, trade, decks, deck cards, card records); versions 1 and 2 restore with defaults |
| `apps/server/src/collection-import.ts`, `deck-import.ts`, `card-search.ts`, `catalog-updater.ts`, `import-*.ts` | Import (condition, language, etched, tradelist counts, `nameMatch` for flavor and front face names), search (`usd`, `eur`, flavor names) and catalog logic; the bulk import stores prices and flavor names |
| `apps/server/src/decks.ts` | Deck routes: list, create (id from the caller), rename, format, description, cover card and deck collection, cards with links, tags, legality data and missing counts, link copies (`linkCopies`, switches printing), candidates; `ZONES`, `FORMATS`, `logDeck` |
| `apps/server/src/deck-builder.ts` | Deck builder routes: `GET /api/cards/resolve`, deck card tags, `replace` (edit as text, `replaceDeck`), history, tokens |
| `apps/server/src/links.ts` | Deck link helpers: `linkedCount`, `trimLinks`, `addLink`, `moveLinks`, `capDeckCardLinks`, `deckLinks`, `collectionLinks`, `touchDeckCollections` |
| `apps/web/src/formats.ts` | Export formats (`EXPORT_FORMATS`, `exportText`) |
| `apps/web/src/components/FileWindows.tsx`, `ContextMenu.tsx` | Import and Export windows; right-click and long-press row menus |
| `apps/web/src/views/HomeView.tsx`, `CardPage.tsx` | Phone Home screen; card page (versions, rulings, card actions button) |
| `apps/server/src/events.ts`, `apps/web/src/live.ts` | Live updates: `Events` (streams per account, `audience`, `publish`), `areasOf`, `/api/events`; the browser side (`useLiveUpdates`, `startOpeningScan`, `PURCHASES_CHANGED`) |
| `apps/web/src/card-layout.ts`, `components/CardFrame.tsx` | Card layout model and the frame every card picture uses, with the Card layout window |
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
| `apps/web/src/menus.ts` | `MENUS` (File, Edit, View, Help menus as action names), `MODE_TABS`, `ACCOUNT_MENU`, `APP_MENU`, `DESKTOP_ONLY` |
| `apps/web/src/dock.ts` | Panel registry, layout model, presets, move and remove operations |
| `apps/web/src/prefs.ts` | Preference defaults (currency, collectionSort, collectionLayout), merge, save to server, theme |
| `apps/web/src/icons.tsx` | `RI` inline SVG icon table (trade, stats, binder, edit, wish, copy, owned, usd, eur added) |
| `apps/web/src/components/` | MenuBar (TitleBar with the menus, ModeTabs, DropDown), Dock, StatusBar (PRICES toggle), Dialog, Shell (desktop and phone, Scan tab), About, CardScanner (camera with focus and torch, scanning loop and lock-on, last card strip, scanned list, edit and Add to dialogs) |
| `apps/web/src/panels/Panels.tsx` | Filters, Collections (values, Wishlist badge), Decks, Card (prices, etched, wanted), Deck list, Import review panels |
| `apps/web/src/about/` | About guide pages `01-overview.md` to `24-release-notes.md` (09 Prices and statistics and 10 Wishlists and trading added in 0.3.0, 11 Proxies and the card maker in 0.9.0, Android app in 0.5.0, 17 Administration in 0.12.0) |
| `apps/web/src/static.test.ts` | Static checks: guide order and links, release note version, every label in the guide, versions equal, no em dashes |
| `apps/web/public/login.html` | Self-contained sign-in page |
| `apps/web/vite.config.ts` | Vite config, including the plugin that serves and bundles the OCR files under `/ocr` |
| `tests/e2e/` | Playwright suites (`release090.spec.ts` for 0.9.0 and the 0.10.0 foil switch, `app.spec.ts`, `collections.spec.ts`, `insights.spec.ts`, `scanner.spec.ts`, `android.spec.ts` with a stand-in for the native plugin and the built files served as Capacitor does; the browser runs with a fake camera), fixtures, sample-data server (`serve.mjs`, with sample prices and a flavor name) |
| `docker-compose.yml`, `.env.example`, `Dockerfile` | Dockhand-ready deployment (unchanged in 0.3.0) |

## Open bugs

None known.

## Open ideas

- Android app: deep links, instant notifications, more than one server or account; leaving the browser OCR files (about 11 MB) and the x86 libraries out of the APK (55 MB now).
- Price change alerts (price history is kept since 0.12.0).
- A built-in demo document (program-design-guide section 6) was not part of the 0.1.0 specification.
- Optional command line (program-design-guide section 3) was not built.
- Card maker: printing both faces of a custom card on a double-sided MPC order.
- Proxies: saving several named print lists; a preview of the back pages.

## Known limits

- Live updates: the card search's owned counts are reloaded in place only when coming back to Search or on a live update while Search is open; with a Cloudflare Tunnel the stream depends on it passing server-sent events (a comment is sent every 25 seconds). The Opening started notification comes from the background check (about every 15 minutes, only with Inbox notifications on); while the app is open the question shows at once.
- A copy deleted and later added again in the same collection is counted as held again by the oldest tie of that copy.

- One click on a deck to make it where cards go loads that deck as the open deck, so a deck view that is showing another deck switches to it (the view itself stays). Undo of Add deck to collection with Every card as new copies lowers the counts back; copies added on top by other edits in between are kept.
- Undo puts removed deck links back only within 60 minutes of the remove.

- The Android app has had one camera test on a phone (0.5.0); 0.6.0 was tested in Chromium with a stand-in for the native plugin. ML Kit reading, the camera permission, notifications, the share sheet and the Back button need checking on a phone.
- The app's release signing needs the four `ANDROID_*` repository secrets (README, Android app); without them the tag build fails with a clear message.
- Offline in the app: `art:` and `otag:` searches need the server, prices only for cards opened before, statistics only when opened before. Background sync and file sharing into the app have not been tried on a phone.
- The scanner reads English text. Real OCR was checked with synthetic card pictures through Chromium's fake camera (normal, dark title bar, small, large and off-center cards, name-only cards, a sequence of cards); it has not yet been tried on a phone with real cards, foils or sleeves.
- The live camera needs HTTPS or localhost. The OCR files add about 11 MB to the image (about 7 MB is loaded by a browser).
- Sending works only between accounts on the same server. Offers have no expiry.
- Main set needs Scryfall's printed size for each set; it arrives with the first card database update after 0.2.0. Prices and flavor names arrive with the first card database update after 0.3.0.
- Undo history is per page load and reverses by sending the reverse change; a concurrent edit to the same card by someone else is overwritten by an undo.
- Trades work online only (not queued offline in the app). Accepting a trade with another account cannot be undone.
- Imports up to 5 MB and 5,000 rows; backups up to 250 MB.
- Printing proxies and the card maker's mana symbols need the server to reach Scryfall (cards.scryfall.io, svgs.scryfall.io); without it cards print as white cards with names and symbols are drawn circles. Two-faced cards print their back only after the first card database update with 0.9.0.
- MPC Autofill's own XML order files point to images in its online index, so Mana Vault writes a card list instead. The MPC Autofill list format and the MakePlayingCards picture size (822 x 1122) have not been tried with a real order.
- A Scryfall set that later takes the code of a custom set would rename that set on the next update (custom codes are checked only when made or changed).
- Purchase history: the chart counts a sold card as gone from the date of its sale only when the sale names the purchase it came from; Redo of Open... and Untie is not offered (they are done again from the entry). Older backups (before version 7) keep the current purchase history, whose ties then point to replaced collections.
- Set symbols, symbols, printing changes, suggestions lists, the card back and other card languages arrive with the first card database update with 0.15.0; until then the Symbols window uses its built-in groups and suggestions are empty. The language size estimate uses rough counts until a language has been downloaded once. The Scryfall endpoints for migrations, catalogs and card backs could not be called from the workspace (no internet); they were tested with stand-in answers.
- Custom card pictures are made in the browser with the bundled card fonts. Receipt reading was tried with generated PDFs and pictures, not with real store receipts.
- The print list saves count changes 400 ms after the last change; a change made just before closing is sent while the page closes.
- Card pictures not downloaded to the server load from Scryfall through it. Scryfall's Art Tags and Oracle Tags bulk file names could not be checked from the workspace (no internet); the importer finds them by type or name, and a missing file only leaves tags empty.
- Whole-server backups include the card database (with raw records) and can be large; keep the number kept small on small drives.
- The server serves the built files registered at startup; restart it after rebuilding the interface (Docker does this on every deploy).

## Where work stopped

0.1.0 to 0.17.1 are merged to main. 0.18.0 (the card layout, live updates, scanning into an opening from the phone and pulls that stay on their pack) is pull request 31 from branch v0.18.0; its checks passed and it waits to be merged. All checks pass (`PW_CHANNEL=chrome npm run test:all`: typecheck, 280 server tests, 44 web tests, 73 browser tests). The debug APK is the `mana-vault-0.18.0-debug` artifact of the `Android app` workflow and the `debug` pre-release on the releases page. Still to check on a phone for 0.18.0: the live update stream in the app, the Opening started notification and Start scanning, double tap in the Search screen. Next: ask Devon the follow-ups under Next. Still to check on real devices: Read receipt with real store receipts, sharing a CSV and a picture into the app, background sync after the phone comes back online, the card maker on a phone, a card database update with 0.15.0 extras, picture downloads, a printed test sheet with card backs, a MakePlayingCards upload, trading between two accounts, then the release key, the four repository secrets and a release tag (the update check downloads the APK from the release).
