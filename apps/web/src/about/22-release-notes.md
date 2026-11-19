# Release notes

The installed version is shown at the top of this guide.

## 0.7.0 (2026-11-19): Deck builder, switchers and card grid

- Deck builder: Quick add (type "2 Sol Ring", with names suggested), Edit as text with Check and Apply as one undo step, and the views List, Text, Stacks and Grid, grouped by type, mana value, color, rarity or tag and sorted by name, mana value or price.
- Maybeboard: a fourth deck zone for cards being considered, left out of the deck's size, value, statistics, ownership and legality.
- Format and legality: 21 formats. Decks are checked for size, sideboard size, copies, banned and not legal cards and the commander's color identity; problems are listed above the cards and cards that break a rule are marked Not legal.
- Tags on deck cards, used as groups.
- Deck tabs Playtest (opening hand, mulligan, draw, play, tap), Description (with a cover card) and History (every change with date and person).
- Deck statistics start with Mana symbols and sources. The deck lists the tokens its cards make, and pointing at a card name on the desktop shows a large picture.
- Switchers: collections and decks open from the same searchable list, with sorting (Recently opened, Name, Date created, Card count, Value, Format, Commander), card counts, values, commanders and formats, and keyboard use. On a phone the list is a full sheet. The phone's Decks button is replaced by the switcher.
- Collections show as a Grid of card pictures that loads more while scrolling (Small, Medium or Large), Binder pages as large as the work area with First, Last and a page box, or a List. Grid is the default for new accounts; the desktop and phone each remember their layout.
- The collection header has Options (sort, layout, card size, deck and trade filters, Select several cards) with a count of active filters, + Add, and one count line such as "1,122 cards (314 unique), $390.32".
- One click on a deck or collection in a panel opens it. Opening a collection, deck, card or view closes the About guide.
- Floating panels dock onto other panels, panel edges and window edges when dragged by their grip, and snap to each other's edges. Panel tabs wrap onto more rows instead of being cut off.
- The Trade ribbon tab always has the Trade button. The Workspace list uses the program's own menu.
- The card database update also stores the mana each card makes and the tokens it creates. Run an update after installing.
- Backups keep each deck's description, cover card and tags.
- Fixed: the right-click menu was hard to read in the dark theme.
- Fixed: on phones, icons in the Home buttons and the scanner's edit button were drawn far too large, and an empty bar showed at the top of Home.
- Fixed: a link in a deck description could run script; only web addresses become links.

## 0.6.0 (2026-11-19): Linked deck cards, import formats, ManaBox-style scanner and a new ribbon

- Deck cards are linked to the copies in your collections that fill them. A copy fills one deck at a time; a second deck that needs the card shows it as missing. Collection rows show their decks, deck cards show their collection, and Link copies changes the copy. Links follow copies that move, and removing a copy makes the deck card missing.
- Normal decks are gone: every deck keeps the printing of each card. Decks that kept cards by name keep the newest printing they showed. Decklists without a printing take the newest printing.
- Proxies: a proxy is its own row, marked PROXY everywhere, with no value, out of set completion and the trade list. It can fill a deck card. Add as proxy, the scanner's Mark as proxy, Copy details and imports set it.
- Copy details also hold the purchase price and currency, date added, and misprint, altered and signed marks.
- Completion rule None, the default for new collections; it hides the Completion and Missing tabs. Existing collections keep their rule.
- Wishlist wants go down as copies of the card are added to collections, the oldest want first; undo puts them back.
- Import and Export windows: one Import and one Export button. Imports read Mana Vault, Moxfield, ManaBox, Archidekt, Deckbox and TCGplayer CSV files and plain text lists, detect the format and let you change it, and can import into a new collection. Exports write the same formats, for the whole collection, the filtered rows, the picked rows, the missing cards or the deck.
- The scanner works like ManaBox: a settings sheet (Quick mode, Play sounds, Vibrate, Mark as proxy, Camera, a set filter with any number of sets, Ignore promos, Prefer foil if possible, Display total value, Display copies in collection), set chips on the camera, a "Not in set" warning, a printing picker when more than one printing fits, and a strip for the finish, condition and language of the next cards.
- Add to in the scanner offers New collection... and New deck...; cards added to a deck go into a collection for that deck, remembered per deck, and are linked.
- The ribbon is the only menu: the menu bar is replaced by a title bar with the account menu. Related commands share one button with a list, commands that do not apply are hidden, and an open deck adds its groups to the Decks tab. Button size: Large buttons, Compact buttons or Icons only.
- Right-click menus on cards and rows, and a long press on a phone.
- Card page with art, rules text, power and toughness, every version with market prices, rulings and where you own the card. Rulings are kept on the phone too.
- Phone layout: Home, Search, Collection, Decks and Scan tabs, a Home view with totals, recent scans and the Inbox, and the menu at the top right with one section per ribbon tab.
- Explanatory notes were removed from the interface.
- Android app: it goes offline only when the server cannot be reached, checks again every 10 seconds, and downloads only the collections and decks that changed. The sync button always shows Synced and the time, Waiting, Offline or Syncing, and syncs now when tapped. Collections and decks can be created offline.
- The card database update also downloads rulings, power and toughness, and the rules text of both faces of two-faced cards. Run an update after installing.
- Backups are version 4, with proxies, copy details, the collection remembered for each deck, and deck links. Older backups still restore.
- Fixed: preference changes made just before reloading the page were lost.

