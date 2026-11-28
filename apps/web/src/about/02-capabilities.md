# Capabilities

This page lists what Mana Vault does in the current version, followed by what is planned.

## Available now

### Card search

- Search the local card database by name, type line and rules text, with one result per card name (the newest regular printing, an N printings badge and owned counts by finish summed over every printing), or one per printing with Show every printing.
- Narrow results with filter syntax in the search box (type, color, color identity, rules text, set, rarity, mana value, legality, owned, finishes, treatments, special foils, art, role, power, toughness, year, artist, keyword, frame, border, language) and with the Filters panel.
- Use Scryfall-style syntax in the search box or the Filters panel, including grouped alternatives, exact names and color comparisons, against the local card database.
- Search by what the art shows (cat, dog, bird...) with Scryfall's Art Tags and by what a card does (ramp, removal...) with Oracle Tags, kept on the server.
- Filter by name, card text, creature type, keyword, artist, power, toughness and price ranges, the finishes a printing is made in, foil type, frame, release years and owned or not owned, in card search, collections, decks and trades.
- See special foils (Surge foil, Galaxy foil, Textured foil and others) named on every finish mark and in the printing chooser.
- The Filters panel filters the open view: card search, the open collection or the open deck (its cards, or the cards to add). Each view keeps its own filters.
- Show every result, sorted by name, loading more while scrolling or turning binder pages, with the total in the count line.
- Show results as a Grid or Binder of card pictures with prices and how many you own, or as a List. Each device type remembers its own choice. The deck's Add tab and the trade searches use the same views.
- Click a result to select it, double-click to add it, right-click or long press for its menu.
- Sort results by Best match (the default: exact names first, then names that start with the search words), Name, Newest, Oldest, Price, Mana value, Rarity, Color, Set or Owned first. Card search, the deck's Add tab and both trade searches each keep their own sort.
- Search by price with `usd`, and find cards by their flavor names (such as a Godzilla series name).
- Click a result's set code or rarity to filter by it.
- Show each result's price.
- Show a card's image, mana cost, rules text, printing details, prices and how many copies you own, and want, in the Card panel.

### Collections

- Keep any number of collections per account, each with a name and description. Every account starts with a Main collection.
- Add any printing as a regular, foil or etched copy with Enter, a double-click or one add button that names where the card goes (+ name) and opens the printing chooser with the shown printing selected; a card with one printing skips the printing chooser: with one finish it is added at once, with more only the finish is asked.
- See where cards go: an Adding here mark in the Collections and Decks panels, and ADDING TO in the status bar, which switches between the open deck and the target collection. Cycle the collections with C.
- See one picture per printing in Grid and Binder, with a pip bar under the picture for the count, FOIL or ETCHED, condition, language, Proxy and the number for trade, so the pips never cover the card. A printing held as more than one kind of copy gets a line under the picture for each, with its pips and count. Card pictures show no prices; the List layout has them.
- Change the printing or finish of all or some copies (such as one of two copies to the foil version), keeping their count, condition, language, trade marks and details, and choose whether the decks they fill change too or keep their version.
- Right-click or long press a collection (panel or switcher) to open, rename, change settings, send, export, delete or leave it.
- Record each copy's finish (regular, foil or etched), condition (Mint to Damaged) and language with Copy details.
- Show each entry's value, and each collection's total value, in US dollars.
- Sort entries by name, mana value, price, rarity, color, quantity, or set and number, and group the List layout by type, subtype, rarity, color, color identity, mana value, set or artist, with headings that fold.
- Narrow the list with filter tags by clicking a set code or rarity on an entry, or a bar in Statistics.
- Show a collection as a grid of card pictures that loads more while scrolling (Small, Medium or Large), as binder pages of nine cards with a page box, or as a list. Each device type remembers its own layout.
- Open collections from a switcher with search, five sort orders and the keyboard. In the Collection tab one click on a collection in the switcher or the Collections panel opens it; elsewhere one click in the panel makes it where new cards go and a double click opens it.
- All collections, the first entry of the switcher, lists every entry of every collection with its collection, wishlists included when chosen in Options. Edits act on each entry's own collection.
- Filters, tags and the filter box stay when another collection opens.
- Show statistics: mana curve, colors, types, rarity, finish, top sets by value, average and median prices.
- Change counts with plus and minus buttons, remove a chosen number of copies, Reduce to 1, or remove entries.
- Pick many cards with Ctrl+click, Shift+click, Ctrl+A or Select mode, then remove, reduce to one copy or move them in one step.
- Move copies between collections.
- Filter a collection by card or set name.
- Track completion, or choose None for bulk collections (the default for new collections).
- Keep proxies apart from real copies: marked everywhere, with no value, out of set completion.
- Record purchase price, date added, and misprint, altered and signed marks with each entry.
- Show on each entry the decks its copies fill, and filter entries by In a deck or Not in a deck.
- Import from Mana Vault, Moxfield, ManaBox, Archidekt, Deckbox and TCGplayer CSV files and plain text lists, with the format detected from the file and changeable, into an existing or a new collection, with a preview before anything is added.
- Export the whole collection, the filtered cards, the picked cards or the missing cards in any of those formats.

