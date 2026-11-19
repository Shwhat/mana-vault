# Release notes

The installed version is shown at the top of this guide.

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