## 0.5.0 (2026-11-18): Android app

- Android app (Android 8.0 or newer), installed from the APK attached to each GitHub release. It has every feature of the phone layout.
- First run: enter the server address, then sign in or create an account. Plain http addresses are allowed only on a home network, with a warning.
- Phones sign in with their own device sign-in. Devices... lists the phones signed in to your account and removes them. Changing your password also signs out your other phones.
- Offline use: the phone keeps a copy of your collections, decks, Inbox, trade list, preferences and the card list. Browsing, card search by name, card details, editing copies and deck cards, renaming and scanning work without a connection.
- Sync: changes made offline wait on the phone and are sent when the connection returns, when the app opens, every minute, or with Sync now. Count changes are applied as differences, each change is applied once, and changes the server refuses are listed in Changes not applied.
- Scanning in the app uses the phone's own text recognition, and matches cards on the phone when offline with the same rules as the server.
- Notifications for new Inbox offers, checked in the background about every 15 minutes, optionally only on Wi-Fi. Tapping one opens the Inbox.
- The Back button closes windows and sheets, then returns to the Cards tab. Exports and backups open the Android share sheet.
- The app checks GitHub once a day for a newer release; Check for updates... checks at once.
- The server's health check reports its version.
- Fixed: a backup listed two collections created in the same second in a random order, so they could swap places after a restore.

## 0.4.0 (2026-11-18): Live card scanner

- Scanner rebuilt: it scans continuously, with no capture button. Each card held in the outline is recognized and added to a scanned list, with a short vibration on phones; a card that stays in view is counted once.
- Exact printings from the set code and collector number on cards printed since 2019; otherwise the card name with tolerance for reading mistakes and the newest printing.
- Reads only the card's name and information lines, enlarged and with the contrast raised, instead of the whole camera picture. Light text on dark title bars is read, and cards held larger, smaller or off center are found.
- Continuous autofocus, tap to focus and a torch button.
- Last card strip with Normal or Foil, another printing and +1.
- Scanned list with edit (quantity, finish, printing), remove, Clear and Add a card by name. It is kept on the device until it is added or cleared.
- Add to... puts the whole scanned list into any collection or deck as one undo step.
- Scanner settings: vibrate when a card is added, new scans are foil, and back or front camera.
- Phone: a Scan tab in the bottom tab bar. Desktop: a large scanner window with the camera and the scanned list side by side.
- Text recognition files are served by Mana Vault, so scanning works without an internet connection.
- Choosing a photo is no longer offered; Add a card by name replaces it for cards the camera cannot read.
- Fixed: the scanner read the whole camera picture and took its first line of text, so it rarely found the card name, and an exact name match was needed to find a card.

## 0.3.0 (2026-11-18): Prices, statistics, deck ownership, wishlists and trading

