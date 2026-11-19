# Import and export

Mana Vault reads collection files from Mana Vault, Moxfield, ManaBox, Archidekt, Deckbox and TCGplayer, plain text lists, and decklists. It writes the same formats. Backups are covered in [Storage and backups](/about/storage-and-backups).

## The Import window

**Import...** (Files group of the Home ribbon tab, Import on Home, or the empty collection view) opens one window for every import. **Import collection...** and **Import decklist...** open it with Collection or Deck chosen.

| Item | What it does |
|---|---|
| Import into | **Collection** or **Deck** (Deck needs an open deck) |
| File | **Choose file...** picks a .csv or .txt file of 5 MB or less |
| Format | For collections: **Detected: format** (worked out from the file), or a format you choose when the detection is wrong |
| Collection | The collection to import into (the open collection by default), or **New collection...** with a Name |
| Deck | The open deck |
| Preview | "N rows (N cards) match. N rows are skipped." and up to eight skipped rows with their reasons |
| Import | Adds the matched rows. Skipped rows are never imported |

1. Choose what to import into and the file. Mana Vault checks every row without changing anything and shows the preview.
2. When the detected format is wrong, choose another; the preview runs again.
3. Choose **Import**, or **Cancel**. All skipped rows are listed in the Import review panel.
4. Imported cards are added to existing counts. Running the same import twice adds the cards twice. Imports cannot be undone.

### How the format is detected

| The file's first line | Format |
|---|---|
| Starts with a count, such as `4 Lightning Bolt`, or has one column | Plain text list |
| Has a ManaBox ID column | ManaBox CSV |
| Has Scryfall ID, Finish, Proxy and Trade columns | Mana Vault CSV |
| Has Product ID or Simple Name, or Printing with Set Code | TCGplayer CSV |
| Has Edition Code with Finish, or Date Added with Edition Name | Archidekt CSV |
| Has Edition Code, Card Number, Artist Proof or Printing Id | Deckbox CSV |
| Anything else | Moxfield CSV |

### Collection CSV columns

Every CSV format is read with the same column names, matched without regard to capital letters. The first name found is used. Other columns are ignored.

| Detail | Column names | Required | Meaning |
|---|---|---|---|
| Card name | Name, Card Name, Card | Yes, unless a Scryfall ID is given | Card name, its flavor name, or the front face of a two-faced card |
| Count | Count, Quantity, Qty, Amount | No | Copies, a whole number from 1 to 10,000. Empty means 1 |
| Set code | Set code, Edition Code | No | The set's code |
| Set | Edition, Set, Set Name, Edition Name | No | The set's code or full name |
| Collector number | Collector Number, Card Number, Number, CN | No | Collector number |
| Finish | Finish, Foil, Printing | No | true, yes, y, 1 or foil for foil; etched or etched foil for etched; empty, false, no, n, 0, nonfoil, non-foil, normal or regular for regular. A TCGplayer condition ending in "Foil" (Near Mint Foil) also means foil |
| Condition | Condition | No | Mint, Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged, their codes M, NM, LP, MP, HP, D or DMG, the ManaBox forms near_mint, lightly_played and so on, and Excellent (Lightly played), Good or Played (Moderately played), Poor (Heavily played). Empty means Near mint |
| Language | Language, Lang | No | A language name such as Japanese, or a code such as ja or zhs. Empty means English |
| For trade | Tradelist Count, Trade Count, Trade | No | How many of the row's copies are for trade, 0 or more; more than the count is treated as the count. Empty means 0 |
| Scryfall ID | Scryfall ID | No | The exact printing; used before the name, set and number |
| Purchase price | Purchase Price, Price Paid | No | A number of 0 or more, such as 0.57 |
| Purchase currency | Purchase Price Currency, Purchase Currency | No | A three letter code such as USD. Empty with a price means USD |
| Date added | Added, Date Added | No | A date. Empty means the day of the import |
| Proxy | Proxy | No | true, yes, y or 1 makes the row a proxy |
| Misprint, Altered, Signed | Misprint; Altered, Alter, Altered Art; Signed | No | true, yes, y or 1 sets the mark |

### Plain text lists

One card per line: a count, an optional "x", then the card name, for example `4 Lightning Bolt` or `1x Sol Ring`. A line without a count is one copy. A set code in parentheses and a collector number can follow the name: `2 Opt (XLN) 65`. `*F*` after it means foil and `*E*` etched. Lines starting with `//` or `#`, and the headings Deck, Sideboard, Commander and Maybeboard, are skipped.

### How a row is matched

- A Scryfall ID gives the exact printing.
- Otherwise the name is matched without regard to capital letters. It can also be a printing's flavor name, or the front face of a two-faced card (such as Delver of Secrets for Delver of Secrets // Insectile Aberration); an exact card name is preferred.
- When a set or collector number is given, the printing must match them. Otherwise, and when several printings match, the newest printing is used.
- Rows that list the same printing, finish, condition, language and proxy are added together. Details a row already has (purchase price, currency, date added) are kept.
- A file can hold up to 5,000 card rows.

## The Export window