### Wishlists and trading

- Mark any collection as a wishlist. Its cards are wanted, not owned.
- Add a card, every missing card of a set, or every missing card of a deck to the wishlist in one step.
- Lower wishlist wants as copies of the card are added to collections, asking which wishlist when the card is on more than one.
- Mark copies for trade.
- Save trades with a name and a status (Open, Done or Cancelled); start, rename, cancel and delete them.
- Build a trade in two columns, each with its own search: You give searches your cards for trade (or every card), You get searches the card database. Each line has its own count, finish, condition and a price that can be changed by hand.
- See the balance of both sides in a bar with the difference.
- Complete a trade in one step that can be undone: given cards leave their collections, cards you get are added and wishlist wants go down, with a warning for cards used in decks.
- Send a trade to another account; each side chooses its own sources and destination, and changes go back as counter-offers until one side accepts.
- Browse other accounts' marked-for-trade cards and add them to what you get, without revealing their collection names.
- See wishlist matches both ways: cards others have for trade that you want, and your trade cards others want.
- Copy or export the trade list, and share a public link to your trade binder that can be replaced or turned off.

### Set completion

- Link a collection to any number of sets.
- Count completion by main set, every printing, or each card name once, and by any finish, regular only, foil only, or one of each.
- Show completion overall and per set, and list the missing cards with filters by set, rarity and color.
- Add a missing card from the list, add every missing card to the wishlist, and export the missing list as text or CSV.

### Decks

- Create decks with a name and one of 21 formats; every deck keeps the printing of each card.
- Open decks from a switcher with search, six sort orders, cover card, commander, format and card count. In the Decks tab one click on a deck in the switcher or the Decks panel opens it; elsewhere one click in the panel makes it where new cards go and a double click opens it.
- Change the printing or finish of all or some of a deck card's cards: free copies of the new printing in that finish are linked, from the collection you choose when several have them.
- Keep a finish for every deck card (regular, foil or etched), shown as FOIL or ETCHED in every deck view, the Deck list panel and the Card panel, used for its price, set by `*F*` and `*E*` marks, Add as foil, Add as, linked copies and Change printing. A regular and a foil card of the same printing are separate deck cards.
- Link lines of Edit as text and decklist imports that name a set and number to free copies of exactly that printing and finish; lines without them stay missing until linked. Link owned copies fills every missing card from exact copies.
- Show on a missing deck card when you own it (Owned, link), another version of it (Other version owned, with Switch), or a copy that fills another deck (In Deck name, with Move to this deck).
- Group multiple deck picture statuses into a compact control that opens on hover, focus or tap.
- Mark a deck card Upgrade wanted with the version you want; it stays owned and is listed in the Ownership tab.
- Right-click or long press a deck (panel or switcher) to open, rename, change the format, send it to the print list (whole deck, missing cards or chosen zones), send, export, delete or leave it, and a card in the Deck list panel for the deck card menu.
- The Decks panel groups decks by format with each deck's card count and value.
- Add cards by typing them (Quick add, such as 2 Sol Ring), from the Add tab's card search with + Main, + Side, + Maybe and + Commander (each showing how many are already in the deck), from card search or from the scanner.
- Filter the deck's cards with a filter box and the Filters panel.
- Edit the whole deck as text, checked before it is applied, as one step that can be undone.
- Show the cards as a list, text, stacks of pictures or a grid, grouped by type, subtype, type and tag, rarity, color, color identity, mana value, set, artist or your own tags, and sorted by name, mana value, price, rarity or color.
- Check a deck against its format: deck and sideboard size, copies of each card, banned and not legal cards, and the commander's color identity.
- Keep a maybeboard of cards being considered, list the tokens the deck makes, and point at a card name for a large picture.
- Playtest: shuffle, draw opening hands, mulligan, draw and play official or original custom cards offline. The top-level Play workspace also offers Engine AI, manual solo and private manual Commander tables with read-only spectators; see [Play table](/about/play-table).
- Write a description with headings, lists and links, choose a cover card, and see the history of every change.
- Link each deck card to the copy in a collection that fills it: one deck per copy, chosen when a card is free in more than one collection, changeable later, following the copy when it moves or changes printing (or keeping its version when you choose), and missing when it is removed.
- Rename and delete decks.
- Show all zones or only one (All, Commander, Main, Sideboard, Maybe); the zone shown is where Add puts cards.
- Add deck to collection: put the missing cards, or every card as new copies, into a chosen collection in the deck's printings and finishes, with the missing cards linked to them.
- Add cards to the commander zone, main deck, sideboard or maybeboard, change counts, move cards between zones, remove a chosen number of copies or Reduce to 1, and remove cards.
- Import decklists as text (Moxfield, Arena and MTGO style, with `*F*` foil and `*E*` etched marks) or CSV, with a preview. A line whose name does not match is found by its set and collector number.
- Export decks as text or CSV.
- Check which deck cards have a linked copy, where they are, and what the missing cards cost.
- Export the missing cards of a deck as text, or add them to the wishlist.
- Show deck statistics, colored mana symbols beside the cards that make each color, and the deck's value.

