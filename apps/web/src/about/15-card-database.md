# Card database

The card database is Mana Vault's local copy of every Magic printing. Search, the collection, decks, imports and the scanner all match against it.

## Where the data comes from

Updates download Scryfall's Default Cards bulk file and Scryfall's set list (set names and printed sizes, used by [Set completion](/about/set-completion)) (one entry per printing in English or the printed language) over HTTPS. Each update adds new printings and refreshes the details of existing ones, including prices (US dollars regular, foil and etched; euros regular and foil), flavor names, rules text (both faces of two-faced cards) and power and toughness; no printing is removed. Each update also downloads Scryfall's rulings file and replaces the stored rulings, shown on the card page; when that download fails, the previous rulings are kept. Power, toughness and rulings appear after the first card database update with version 0.6.0. Prices are those of the day of the update; see [Prices and statistics](/about/prices-and-statistics). Card images are shown from Scryfall's image servers and are not stored. Two-faced cards with a picture for each face also keep the address of the back face's picture, for printing proxies; it arrives with the first card database update with version 0.9.0. Full-size pictures for printing and mana symbols for the card maker are downloaded by the server when needed; mana symbols are kept in the database.

## Updating

- **Update card database** (View ribbon tab, group Card database) starts an update. The button is unavailable while an update runs.
- The status bar shows "Updating card database" during the update. When it ends, a message gives the number of printings imported, or the reason it failed.
- The server owner can schedule automatic updates every set number of hours (see [Technical](/about/technical)). Pointing at the card database item in the status bar shows the schedule.
- An update never changes your collection or decks.
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
| Card database update failed: reason | Download or import failed | Check the server's internet connection and try again |
