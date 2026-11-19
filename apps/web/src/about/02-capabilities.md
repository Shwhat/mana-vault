# Capabilities

This page lists what Mana Vault does in the current version, followed by what is planned.

## Available now

### Card search

- Search every printing in the local card database by name, type line and rules text.
- Narrow results with filter syntax in the search box (type, color, color identity, rules text, set, rarity, mana value, legality) and with the Filters panel.
- Show up to 40 results per search, sorted by name and then newest printing first.
- Search by price with `usd` and `eur`, and find cards by their flavor names (such as a Godzilla series name).
- Click a result's set code or rarity to filter by it.
- Show each result's price.
- Show a card's image, mana cost, rules text, printing details, prices and how many copies you own, and want, in the Card panel.

### Collections

- Keep any number of collections per account, each with a name and description. Every account starts with a Main collection.
- Add any printing as a regular or foil copy to the target collection with one click, Enter or a double-click, and switch the target with C.
- Record each copy's finish (regular, foil or etched), condition (Mint to Damaged) and language with Copy details.
- Show each row's value, and each collection's total value, in US dollars or euros.
- Sort rows by name, price, quantity, or set and number.
- Narrow the list with filter tags by clicking a set code or rarity on a row, or a bar in Statistics.
- Show a collection as binder pages of nine cards.
- Show statistics: mana curve, colors, types, rarity, finish, top sets by value, average and median prices.
- Change counts with plus and minus buttons, and remove entries.
- Pick many rows with Ctrl+click, Shift+click, Ctrl+A or Select mode, then remove or move them in one step.
- Move copies between collections.
- Filter a collection by card or set name.
- Track completion, or choose None for bulk collections (the default for new collections).
- Keep proxies apart from real copies: marked everywhere, with no value, out of set completion.
- Record purchase price and currency, date added, and misprint, altered and signed marks with each row.
- Show on each row the decks its copies fill, and filter rows by In a deck or Not in a deck.
- Import from Mana Vault, Moxfield, ManaBox, Archidekt, Deckbox and TCGplayer CSV files and plain text lists, with the format detected from the file and changeable, into an existing or a new collection, with a preview before anything is added.
- Export the whole collection, the filtered rows, the picked rows or the missing cards in any of those formats.

### Wishlists and trading

- Mark any collection as a wishlist. Its cards are wanted, not owned.
- Add a card, every missing card of a set, or every missing card of a deck to the wishlist in one step.
- Lower wishlist wants as copies of the card are added to collections, oldest want first.
- Mark copies for trade, and list every copy for trade in the trade list.
- Compare what you give with what you get in the trade calculator, and copy a summary.

### Set completion

- Link a collection to any number of sets.
- Count completion by main set, every printing, or each card name once, and by any finish, regular only, foil only, or one of each.
- Show completion overall and per set, and list the missing cards with filters by set, rarity and color.
- Add a missing card from the list, add every missing card to the wishlist, and export the missing list as text or CSV.

### Decks

- Create decks with a name and a format; every deck keeps the printing of each card.
- Link each deck card to the copy in a collection that fills it: one deck per copy, chosen when a card is free in more than one collection, changeable later, following the copy when it moves, and missing when it is removed.
- Rename and delete decks.
- Add cards to the main deck, sideboard or commander zone, change counts, move cards between zones and remove cards.
- Import decklists as text (Moxfield, Arena and MTGO style) or CSV, with a preview.
- Export decks as text or CSV.
- Check which deck cards have a linked copy, where they are, and what the missing cards cost.
- Export the missing cards of a deck as text, or add them to the wishlist.
- Show deck statistics and the deck's value.

### Sending and sharing

- Send a collection or deck to another account as a copy, a share (both edit it) or a transfer.
- Accept offers into your library as a new item or, for collections, merged into one of yours; decline or cancel offers.
- See who an item is shared with, stop sharing, or leave an item shared with you.

### Editing

- Undo and redo collection and deck edits, including bulk removes and moves, up to 150 steps per session.

### Card database

- Update the local card database from Scryfall on demand, and on a schedule when the server is set up for it, with prices, flavor names, power and toughness, and rulings.
- Show the number of printings and the date of the last update in the status bar.

### Scanning

- Scan cards continuously with the phone or computer camera: each card held in the outline is recognized and added to a scanned list, with a short vibration on phones.
- Recognize the exact printing from the set code and collector number on cards printed since 2019; otherwise match the card name, allowing for reading mistakes, and ask which printing when more than one fits (or take the newest in Quick mode).
- Limit scans to any number of sets, with a "Not in set" warning for other cards, and ignore promos.
- Set the finish, condition and language of the next cards on the strip, mark scans as proxies, and show the scanned list's total value and copies already owned.
- Read light text on dark title bars, and cards held larger, smaller or off center.
- Continuous autofocus, tap to focus and the torch where the camera supports them.
- Last card strip with the card's page, edit and +1.
- Edit, remove or clear scanned rows, and add cards by name.
- Add the whole scanned list to any collection or deck, or a new one, as one undo step; cards added to a deck go into a collection for it, remembered per deck, and are linked.
- The scanned list is kept on the device until it is added or cleared.
- Text recognition runs on the device with files served by Mana Vault, so no internet connection is needed.

### Backups

- Download a backup of your own collections, decks and the card records they use.
- Check a backup before restoring it, then replace your own collections and decks with it.

### Accounts

- Sign in with a user name and password. New accounts can be turned off by the server owner.
- Change your password, which signs out your other devices and phones.
- See the phones signed in to your account in Devices..., and remove any of them.
- Keep theme, ribbon, panel layout, workspace, target collection and open collection choices per account.

### Interface

- Desktop layout with a title bar, the ribbon as the only menu (lists for related commands, context groups, hidden commands that do not apply, three button sizes), dockable panels, saved workspaces, status bar and light, dark or system theme.
- Right-click menus on cards and rows; a long press opens them on a phone.
- Card page with art, rules text, power and toughness, every version with market prices, rulings, and where you own the card.
- Home view with totals, recent scans and the Inbox.
- Phone layout with Home, Search, Collection, Decks and Scan tabs, a nested menu at the top right, full-screen sheets and an installable home screen app.
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