### Play table

- Open the top-level Play mode from desktop or phone navigation, or from the deck's Playtest tab.
- Start an optional Playmat Engine AI match from a saved deck, see the engine-provided turn, phase, step, active player and priority, choose hand or battlefield cards the engine marks playable, select offered abilities, combatants, piles and list choices, pay mana with approved battlefield sources and pass priority. Single numeric prompts use the engine's limits within the workspace range of -10000 to 10000 and can be cancelled. Amount distribution prompts enforce each entry and total and allow cancellation when offered by the engine. List choices support search, optional cancellation and special choices with an item selected; responses longer than 1000 characters and special choices without an item are unavailable. Exact-printing checks run before launch; engine availability depends on separate server configuration, and only the player prompts currently shown in the workspace are supported, including game concession. Selection prompts may offer passing while other choices remain unavailable.
- Engine game-update failures are shown while the workspace retries, and action errors remain visible until another action is attempted. Active games must rejoin before a restored server connection can serve updates; live recovery remains unverified.
- Play a local offline solo game with opening hands, mulligans, draws, library search and shuffle, drag-and-drop or destination-selector zone movement, taps, face-down cards, attachments, counters, tokens, battlefield copies, life, poison, dice and coin flips. Refreshing the page ends this local game.
- Host a private manual Commander table for two or four signed-in players, or join with its invitation code. The game state is stored on the server for reconnects. Each player receives their own hand and library counts, not opponents' hands or libraries.
- Use the Drag area on your cards to move them between zones or use a destination selector, copy your battlefield cards, attach your battlefield cards to any player's battlefield card, play and reveal face-down cards, privately search your library, track life, poison, commander damage, counters and tokens, draw and shuffle, change turns, concede, or report your own loss. Moving to the library by selector offers top or bottom; dragging puts a card on the bottom. Changing zones clears counters. Public player boards show graveyards and exile. The table closes when only one player remains. Copies are tokens that start untapped and without counters or attachments; they retain face-down status. Attachments are cleared when either card leaves the battlefield; players resolve attachment and copy rules themselves. Library search is sorted rather than showing draw order. Opponents and spectators see face-down cards without their identities. Signed-in spectators with an invitation code can see public state but cannot see hidden cards or change the game. Manual tables do not enforce Magic rules or automatically detect losses.
- The initial table version does not include match history, server-restart recovery guarantees, all manual table interactions or full Playmat prompt support. The private Compose profile, unpublished port and trusted-header spoof boundary passed PR CI. Production deployment and engine reconnect or outage behavior remain unverified; do not expose the engine port.

### Proxies and custom cards

