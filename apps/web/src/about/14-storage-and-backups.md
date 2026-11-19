# Storage and backups

## Where data is kept

Everything Mana Vault stores is in one SQLite database file, mana-vault.sqlite, in the server's data folder (/data inside the container, /opt/mana-vault/data on the Docker host by default). It holds:

- the card database
- every account's collections, decks, shares and offers
- accounts (with passwords stored only as salted hashes), sessions and per-account preferences

The data folder can also hold default-cards.json, the last downloaded card catalog file, while an update runs.

## In-app backup

**Download backup** (File menu or Collection ribbon tab) downloads mana-vault-backup.json with the signed-in account's own collections and decks. It contains:

| Part | Contents |
|---|---|
| Collections | Every collection you own, with its name, description, completion rule, finish rule, linked sets and dates |
| Collection cards | Every entry: collection, printing, count and foil |
| Decks | Every deck you own, with its name, format, mode and dates |
| Deck cards | Every card in those decks, with zone, count and printing for Theme decks |
| Cards | The card records they use, so a backup can be restored on a server with an empty card database |

A backup does not contain collections or decks shared with you by others, accounts, preferences or the full card database.

## Restoring a backup

1. Choose **Restore backup...** and pick a Mana Vault backup file of 25 MB or less.
2. Mana Vault checks the file and asks whether to replace all of your own collections and decks, listing the backup's date and what it holds.
3. Choose **Restore backup** to go ahead, or **Cancel**.
4. Your own collections and decks are replaced by the backup's. Items you had shared stop being shared, and offers of them are cancelled. Collections and decks shared with you by others, and other accounts' data, are not changed. The card records in the backup are added to the card database; the rest of the card database is unchanged.

A restore cannot be undone, and it clears the undo history. Backups made before version 0.2.0 hold a single collection; they restore as a collection named Main collection. Download a backup first if the current data might be needed.

### Restore messages

| Message | Cause |
|---|---|
| Backup file is not valid JSON | The file is damaged or not a backup |
| Unsupported backup file format or version | The file is not a Mana Vault backup, or is from an unknown version |
| Backup file has an invalid creation date | The file was edited or damaged |
| Backup file is missing required data | A required part is missing |
| Backup contains too many records | The file is larger than Mana Vault accepts |
| Backup card N is invalid (or has invalid field) | A card record in the file is damaged |
| Backup collection entry N is invalid | A collection entry is damaged |
| Backup collection N is invalid | A collection record is damaged |
| Backup collection entry refers to a missing collection | An entry belongs to no collection in the file |
| Backup contains duplicate collections | The file repeats a collection |
| Backup deck N is invalid | A deck record is damaged |
| Backup deck card N is invalid | A deck card is damaged |
| Backup contains duplicate card records, or duplicate decks | The file repeats records |
| Backup collection refers to a missing card | A collection entry has no matching card record |
| Backup deck card refers to a missing or incompatible card | A deck card has no matching card record |
| The backup file must be 25 MB or smaller | The file is too large |

## Server backups

The in-app backup covers one account's collections and decks. To protect everything, including all accounts, back up on the Docker host:

1. The data folder, /opt/mana-vault/data.
2. The stack's environment values (in Dockhand, or the .env file).
3. docker-compose.yml.

Keep one copy off the Docker host. A Docker volume is not a backup.

To restore a server backup, stop the stack, put the saved files back in /opt/mana-vault/data (owned by 65532:65532), and start the stack again.