**Export...** (Files group of the Home ribbon tab) opens one window for every export. **Export collection...**, **Export deck...** and **Export missing cards...** open it with that choice made.

| Item | Choices |
|---|---|
| Export | Whole collection: name (the open collection); Filtered cards (the rows shown under the collection's search box and filter tags); Selected cards (the picked rows); Missing cards (a collection with a completion rule and linked sets); Deck: name (the open deck). Only the choices that apply are offered |
| Format | Mana Vault CSV, Moxfield CSV, ManaBox CSV, Archidekt CSV, Deckbox CSV, TCGplayer CSV, Plain text list |

**Export** downloads name.csv (or name.txt for a plain text list); in the Android app the share sheet opens. Missing cards are named "collection-name-missing".

### Export columns

| Format | Columns |
|---|---|
| Mana Vault CSV | Quantity, Trade, Name, Set code, Collector number, Finish (normal, foil, etched), Condition (code), Language (code), Proxy, Purchase price, Purchase currency, Added, Misprint, Altered, Signed, Scryfall ID. Every detail Mana Vault keeps; importing it again gives the same rows |
| Moxfield CSV | Count, Tradelist Count, Name, Edition (set code), Condition (Near Mint and so on), Language (name), Foil (foil, etched or empty), Tags, Last Modified, Collector Number, Alter, Proxy (True or False), Purchase Price |
| ManaBox CSV | Name, Set code, Set name, Collector number, Foil (normal, foil, etched), Rarity, Quantity, ManaBox ID (empty), Scryfall ID, Purchase price, Misprint, Altered, Signed, Condition (near_mint and so on), Language (code), Proxy, Purchase price currency, Added |
| Archidekt CSV | Quantity, Name, Finish (Normal, Foil, Etched), Condition, Date Added, Language, Purchase Price, Tags, Edition Name, Edition Code, Collector Number, Scryfall ID |
| Deckbox CSV | Count, Tradelist Count, Name, Edition (set name), Edition Code, Card Number, Condition, Language, Foil, Signed, Artist Proof, Altered Art, Misprint, Promo, Textless, My Price |
| TCGplayer CSV | Quantity, Name, Set, Card Number, Set Code, Printing (Normal or Foil), Condition, Language, Rarity |
| Plain text list | One line per row: `4 Lightning Bolt (M10) 146`, with `*F*` for foil and `*E*` for etched |

A deck exports its cards with their printings (and the finish of the first linked copy).

## Importing a decklist

1. Open the deck to import into.
2. Choose **Import...** and **Deck**, or **Import decklist...**, and pick a .txt or .csv file of 5 MB or less.
3. Review the preview and choose **Import**. Cards are added to the deck's existing counts, as missing cards; link them to your copies with **Link copies...**.

### Text decklists

One card per line: a count, an optional "x", then the card name, for example `4 Lightning Bolt` or `1x Sol Ring`. Card names match the same way as collection rows: exact name, flavor name, or front face.

- A printing can follow the name as a set code in brackets or parentheses and an optional collector number: `1 Lightning Bolt (M10) 146` or `1 Sol Ring [LEA] #269`. Without one, the newest printing is used.
- A line reading `Main`, `Mainboard`, `Deck`, `Side`, `Sideboard` or `Commander` (optionally after `//` or `#`, optionally ending with a colon) starts that zone. Lines before any heading go to the main deck.
- A line can start with `SB:` or `Commander:` to put just that card in the sideboard or commander zone.
- Other lines starting with `//` or `#` are comments and are skipped.

### CSV decklists

A CSV file is read as a decklist when its first line has a Name or Card Name column.

| Column | Other accepted names | Required | Meaning |
|---|---|---|---|
| Name | Card Name | Yes | Card name |
| Quantity | Count, Qty | No | Copies, 1 to 100. Empty means 1 |
| Set | Set Code, Edition | No | Set code or name. Without it the newest printing is used |
| Collector Number | collector_number, Number | No | Collector number |
| Zone | Board, Section, Location | No | Main, Mainboard, Deck, Side, Sideboard, SB, Commander or Command zone. Empty means main deck |

### Decklist rules

| Rule | Message in the review |
|---|---|
| Every row needs a card name | Card name is empty |
| Counts are whole numbers from 1 to 100 | Quantity must be a whole number from 1 to 100 |
| The card must be in the card database | No card with this name exists in the local catalog |
| A given set and number must match a printing | No printing matched the supplied set and collector number |
| The zone must be recognized | Zone must be Main, Sideboard, or Commander |

## Import review panel

After a preview or an import, the Import review panel shows the file name, whether it was a preview or an import, the matched rows and cards, and every skipped row with its row number (line number for text files), card name and reason. **Clear** empties the panel. The panel opens automatically when rows were skipped.

## Messages

| Message | Cause |
|---|---|
| The file must be 5 MB or smaller | A larger file was chosen |
| The file has no card rows | The CSV file holds only a header |
| The file has no card lines | The text file holds no card line |
| The file needs a "Name" or "Card Name" column | A CSV file without a name column |
| Enter a name for the new collection | New collection... chosen without a name |
| There is nothing to export | The chosen rows are empty |
| Open a collection or a deck to export | Export with nothing open |