- Keep a print list on the server: add a deck, its missing cards, a collection, picked cards, a pasted list, the tokens of the listed cards, or any card from a search.
- Choose each line's printing, count and faces (front, back or both for two-faced cards).
- Set the paper (Letter, A4, Legal or custom), margins, card size, scale, gap, bleed, cutting guides and background, with a live page preview.
- Export a PDF at 300 DPI, pictures for MakePlayingCards with bleed, and a card list for MPC Autofill with custom cards as pictures.
- After exporting, add the printed cards as proxies to a collection or deck.
- Make custom cards in the card maker: every card field, mana symbol buttons, Mana Vault's own frames in six styles and every color, hybrid, gold, artifact, colorless, land and vehicle, with a frame picker, an automatic legendary crown and power and toughness box, creature, planeswalker, saga, token, split and double-faced cards, open-licensed card fonts, uploaded art or a card's art with move and zoom, and PNG export.
- Save custom cards to the card database for every account, in custom sets with their own codes, names, release dates and symbols, with colors, color identity, finishes, prices, legality and tokens, found with `is:custom`.

### Sending and sharing

- Send a collection or deck to another account as a copy, a share (both edit it) or a transfer.
- Accept offers into your library as a new item or, for collections, merged into one of yours; decline or cancel offers.
- See who an item is shared with, stop sharing, or leave an item shared with you.

### Editing

- Undo and redo collection and deck edits, including bulk removes and moves, up to 150 steps per session.

### Card database

- Update the local card database from Scryfall on demand (admins) and on a schedule (168 hours by default), with prices, flavor names, power and toughness, rulings, Art and Oracle tags, special foils and treatments, the full record of every card, and printings in unofficial languages such as Phyrexian.
- Keep a price history: the day's prices are saved with each update when they changed, shown as a chart and table on the card page.
- Keep card pictures on the server in the sizes an admin chooses, each with an estimated download size, downloaded in the background after each update (only new or changed pictures) with pause, resume and a minimum free space, in a picture folder that can be moved.
- Show the number of printings and the date of the last update in the status bar.
- Skip a card whose record fails a check instead of stopping the update, and list the skipped cards.

### Scanning

- Scan cards continuously with the phone or computer camera: each card held in the outline is recognized and added to a scanned list, with a short vibration on phones.
- Recognize the exact printing from the set code and collector number on cards printed since 2019; otherwise match the card name, allowing for reading mistakes, and ask which printing when more than one fits (or take the newest in Quick mode).
- Limit scans to any number of sets, with a "Not in set" warning for other cards, and ignore promos.
- Set the finish, condition and language of the next cards on the strip, mark scans as proxies, and show the scanned list's total value and copies already owned.
- Read light text on dark title bars, and cards held larger, smaller or off center.
- Continuous autofocus, tap to focus and the light: the scanner uses a back camera that has a light, and in the Android app falls back to the phone's own light control. Cameras without a light say so.
- Last card strip with the card's page, edit and +1.
- Edit, remove or clear scanned rows, and add cards by name.
- Add the whole scanned list to any collection or deck, or a new one, as one undo step; cards added to a deck go into a collection for it, remembered per deck, and are linked.
- The scanned list is kept on the device until it is added or cleared.
- Text recognition runs on the device with files served by Mana Vault, so no internet connection is needed.

### Backups

- Download a backup of your own collections, decks and the card records they use, with the custom cards and sets you made or use.
- Check a backup before restoring it, then replace your own collections and decks with it.
- Admins: write whole-server backups on a schedule or at once, keep the newest ones, download them and restore any of them.

### Accounts

- Sign in with a user name and password. Sign-up is open, by one-time invite code, or closed.
- Admins: first-run Setup, and Administration with Accounts, Sign-up, Card database, Pictures, Storage and backups, Devices, Security, Server and Activity. Settings set by environment variables are locked and say which variable sets them.
- Change your password, which signs out your other devices and phones.
- See the phones signed in to your account in Devices..., and remove any of them.
- Keep theme, panel layout, workspace, card layout, where new cards go, open collection and proxy sheet choices per account. Theme, card layout, list groupings, sorts, scanner settings, the proxy sheet and saved workspaces follow the account to other devices at once.

### Interface

- Desktop layout with a title bar holding the File, Edit, View and Help menus, mode tabs (Home, Search, Collection, Decks, Trade, Proxies) that switch the program, dockable panels, workspaces and a status bar. Commands for one collection, deck, card or trade are where it is shown (right-click menus, headers, Options).
- Right-click menus on cards, rows, collections and decks; a long press opens them on a phone.
- Card page with art, rules text, power and toughness, every version with market prices, rulings, and where you own the card.
- Home view with totals, recent collections and decks, trades awaiting an answer, recent scans and the Inbox.
- Phone layout with Home, Search, Collection, Decks, Trade, Proxies and Scan tabs, a nested menu at the top right, full-screen sheets and an installable home screen app.
- The app's own choice lists everywhere, with a search box for long lists and a sheet on phones.
- A built-in About guide (this guide).

