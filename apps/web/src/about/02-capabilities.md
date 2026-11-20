# Capabilities

This page lists what Mana Vault does in the current version, followed by what is planned.

## Available now

### Card search

- Search every printing in the local card database by name, type line and rules text.
- Narrow results with filter syntax in the search box (type, color, color identity, rules text, set, rarity, mana value, legality) and with the Filters panel.
- The Filters panel filters the open view: card search, the open collection or the open deck (its cards, or the cards to add). Each view keeps its own filters.
- Show every result, sorted by name and then newest printing first, loading more while scrolling or turning binder pages, with the total in the count line.
- Show results as a Grid or Binder of card pictures with prices and how many you own, or as a List. Each device type remembers its own choice. The deck's Add tab and the trade searches use the same views.
- Click a result to select it, double-click to add it, right-click or long press for its menu.
- Search by price with `usd` and `eur`, and find cards by their flavor names (such as a Godzilla series name).
- Click a result's set code or rarity to filter by it.
- Show each result's price.
- Show a card's image, mana cost, rules text, printing details, prices and how many copies you own, and want, in the Card panel.

### Collections

- Keep any number of collections per account, each with a name and description. Every account starts with a Main collection.
- Add any printing as a regular, foil or etched copy with Enter, a double-click or the add buttons, which name where the card goes (+ collection name, + deck name) and offer each finish the printing is made in.
- See where cards go: Target and Adding here marks in the Collections and Decks panels, and ADDING TO in the status bar, which switches between the open deck and the target collection. Cycle the collections with C.
- Change the printing or finish of all or some copies (such as one of two copies to the foil version), keeping their count, condition, language, trade marks and details, and choose whether the decks they fill change too or keep their version.
- Right-click or long press a collection (panel or switcher) to open, rename, change settings, send, export, delete or leave it.
- Record each copy's finish (regular, foil or etched), condition (Mint to Damaged) and language with Copy details.
- Show each entry's value, and each collection's total value, in US dollars or euros.
- Sort entries by name, price, quantity, or set and number.
- Narrow the list with filter tags by clicking a set code or rarity on an entry, or a bar in Statistics.
- Show a collection as a grid of card pictures that loads more while scrolling (Small, Medium or Large), as binder pages of nine cards with a page box, or as a list. Each device type remembers its own layout.
- Open collections from a switcher with search, five sort orders and the keyboard.
- All collections, the first entry of the switcher, lists every entry of every collection with its collection, wishlists included when chosen in Options. Edits act on each entry's own collection.
- Filters, tags and the filter box stay when another collection opens.
- Show statistics: mana curve, colors, types, rarity, finish, top sets by value, average and median prices.
- Change counts with plus and minus buttons, remove a chosen number of copies, Reduce to 1, or remove entries.
- Pick many cards with Ctrl+click, Shift+click, Ctrl+A or Select mode, then remove, reduce to one copy or move them in one step.
- Move copies between collections.
- Filter a collection by card or set name.
- Track completion, or choose None for bulk collections (the default for new collections).
- Keep proxies apart from real copies: marked everywhere, with no value, out of set completion.
- Record purchase price and currency, date added, and misprint, altered and signed marks with each entry.
- Show on each entry the decks its copies fill, and filter entries by In a deck or Not in a deck.
- Import from Mana Vault, Moxfield, ManaBox, Archidekt, Deckbox and TCGplayer CSV files and plain text lists, with the format detected from the file and changeable, into an existing or a new collection, with a preview before anything is added.
- Export the whole collection, the filtered cards, the picked cards or the missing cards in any of those formats.

### Wishlists and trading

- Mark any collection as a wishlist. Its cards are wanted, not owned.
- Add a card, every missing card of a set, or every missing card of a deck to the wishlist in one step.
- Lower wishlist wants as copies of the card are added to collections, oldest want first.
- Mark copies for trade.
- Save trades with a name and a status (Open, Done or Cancelled); start, rename, cancel and delete them.
- Build a trade in two columns, each with its own search: You give searches your cards for trade (or every card), You get searches the card database. Each line has its own count, finish, condition and a price that can be changed by hand.
- See the balance of both sides in a bar with the difference.
- Complete a trade in one step that can be undone: given cards leave their collections, cards you get are added and wishlist wants go down, with a warning for cards used in decks.
- Send a trade to another account; changes go back as counter-offers until one side accepts, which completes it for both.
- See wishlist matches both ways: cards others have for trade that you want, and your trade cards others want.
- Copy or export the trade list, and share a public link to your trade binder that can be replaced or turned off.

### Set completion

- Link a collection to any number of sets.
- Count completion by main set, every printing, or each card name once, and by any finish, regular only, foil only, or one of each.
- Show completion overall and per set, and list the missing cards with filters by set, rarity and color.
- Add a missing card from the list, add every missing card to the wishlist, and export the missing list as text or CSV.

### Decks