- Prices: every card database update stores each printing's US dollar (regular, foil, etched) and euro (regular, foil) prices. Prices show in search results, the Card panel, collection rows, the binder, the trade view and the Collections panel, in US dollars or euros (PRICES in the status bar).
- Collection and deck values, sorting a collection by price, quantity or set, and the `usd` and `eur` search filters.
- Statistics tabs for collections and decks: stat tiles and charts for mana curve, color, type, rarity, finish and top sets. Clicking a collection chart bar lists those cards.
- Deck ownership: an Ownership tab and owned badges show which deck cards you own, where they are and what the missing cards cost. Missing cards export as text or go to the wishlist.
- Wishlists: any collection can be a wishlist. Its cards are wanted, not owned. Add a card (W), a set's missing cards or a deck's missing cards in one step.
- Trading: mark copies for trade, see them in the trade list, and compare both sides in the trade calculator (key 4), with a copyable summary.
- Copy details (E): each row now has a finish (regular, foil or etched), condition and language, and a number for trade. Collection imports and the Moxfield export carry condition, language, etched and tradelist counts.
- Filter tags: click a set code or rarity on a collection row to list only matching cards; click a set code or rarity in search to filter by it.
- Binder layout (B): a collection as pages of nine cards, turned with Page Up and Page Down.
- Search and imports match flavor names (such as Godzilla series names) and the front face of two-faced cards.
- Backups are version 3 and keep copy details and wishlists. Older backups still restore.
- After updating, run Update card database once to load prices and flavor names. Existing copies become regular, near mint, English, or foil when they were foil.

## 0.2.0 (2026-11-18): Collections, set completion and sending

- Collections: any number per account, each with a name, description, linked sets, completion rule and finish rule. Every new account starts with a Main collection.
- Target collection for Add to collection, shown as ADD TO in the status bar and cycled with C.
- Set completion per collection: Main set, Every printing or Each card name once (linked sets only), with Any finish, Regular only, Foil only or One of each.
- Completion tab with overall and per-set progress, and Missing tab with filters, + Collection and text or CSV export.
- Collections panel with completion bars, and owned counts per collection in the Card panel.
- Bulk editing: pick rows with Ctrl+click, Shift+click, Ctrl+A or Select mode, then remove or move them in one step that undoes as one.
- Move copies between collections.
- Collection CSV imports go into a chosen collection; exports cover the open collection.
- Collections and decks belong to their account. Data from earlier versions moves to the oldest account, with the collection named Main collection.
- Send collections and decks to other accounts as a copy, a share or a transfer; accept into a new item or merge into a collection; decline or cancel offers; Inbox with a waiting count.
- Rename and delete decks; leave or stop sharing shared items.
- Backups hold the signed-in account's own collections and decks; backups from earlier versions restore into a Main collection.
- Card database updates also download Scryfall's set list and each printing's finishes. Run Update card database once after updating so Main set and the finish rules have complete data.

## 0.1.0 (2026-11-18): New interface, sign-in and About guide

- New desktop interface: menu bar, ribbon with a contextual Deck tab, dockable Filters, Decks, Card, Deck list and Import review panels, saved workspaces and a status bar with confirmations.
- Light, dark and system themes, saved per account.
- New phone layout with bottom tabs and full-screen sheets.
- Sign-in with accounts, password changes and protection against password guessing. New accounts can be turned off with MANAVAULT_SIGNUP.
- Preferences saved per account on the server.
- Undo and redo for collection and deck edits.
- Keyboard shortcuts for search, adding cards, zones, decks and undo.
- Card panel with full card details and owned counts.
- Import previews in a window, with every skipped row in the Import review panel.
- Customize ribbon, to add, remove and reorder tabs, groups and buttons.
- Built-in About guide.
- Fixed: backups that contain colorless cards, such as artifacts and lands, could not be restored.
- Docker deployment for Dockhand: published image, docker-compose.yml with an absolute data folder, .env.example and a built-in health check. Before updating an existing install: the container now runs as user 65532, so run `sudo chown -R 65532:65532` on the data folder, and the setting CARD_UPDATE_INTERVAL_HOURS is now MANAVAULT_CARD_UPDATE_INTERVAL_HOURS (the old name still works). Installs that used the old mana-vault-data Docker volume move the database into /opt/mana-vault/data; the README gives the copy command.
