# Import and export

Mana Vault reads collection CSV files and decklists, and writes collection CSV, deck text and deck CSV files. Backups are covered in [Storage and backups](/about/storage-and-backups).

## Importing a collection CSV

1. Choose **Import collection CSV...** (File menu or Collection ribbon tab) and pick a .csv file of 5 MB or less.
2. Mana Vault checks every row without changing anything and shows a preview: matched rows, the number of cards they hold, and up to eight skipped rows. All skipped rows are listed in the Import review panel.
3. Choose the collection to import into with **Into collection** (the open collection by default).
4. Choose **Import matched rows** to add them, or **Cancel**. Skipped rows are never imported.
5. Imported cards are added to existing counts. Running the same import twice adds the cards twice. Imports cannot be undone.

### Collection CSV columns

The first line must hold column names. Column names are matched without regard to capital letters. Other columns are ignored.

| Column | Other accepted names | Required | Meaning |
|---|---|---|---|
| Name | Card Name | Yes | Card name, exactly as printed |
| Count | Quantity, Qty | No | Copies, a whole number from 1 to 10,000. Empty means 1 |
| Edition | Set, Set Code, Set Name | No | Set code or full set name |
| Collector Number | collector_number, Number | No | Collector number |
| Foil | Finish, Printing | No | true, yes, y, 1 or foil for foil; etched for etched; empty, false, no, n, 0, nonfoil, non-foil, normal or regular for regular |
| Condition | | No | Mint, Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged, their codes M, NM, LP, MP, HP, D or DMG, the ManaBox forms such as near_mint, and Excellent (Lightly played), Good or Played (Moderately played), Poor (Heavily played). Empty means Near mint |
| Language | Lang | No | A language name such as Japanese, or a Scryfall code such as ja or zhs. Empty means English |
| Tradelist Count | Trade Count, Trade | No | How many of the row's copies are for trade, 0 or more; more than the count is treated as the count. Empty means 0 |

### How a row is matched

- The name is matched without regard to capital letters. It can also be a printing's flavor name, or the front face of a two-faced card (such as Delver of Secrets for Delver of Secrets // Insectile Aberration); an exact card name is preferred.
- When a set or collector number is given, the printing must match them. Otherwise, and when several printings match, the newest printing is used.
- Rows that list the same printing, finish, condition and language are added together.
- A file can hold up to 5,000 card rows.

## Exporting the collection

**Export collection (Moxfield CSV)** downloads the open collection as collection-name.csv with these columns, which Moxfield imports directly:

| Column | Value |
|---|---|
| Count | Copies |
| Tradelist Count | Copies for trade |
| Name | Card name |
| Edition | Set code |
| Condition | Mint, Near Mint, Lightly Played, Moderately Played, Heavily Played or Damaged |
| Language | Language name, such as English |
| Foil | foil, etched, or empty for regular |
| Tags, Last Modified, Alter, Proxy, Purchase Price | Empty |
| Collector Number | Collector number |

Exporting and importing again gives the same rows.

## Exporting a missing list

The missing cards of a collection linked to sets export as text or CSV; see [Set completion](/about/set-completion). The missing cards of a deck export as text; see [Decks](/about/decks).

## Importing a decklist

1. Open the deck to import into.
2. Choose **Import decklist...** (File menu or Decks ribbon tab) and pick a .txt or .csv file of 5 MB or less.
3. Review the preview and choose **Import matched rows**. Cards are added to the deck's existing counts.

### Text decklists

One card per line: a count, an optional "x", then the card name, for example `4 Lightning Bolt` or `1x Sol Ring`. Card names match the same way as collection rows: exact name, flavor name, or front face.

- A printing can follow the name as a set code in brackets or parentheses and an optional collector number: `1 Lightning Bolt (M10) 146` or `1 Sol Ring [LEA] #269`.
- A line reading `Main`, `Mainboard`, `Deck`, `Side`, `Sideboard` or `Commander` (optionally after `//` or `#`, optionally ending with a colon) starts that zone. Lines before any heading go to the main deck.
- A line can start with `SB:` or `Commander:` to put just that card in the sideboard or commander zone.
- Other lines starting with `//` or `#` are comments and are skipped.

### CSV decklists

A CSV file is read as a decklist when its first line has a Name or Card Name column.

| Column | Other accepted names | Required | Meaning |
|---|---|---|---|
| Name | Card Name | Yes | Card name |
| Quantity | Count, Qty | No | Copies, 1 to 100. Empty means 1 |
| Set | Set Code, Edition | Theme decks | Set code or name |
| Collector Number | collector_number, Number | Theme decks | Collector number |
| Zone | Board, Section, Location | No | Main, Mainboard, Deck, Side, Sideboard, SB, Commander or Command zone. Empty means main deck |

### Decklist rules

| Rule | Message in the review |
|---|---|
| Every row needs a card name | Card name is empty |
| Counts are whole numbers from 1 to 100 | Quantity must be a whole number from 1 to 100 |
| Theme decks need the exact printing | Theme decks need both a set and collector number |
| The card must be in the card database | No card with this name exists in the local catalog |
| A given set and number must match a printing | No printing matched the supplied set and collector number |
| The zone must be recognized | Zone must be Main, Sideboard, or Commander |

Normal decks ignore the printing and keep the card by name.

## Exporting a deck

| Command | File | Contents |
|---|---|---|
| Export deck (text) | deck-name.txt | A `# Deck name` title, then `// Commander`, `// Mainboard` and `// Sideboard` sections with lines such as `4 Lightning Bolt`. Theme decks add the printing: `4 Lightning Bolt (M10) 146` |
| Export deck (CSV) | deck-name.csv | Columns Name, Quantity, Set Code, Collector Number, Zone, Mode. Set Code and Collector Number are filled for Theme decks only |

Both exports can be imported again into a deck of the same mode.

## Import review panel

After a preview or an import, the Import review panel shows the file name, whether it was a preview or an import, the matched rows and cards, and every skipped row with its row number (line number for text decklists), card name and reason. **Clear** empties the panel. The panel opens automatically when rows were skipped.
