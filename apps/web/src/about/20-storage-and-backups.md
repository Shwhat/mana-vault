# Storage and backups

## Where data is kept

Everything Mana Vault stores is in one SQLite database file, mana-vault.sqlite, in the server's data folder (/data inside the container, /opt/mana-vault/data on the Docker host by default). It holds:

- the card database, including custom cards and custom sets with their pictures, and the mana symbols downloaded for the card maker
- every account's print list
- every account's collections, decks, shares and offers
- accounts (with passwords stored only as salted hashes), sessions, phone device sign-ins (stored only as hashes) and per-account preferences
- the ids of changes already received from phones, for 30 days, so a change sent twice is applied once
- server settings, invite codes, the activity list, the full Scryfall record of every card, Art and Oracle tags and price history

Each phone with the Android app also keeps a copy of its account's library and the card list, and any changes not yet sent (see [Android app](/about/android-app)). That copy is not a backup; it is replaced from the server at each sync.

The data folder can also hold default-cards.json, the last downloaded card catalog file, while an update runs, and the backups folder of whole-server backups.

Card pictures downloaded to the server are kept in the picture folder: by default the pictures folder in the data folder, and in the Docker install /pictures inside the container (/opt/mana-vault/pictures on the Docker host by default). The picture folder holds a small marker file, .mana-vault-pictures, so Mana Vault never fills an empty mount point by mistake. See [Administration](/about/administration).

## In-app backup

**Download backup** (File menu) downloads mana-vault-backup.json with the signed-in account's own collections and decks. It contains:

| Part | Contents |
|---|---|
| Collections | Every collection you own, with its name, description, completion rule, finish rule, whether it is a wishlist, linked sets and dates |
| Copies | Every row in those collections with its finish, condition, language, proxy, count, number for trade, purchase price, date added, and misprint, altered and signed marks |
| Decks | Every deck you own, with its name, format, the collection remembered for it, its description and cover card, and dates |
| Deck cards | Every card in those decks, with zone, count, printing and tags |
| Deck links | Which copies in your own collections fill each deck card |
| Cards | The card records they use, so a backup can be restored on a server with an empty card database |
| Custom sets and custom cards | The custom sets and custom cards you made or use, with their card maker designs, pictures, art and set symbols (SVG symbols included) |
| Art library | Every picture you added to the art library, with its name (backups made with 0.15.0 and later). A restore keeps pictures other accounts added |
| Card back | The card back you uploaded for printing, if any (backups made with 0.15.0 and later) |
| Purchase history | Every entry with its lines, openings, tied cards, sales, sealed values, place, who paid shipping and receipt (backups made with 0.16.0 and later, version 7). On restore each place is matched to the server's places by name, and added when it is new |

A backup does not contain collections or decks shared with you by others, accounts, preferences, prices, deck history, trades, the trade binder link, the print list or the full card database. Prices return with the next card database update.

## Restoring a backup

1. Choose **Restore backup...** and pick a Mana Vault backup file of 250 MB or less.
2. Mana Vault checks the file and asks whether to replace all of your own collections and decks, listing the backup's date and what it holds.
3. Choose **Restore backup** to go ahead, or **Cancel**.
4. Your own collections and decks are replaced by the backup's. Items you had shared stop being shared, and offers of them are cancelled. Collections and decks shared with you by others, and other accounts' data, are not changed. The card records in the backup are added to the card database; the rest of the card database is unchanged. Custom sets and custom cards missing on the server are added, made by your account; custom cards already on the server keep their current version.

A restore cannot be undone, and it clears the undo history. Backups made before version 0.2.0 hold a single collection; they restore as a collection named Main collection. Backups made before version 0.3.0 restore every copy as near mint English with none for trade, and every collection as a collection (not a wishlist). Backups made before version 0.6.0 restore without proxies, copy details or deck links, and cards of decks that kept cards by name take the newest printing. A backup made with 0.16.0 or later replaces your purchase history with the backup's, tied to the restored collections; an older backup leaves it as it is, and its ties to collections that the restore replaced count nothing. A backup made with 0.15.0 or later replaces your art library and uploaded card back with the backup's; an older backup leaves them as they are. Download a backup first if the current data might be needed.

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
| The backup file must be 250 MB or smaller | The file is too large |
| Backup art N is invalid | A picture of the art library in the file is damaged |
| Backup purchase history is invalid | An entry of the purchase history in the file is damaged |

## Server backups

The in-app backup covers one account's collections and decks. To protect everything, including all accounts, an admin uses **Storage and backups** in Administration: scheduled whole-server backups, **Back up now**, download and restore (see [Administration](/about/administration)). Copy downloaded backups off the server.

On the Docker host, back up:

1. The data folder, /opt/mana-vault/data.
2. The stack's environment values (in Dockhand, or the .env file).
3. docker-compose.yml.

Keep one copy off the Docker host. A Docker volume is not a backup.

Pictures do not need a backup; they download again. To restore a copy of the data folder, stop the stack, put the saved files back in /opt/mana-vault/data (owned by 65532:65532), and start the stack again.