### Android app

- An Android app (Android 8.0 or newer) with every feature of the phone layout, installed from the APK on the GitHub releases page.
- Sign in a phone with a server address, then a user name and password; the phone keeps its own device sign-in.
- Use collections, decks, card search with the full search syntax, card pages with rulings and the scanner without a connection, and create collections and decks offline, with changes sent when the connection returns.
- Go offline only when the server cannot be reached, with a sync button that always shows the state and syncs now.
- Offline count changes are applied as differences, so edits made elsewhere at the same time are kept; changes the server refuses are listed.
- Scan with the phone's own text recognition, matched against the card list on the phone when offline.
- Notifications for new offers in the Inbox, checked in the background about every 15 minutes, optionally only on Wi-Fi.
- The Back button, the Android share sheet for exports and backups, sharing lists into the app to import them and pictures or PDFs to read as receipts, background sync as soon as the phone is online, https only, and a daily check of your server for a newer app.

### 0.23.0 additions

- Web pages into notes: paste from a browser, Import pages... with .html files and saved web pages, and New page from web address..., keeping the main article of whole pages, simplified to what the editor shows, with copies of the pictures and a Source line.

### 0.22.0 additions

- Notes on every deck and collection (the Notes tab; a deck's top page is its description), and pages not attached to anything, in trees of child pages.
- A rich text editor with a toolbar and typed shortcuts: headings, bold, italic, strikethrough, code, lists, checklists, quotes, code blocks, dividers, tables, web links, page links (`[[`), card links with the card's picture, and pictures that are pasted, dropped or chosen. Pages save themselves and are stored as markdown.
- The Wiki tab: search across every page, Pinned, Recent, and the Decks, Collections and My pages sections, with drag and drop to reorder pages and move them between decks, collections and My pages.
- Built-in templates (Deck primer, Combo, Sideboard guide, Collection plan) and your own, from Save as template....
- History of each page with Restore, and a choice of which text to keep when two people save the same page.
- Notes follow sharing; My pages stay private.
- Markdown import (files or an Obsidian-style zip, with pictures) and export as a zip of .md files with pictures; deck text exports carry the deck's notes.
- Notes in the Android app without a connection, with pictures added offline and a choice of text when a page changed meanwhile.

### 0.21.0 additions

- MTGJSON data kept on the server: every printing's MTGJSON record, prices from TCGplayer, Card Kingdom, CardSphere, Cardmarket and Cardhoarder (retail and buylist, for each finish), booster contents, sealed product contents, TCGplayer SKUs and the keyword and card type lists, with their own part list and buttons in Administration.
- A main price source chosen for each account (Main price source... in the View menu), used by every price and value, with fallback stores.
- 90 days of price history from every store, filled in once when an admin chooses, then one day at a time; the card page's Price history has one line per store.
- The card page's Prices table (every store, retail and buylist), Oracle and Printed text, the formats a card can lead, and Found in.
- Add precon as deck... and Add precon to collection...; Scan barcode... for a product's barcode in Purchases.
- Expected value of booster packs on purchase lines and openings, Open virtual packs..., and a warning on a pulled card its pack cannot hold.
- Search syntax `is:reprint`, `is:starter`, `can:commander`, `can:oathbreaker`, `can:brawl`, `store:`, `buylist` and `in:`.
- Imports match the exact printing by a TCGplayer, Card Kingdom or CardSphere id, or a TCGplayer SKU.
- Each tab opens where it was left; pressing the tab's button again goes back to its first screen.
- New collection... in every list where cards go to a collection, and Change collection... on a pack.
- Custom set symbols in PNG or WebP get rarity colors too, and a set's common symbol can be white.

### 0.20.0 additions

- Purchases: a Product name on every line, with the named products of the line's set (Commander decks, bundles and others from MTGJSON) to pick from; receipts fill it ("Landing Party", "Beam Me Up Bundle").
- Opening a named Commander deck adds its decklist to the collection and ties every card to the opening in one step.
- Opening names, the product table and the history use the product name.
- A Custom sets tab beside Print and Card maker: the set list, the set's fields, a main symbol and a symbol for each rarity, a sample card for each rarity and the set's cards.

### 0.19.0 additions

- The printing chooser in Grid (the default), List or Binder with a card size, kept for your account, and finish buttons with prices under each picture.
- Finish lines as a card layout item; hidden, a click on a picture of more than one kind of copy asks which one.
- Undo and Redo buttons in the top bar.
- Picking several rows in purchase history: delete several entries, remove several cards from their pack, or move them to another pack.
- Add existing copies... by collection, in List, Grid or Binder, with free counts and Show all.
- Read receipt: a Match cards step for single cards (the printing guessed from the set, version, finish and condition), the order date, taxes and pickup, ignored order page buttons, the order number in the Note and sets from product names.
- Packs opened one at a time: Open how many packs?, each pack its own opening with Next pack, Move to pack..., and cost, values and gain or loss per pack and per product.

### 0.18.0 additions

- Purchases: pulled cards stay on their pack until removed there with **Remove from pack...**, which keeps or deletes the card; deleted copies stay listed as Gone; each pack shows Value when pulled (fixed), Pulled value and Value now; the entry tables are grids with Finish, Value when pulled and State columns.
- An opening started on the web page is picked up by the phone: the scanner scans into it, the open app asks to start scanning, and the background check shows Opening started with Start scanning.
- Workspaces in the account menu.
- The search, its results and its scroll position are kept when switching tabs.

### 0.17.0 additions

- Purchases: single cards found by search with pictures and every printing, scanned into the purchase, or taken from the scanned list; a searchable set list; receipts read from a photo, PDF or screenshot and kept with the entry; places shared on the server, editable by every account, merged and deleted by admins; who paid shipping on each sale; trade entries with Gave, Got, Net and Original cost; opening buttons Add cards, Scan, Add existing copies... and Done opening.
- List views in decks, collections, All collections, card search and the print list: ten groupings, five sorts, mana symbols, columns on wide screens and a menu button on each row.
- Prices in US dollars only.
- One art library for the server.

### 0.16.0 additions

- Purchases: purchases with product lines and single cards, tax and shipping spread over the lines, Open... with pulled cards tied to the opening, sealed values with history, card and product sales that remove copies, trades recorded when completed, imported purchase prices, Spent, Received, Value now and Gain or loss with a chart, History filters, CSV export, undo and backups.

### 0.15.0 additions

- A pip bar under every card picture (above each picture in deck Stacks) holds all the pips, so nothing covers the card.
- Card layout (View menu): drag the count, printings, finish, status marks, price and buttons to the corners of the picture, the row under it (left or right), a second line or the bottom, or hide them; one layout for every section or one per section (Card search, Collections, Decks, Trade, Proxies).
- Live updates: changes made in the app, on another device or by someone sharing a collection or deck show on open pages within a second or two, without reloading.
- In the Android app one tap opens a collection or deck.
- Custom sets have a right-click menu (Edit set..., Show its cards, New card in this set, Delete...) and their own tab to change the name, code, release date and symbols, with undo. Set symbols can be SVG, a Scryfall set symbol or a picture, drawn in rarity colors, with a symbol of its own for any rarity.
- One Symbols window in the card maker puts symbols at the cursor of the mana cost or rules text, with Scryfall's full symbol list and names.
- An art library per account for the card maker.
- Set symbols and block, parent set and digital details in filters, set pickers, set completion, the card page and the printing chooser.
- Rules text and mana costs on the card page show symbols as pictures.
- Scryfall's printing changes are applied: merged printings move every copy, deck card and list line; removed printings show Printing removed.
- Suggestions for card names, types, keywords and artists in card search, Quick add, the scanner and the card maker.
- Card backs for proxies: mirrored back pages in the PDF, and back.jpg in the MakePlayingCards zip.
- Card languages in Administration: English and unofficial, all, or chosen languages, with a size estimate.

### 0.14.0 additions

- Prices on pictures (View menu): a price pip on every card picture, off by default.
- The print list sorts (Order added, Name, Set, Mana value, Rarity, Color, Price, Count) and shows as a List, Grid or Binder; the PDF follows its order.
- Card pictures for printing are fetched three at a time and tried twice; the server uses a smaller size when the full-size picture cannot be had, and cards still without a picture are listed before a PDF or zip is made.
- The card maker has a mana symbol picker and five frame styles: Classic, Borderless, Full art, Showcase and Nickname. On a phone the whole card shows small at the top and a tap shows it full size.

## Planned

These are part of the release plan and are not available yet.

| Version | Planned features |
|---|---|
| Later | Windows, Linux and other installs besides Docker; a built-in demo collection; instant notifications while the Android app is closed; more than one server or account in the Android app |