- Create decks with a name and one of 21 formats; every deck keeps the printing of each card.
- Open decks from a switcher with search, six sort orders, cover card, commander, format and card count.
- Change the printing or finish of all or some of a deck card's cards: free copies of the new printing in that finish are linked, from the collection you choose when several have them.
- Keep a finish for every deck card (regular, foil or etched), shown as FOIL or ETCHED in every deck view, the Deck list panel and the Card panel, used for its price, set by `*F*` and `*E*` marks, Add as foil, Add as, linked copies and Change printing. A regular and a foil card of the same printing are separate deck cards.
- Link lines of Edit as text and decklist imports that name a set and number to free copies of exactly that printing and finish; lines without them stay missing until linked. Link owned copies fills every missing card from exact copies.
- Show on a missing deck card when you own it (Owned, link) or another version of it (Other version owned, with Switch).
- Mark a deck card Upgrade wanted with the version you want; it stays owned and is listed in the Ownership tab.
- Right-click or long press a deck (panel or switcher) to open, rename, change the format, send, export, delete or leave it, and a card in the Deck list panel for the deck card menu.
- The Decks panel groups decks by format with each deck's card count and value.
- Add cards by typing them (Quick add, such as 2 Sol Ring), from the Add tab's card search with + Main, + Side, + Maybe and + Commander (each showing how many are already in the deck), from card search or from the scanner.
- Filter the deck's cards with a filter box and the Filters panel.
- Edit the whole deck as text, checked before it is applied, as one step that can be undone.
- Show the cards as a list, text, stacks of pictures or a grid, grouped by type, mana value, color, rarity or your own tags, and sorted by name, mana value or price.
- Check a deck against its format: deck and sideboard size, copies of each card, banned and not legal cards, and the commander's color identity.
- Keep a maybeboard of cards being considered, list the tokens the deck makes, and point at a card name for a large picture.
- Playtest: shuffle, draw opening hands, mulligan, draw and play cards.
- Write a description with headings, lists and links, choose a cover card, and see the history of every change.
- Link each deck card to the copy in a collection that fills it: one deck per copy, chosen when a card is free in more than one collection, changeable later, following the copy when it moves or changes printing (or keeping its version when you choose), and missing when it is removed.
- Rename and delete decks.
- Add cards to the commander zone, main deck, sideboard or maybeboard, change counts, move cards between zones, remove a chosen number of copies or Reduce to 1, and remove cards.
- Import decklists as text (Moxfield, Arena and MTGO style, with `*F*` foil and `*E*` etched marks) or CSV, with a preview. A line whose name does not match is found by its set and collector number.
- Export decks as text or CSV.
- Check which deck cards have a linked copy, where they are, and what the missing cards cost.
- Export the missing cards of a deck as text, or add them to the wishlist.
- Show deck statistics, colored mana symbols beside the cards that make each color, and the deck's value.

### Proxies and custom cards

- Keep a print list on the server: add a deck, its missing cards, a collection, picked cards, a pasted list, the tokens of the listed cards, or any card from a search.
- Choose each line's printing, count and faces (front, back or both for two-faced cards).
- Set the paper (Letter, A4, Legal or custom), margins, card size, scale, gap, bleed, cutting guides and background, with a live page preview.
- Export a PDF at 300 DPI, pictures for MakePlayingCards with bleed, and a card list for MPC Autofill with custom cards as pictures.
- After exporting, add the printed cards as proxies to a collection or deck.
- Make custom cards in the card maker: every card field, mana symbol buttons, Mana Vault's own frames in every color, hybrid, gold, artifact, colorless and land with legendary versions, creature, planeswalker, saga, token and double-faced cards, uploaded art or a card's art with move and zoom, and PNG export.
- Save custom cards to the card database for every account, in custom sets with their own codes, names, release dates and symbols, with colors, color identity, finishes, prices, legality and tokens, found with `is:custom`.

### Sending and sharing

- Send a collection or deck to another account as a copy, a share (both edit it) or a transfer.
- Accept offers into your library as a new item or, for collections, merged into one of yours; decline or cancel offers.
- See who an item is shared with, stop sharing, or leave an item shared with you.

### Editing

- Undo and redo collection and deck edits, including bulk removes and moves, up to 150 steps per session.

### Card database

- Update the local card database from Scryfall on demand, and on a schedule when the server is set up for it, with prices, flavor names, power and toughness, and rulings.
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

### Accounts

- Sign in with a user name and password. New accounts can be turned off by the server owner.
- Change your password, which signs out your other devices and phones.
- See the phones signed in to your account in Devices..., and remove any of them.
- Keep theme, ribbon, panel layout, workspace, where new cards go, open collection and proxy sheet choices per account.

### Interface

- Desktop layout with a title bar, the ribbon as the only menu (lists for related commands, context groups, hidden commands that do not apply, three button sizes), dockable panels whose floating windows dock onto other panels and snap to each other, saved workspaces, status bar and light, dark or system theme.
- Right-click menus on cards, rows, collections and decks; a long press opens them on a phone.
- Card page with art, rules text, power and toughness, every version with market prices, rulings, and where you own the card.
- Home view with totals, recent scans and the Inbox.
- Phone layout with Home, Search, Collection, Decks, Trade, Proxies and Scan tabs, a nested menu at the top right, full-screen sheets and an installable home screen app.
- The app's own choice lists everywhere, with a search box for long lists and a sheet on phones.
- A built-in About guide (this guide).

### Android app

- An Android app (Android 8.0 or newer) with every feature of the phone layout, installed from the APK on the GitHub releases page.
- Sign in a phone with a server address, then a user name and password; the phone keeps its own device sign-in.
- Use collections, decks, card search, card pages with rulings and the scanner without a connection, and create collections and decks offline, with changes sent when the connection returns.
- Go offline only when the server cannot be reached, with a sync button that always shows the state and syncs now.
- Offline count changes are applied as differences, so edits made elsewhere at the same time are kept; changes the server refuses are listed.
- Scan with the phone's own text recognition, matched against the card list on the phone when offline.
- Notifications for new offers in the Inbox, checked in the background about every 15 minutes, optionally only on Wi-Fi.
- The Back button, the Android share sheet for exports and backups, and a daily check for a newer app.

## Planned

These are part of the release plan and are not available yet.

| Version | Planned features |
|---|---|
| Later | Price history; a built-in demo collection; instant notifications; more than one server or account in the Android app; sharing files into the Android app |
