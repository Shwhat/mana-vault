# Card database

The card database is Mana Vault's local copy of every Magic printing. Search, the collection, decks, imports and the scanner all match against it.

## Where the data comes from

Updates download Scryfall's Default Cards bulk file and Scryfall's set list (set names and printed sizes, used by [Set completion](/about/set-completion)) (one entry per printing in English or the printed language) over HTTPS. Each update adds new printings and refreshes the details of existing ones, including prices (US dollars regular, foil and etched; euros regular and foil), flavor names, rules text (both faces of two-faced cards) and power and toughness; no printing is removed. Each update also downloads Scryfall's rulings file and replaces the stored rulings, shown on the card page; when that download fails, the previous rulings are kept. Power, toughness and rulings appear after the first card database update with version 0.6.0. Prices are those of the day of the update; see [Prices and statistics](/about/prices-and-statistics). Card pictures are shown through the server, which sends the pictures it keeps or Scryfall's; an admin chooses which picture sizes the server downloads (see [Administration](/about/administration)). Two-faced cards with a picture for each face also keep the address of the back face's picture, for printing proxies; it arrives with the first card database update with version 0.9.0. Full-size pictures for printing and mana symbols for the card maker are downloaded by the server when needed; mana symbols are kept in the database.

Each update also keeps, for use without the internet:

| Part | From | Used for |
|---|---|---|
| The full record of every printing | Default Cards | Kept as Scryfall sends it, compressed, so every field is on the server |
| Treatments | Default Cards | Language, special foils and other promo types (Surge foil, Galaxy foil...), frame, frame effects, border, full art, keywords and printed name, used by card marks and filters |
| Printings in unofficial languages | Scryfall's All Cards file (several hundred MB) | Printings such as Phyrexian, when **Also keep printings in Scryfall's unofficial languages** is on in Administration (on by default). Official translations are not added. Search prefers the English printing |
| Art Tags | Scryfall's Art Tags file | What a card's art shows (cat, dog, bird...), for the Art shows filter and `art:` |
| Oracle Tags | Scryfall's Oracle Tags file | What a card does (ramp, removal...), for the Role filter and `role:` |
| Price history | The day's prices | One entry per printing for each day its price changed; see [Prices and statistics](/about/prices-and-statistics) |

When one of these parts fails to download, what was stored before is kept and the rest of the update goes on. Tags, special foils, unofficial languages and price history appear after the first card database update with version 0.12.0.

## Updating

- **Update card database** (View ribbon tab, group Card database, for admins) starts an update. The button is unavailable while an update runs, and for accounts that are not admins.
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

## Messages

| Message | Cause | What to do |
|---|---|---|
| A card catalog update is already running | An update was started while another ran | Wait for it to finish |
| Card catalog updates are unavailable | The server cannot run updates | Check the server's configuration and logs |
| Only an admin can do this. | An account that is not an admin started an update | Ask an admin |
| Card database update failed: reason | Download or import failed | Check the server's internet connection and try again |
