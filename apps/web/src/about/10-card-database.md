# Card database

The card database is Mana Vault's local copy of every Magic printing. Search, the collection, decks, imports and the scanner all match against it.

## Where the data comes from

Updates download Scryfall's Default Cards bulk file (one entry per printing in English or the printed language) over HTTPS. Each update adds new printings and refreshes the details of existing ones; no printing is removed. Card images are shown from Scryfall's image servers and are not stored.

## Updating

- **Update card database** (Database ribbon tab or Cards menu) starts an update. The button is unavailable while an update runs.
- The status bar shows "Updating card database" during the update. When it ends, a message gives the number of printings imported, or the reason it failed.
- The server owner can schedule automatic updates every set number of hours (see [Technical](/about/technical)). Pointing at the card database item in the status bar shows the schedule.
- An update never changes your collection or decks.

## Status bar

| Shown | Meaning |
|---|---|
| N printings, updated date | Size of the catalog and the date of the last successful update |
| Card database loading | The status has not been read yet |
| Updating card database | An update is running |
| Last update failed | The last update failed; click it to see the reason |

## Messages

| Message | Cause | What to do |
|---|---|---|
| A card catalog update is already running | An update was started while another ran | Wait for it to finish |
| Card catalog updates are unavailable | The server cannot run updates | Check the server's configuration and logs |
| Card database update failed: reason | Download or import failed | Check the server's internet connection and try again |
