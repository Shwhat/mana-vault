# Release notes

The installed version is shown at the top of this guide.

## 0.9.0 (2026-11-19): Proxies, the card maker, change printing and menus for collections and decks

- Proxies: a new Proxies view (key 5, the Proxies ribbon tab and a Proxies tab on phones) with a print list kept on the server. Add a deck, its missing cards, a collection, picked rows, a pasted list, the tokens of the listed cards or any card from a search; choose each line's printing, count and faces.
- Sheet settings for the paper (Letter, A4, Legal or a custom size), margins, card size, scale, gap, bleed, cutting guides and background, with a live preview of every page.
- Exports: a PDF at 300 DPI, MakePlayingCards pictures with bleed in a zip, and a card list for MPC Autofill with custom cards as pictures. Mana Vault makes every export itself. After exporting, the printed cards can be added as proxies to a collection or deck.
- The card maker makes custom cards with a live preview: every card field, mana symbol buttons, Mana Vault's own frames in every color, the ten hybrids, gold, artifact, colorless and land, legendary versions, creature, planeswalker, saga, token and double-faced cards, uploaded art or a card's art with move and zoom, and PNG export.
- Custom cards are saved to the card database for every account, in custom sets with their own codes (such as XXX), names, release dates and symbols, with colors, color identity, finishes, prices, legality and tokens. They work like every other card, show a Custom badge and are found with `is:custom`. Only their maker can change or delete them, and backups include them.
- Change printing... in the right-click menu of deck cards and collection rows. A deck card links free copies of the new printing, from the collection you choose when several have them; collection copies keep their count, details and deck links.
- New cards go to the collection or deck selected last in the Collections panel, the Decks panel or a switcher, and only that one is highlighted. With a deck selected, Add to collection, double-click and the scanner add to the deck. The Add here buttons are gone; the status bar shows ADD TO: DECK name for a deck.
- The Decks panel groups decks by format, with each deck's card count and value under its name.
- Right-click menus (long press on phones) on collections and decks in the panels and switchers: Open, Rename..., settings or format, Send..., Export..., Delete or Leave. Rows of the Deck list panel have the deck card menu, and card menus have Add to print list.
- Deck import, Edit as text and Quick add read `*F*` (foil) and `*E*` (etched) after a card's set and number, and find a card by its set and number when the name does not match.
- A card whose record from Scryfall fails a check is skipped instead of stopping the whole card database update; the status bar shows how many were skipped, with their names. Two-faced cards keep their back face picture for printing after the next update.
- Backups are version 5 and can be up to 250 MB.
- Fixed: deck lines ending in `*F*`, such as `1 Island (HOB) 195 *F*`, were not found in the card database.

## 0.8.0 (2026-11-19): Saved trades, search views, filters per view and All collections

- Card search shows results as a Grid (the default), Binder pages or a List, chosen with **Options** with the card size; the desktop and phones each remember their choice. Pictures show the price and how many copies you own; click selects, double-click adds, right-click or long press opens the menu.
- Card search shows every result instead of the first 40: more load while scrolling or turning binder pages, and the count line shows the total.
- The Filters panel filters the open view: card search, the open collection, the deck's cards or the deck's Add tab results, and the trade searches, without switching to card search. A Filtering line names the view. Each view keeps its own filters; collection filters, tags and the filter box stay when another collection opens, and deck filters stay when another deck opens. Clear filters clears the open view only. Legal in works in collections and decks.
- All collections is the first entry of the collection switcher: every row of every collection, with its collection, wishlists only with Include wishlists in Options. Every action acts on each row's own collection.
- The deck header is laid out like the collection header: the switcher, the tabs Cards, Add, Ownership, Statistics, Playtest, Description and History (scrolling sideways on phones), a filter box, Options (view, group, sort, Edit as text, with a count of active filters) and the count line with the format badge. The Cards tab shows only the cards.
- The deck's new Add tab holds Quick add with its zone, Edit as text, and a card search with pictures and the buttons + Main, + Side, + Maybe and + Commander, each showing how many are already in the deck.
- Trading: saved trades with a name and a status (Open, Done or Cancelled), with New, Rename, Cancel and Delete. Two columns, You give (your cards for trade, or every card) and You get (the card database), each with its own search. Each line has its own count, finish, condition and a price that can be changed by hand (marked EDITED), and a balance bar compares the sides.
- Complete trade moves the cards in one step that can be undone, warns about cards used in decks and lowers wishlist wants for the cards you get.
- Trades can be sent to another account on the server; changes go back as counter-offers until one side accepts, which completes the trade for both. Waiting trades show in the Inbox and on the phone's top bar.
- Wishlist matches both ways, Copy list, Export (CSV), and a public link to your trade binder (only cards marked for trade; it can be replaced or turned off). It is the only page that opens without signing in.
- The phone's bottom bar adds Trade, with slightly smaller labels. Collection, deck and trade views have a Filters button in the top bar.
- Every choice list is the app's own list, the same on every screen: the import and export windows, every dialog, the scanner's Add to, settings and strip, and the sort, group, zone and filter lists. Long lists have a Find box; on phones the list is a sheet.
- The Home ribbon tab no longer has the Add group (Add to collection, Target, Wishlist, Add as foil); those commands remain on result buttons, menus, the status bar and their keys. The Trade ribbon tab has New trade, Complete, Send, Copy list and Share binder in place of You give and You get.
- Fixed: the scanner's card outline ran under the buttons on the right side of the camera.
- Fixed: the scanner's light did not come on. The scanner now opens a back camera that has a light, and in the Android app falls back to the phone's own light control; a camera without a light says "This camera has no light".

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
