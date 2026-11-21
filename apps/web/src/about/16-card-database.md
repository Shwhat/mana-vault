# Card database

The card database is Mana Vault's local copy of every Magic printing. Search, the collection, decks, imports and the scanner all match against it.

## Where the data comes from

Updates download Scryfall's Default Cards bulk file and Scryfall's set list (set names and printed sizes, used by [Set completion](/about/set-completion)) (one entry per printing in English or the printed language) over HTTPS. Each update adds new printings and refreshes the details of existing ones, including prices (US dollars regular, foil and etched), flavor names, rules text (both faces of two-faced cards) and power and toughness; no printing is removed. Each update also downloads Scryfall's rulings file and replaces the stored rulings, shown on the card page; when that download fails, the previous rulings are kept. Power, toughness and rulings appear after the first card database update with version 0.6.0. Prices are those of the day of the update; see [Prices and statistics](/about/prices-and-statistics). Card pictures are shown through the server, which sends the pictures it keeps or Scryfall's; an admin chooses which picture sizes the server downloads (see [Administration](/about/administration)). Two-faced cards with a picture for each face also keep the address of the back face's picture, for printing proxies; it arrives with the first card database update with version 0.9.0. Full-size pictures for printing and mana symbols for the card maker are downloaded by the server when needed; mana symbols are kept in the database.

Each update also keeps, for use without the internet:

| Part | From | Used for |
|---|---|---|
| The full record of every printing | Default Cards | Kept as Scryfall sends it, compressed, so every field is on the server |
| Treatments | Default Cards | Language, special foils and other promo types (Surge foil, Galaxy foil...), frame, frame effects, border, full art, keywords and printed name, used by card marks and filters |
| Printings in other languages | Scryfall's All Cards file (several hundred MB) | The languages chosen in **Card languages** in Administration: by default the unofficial languages (Phyrexian, Quenya and others); also any of Spanish, French, German, Italian, Portuguese, Japanese, Korean, Russian, Simplified and Traditional Chinese. See [Card languages](#card-languages) |
| Art Tags | Scryfall's Art Tags file | What a card's art shows (cat, dog, bird...), for the Art shows filter and `art:` |
| Oracle Tags | Scryfall's Oracle Tags file | What a card does (ramp, removal...), for the Role filter and `role:` |
| Price history | The day's prices | One entry per printing for each day its price changed; see [Prices and statistics](/about/prices-and-statistics) |
| Set symbols | Scryfall's set list and its SVG symbol files | The symbol of every set, with its parent set, block, and whether it is digital only, foil only or regular only. Shown in card search filters, set pickers, set completion, the card page and the printing chooser, and offered for custom sets. A symbol is downloaded again only when Scryfall changes it |
| Symbols | Scryfall's symbol list | Every mana and card symbol with its name, mana value and colors, and its picture. Used by the card maker's Symbols window, the colors and mana value of custom cards, and the symbols drawn in rules text on the card page |
| Printing changes | Scryfall's list of printing changes | Printings Scryfall merged into another or removed; see [Printing changes](#printing-changes) |
| Name and keyword lists | Scryfall's catalogs | Card names, artist names, creature, planeswalker, land, artifact, enchantment and spell types, keyword abilities, keyword actions, ability words and watermarks, for suggestions while typing |
| Card back | Scryfall's card back picture | The standard Magic card back, downloaded once in full size, for printing proxies |

When one of these parts fails to download, what was stored before is kept and the rest of the update goes on. Tags, special foils, unofficial languages and price history appear after the first card database update with version 0.12.0; set symbols, symbols, printing changes, name and keyword lists, the card back and the other card languages after the first update with version 0.15.0.

## Card languages

**Card languages** in Administration, Card database chooses which printed languages the card database keeps besides English:

| Choice | Keeps |
|---|---|
| English and unofficial languages (the default) | English printings, and the unofficial languages such as Phyrexian and Quenya |
| All languages | Every language Scryfall has: Spanish, French, German, Italian, Portuguese, Japanese, Korean, Russian, Simplified and Traditional Chinese, and the unofficial ones |
| Chosen languages | A checkbox for each language, and one for the unofficial languages |

- Before the choice is saved, it shows about how many printings are kept besides English, the download (Scryfall's All Cards file, downloaded with each update while any language other than English is kept) and about how much the database grows.
- The next card database update adds the printings of the languages chosen. Taking a language out removes its printings at the next update, except printings that copies, deck cards, trade lines or print lists use, which stay.
- **Pictures of other languages** (off by default) also downloads the pictures of those printings in the picture sizes chosen in Administration, Pictures; the estimate shows the space first. When it is off, their pictures load from Scryfall through the server.
- Card search keeps English first: a search that shows one result per card picks the English printing, and `lang:` (such as `lang:ja`) finds other languages. The printing chooser lists every language of a card with a language pip, such as JA.
- A copy's Language (in Copy details) is the language of the card you hold. **Change printing...** offers the printings in other languages; copies stay as they are until changed.
- The scanner reads English text only.

## Printing changes

Scryfall sometimes merges a printing into another (two entries for the same card) or removes one. Each update reads the changes made since the last one, oldest first:

| Change | What happens |
|---|---|
| Merge | Everything that holds the old printing moves to the new one: copies in collections and wishlists (joining a copy of the same finish, condition, language and proxy mark), deck cards and their linked copies, upgrade choices, trade lines, print list lines and the price history. The old printing is no longer found by search |
| Removal | The printing stays for the copies and deck cards that hold it, shows a **Printing removed** pip, and is no longer found by search. A click on the pip opens **Change printing...** |

The message at the end of the update and the status bar give "N printings merged, N removed", counting only changes to printings that were held. Each change is written to Administration, Activity.

## Updating

- **Update card database** (File menu, for admins) starts an update. The button is unavailable while an update runs, and for accounts that are not admins.
- The status bar shows "Updating card database" during the update. When it ends, a message gives the number of printings imported, or the reason it failed.
- An admin sets the hours between automatic updates in Administration, Card database (168 hours by default). Pointing at the card database item in the status bar shows the schedule.
- An update never changes your collection or decks.
- After an update the server downloads any new or changed card pictures in the sizes chosen in Administration.
- A card whose record from Scryfall fails a check is skipped, and the rest of the update goes on. The status bar then shows "N skipped"; click it to see the names (up to 50). The next update tries them again.
- Custom cards made in the card maker are part of the card database and are never changed or removed by an update (see [Proxies and the card maker](/about/proxies)).

## Status bar

| Shown | Meaning |
|---|---|
| N printings, updated date | Size of the catalog and the date of the last successful update |
| Card database loading | The status has not been read yet |
| Updating card database | An update is running |
| Last update failed | The last update failed; click it to see the reason |
| N skipped | Cards left out of the last update because their record failed a check; click it to see their names |
| N printings merged, N removed | Printing changes from Scryfall applied by the last update to printings that were held; click it to open Administration, Activity |

## Messages

| Message | Cause | What to do |
|---|---|---|
| A card catalog update is already running | An update was started while another ran | Wait for it to finish |
| Card catalog updates are unavailable | The server cannot run updates | Check the server's configuration and logs |
| Only an admin can do this. | An account that is not an admin started an update | Ask an admin |
| Card database update failed: reason | Download or import failed | Check the server's internet connection and try again |
