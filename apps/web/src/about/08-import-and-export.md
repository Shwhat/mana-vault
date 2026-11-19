# Import and export

Mana Vault reads collection CSV files and decklists, and writes collection CSV, deck text and deck CSV files. Backups are covered in [Storage and backups](/about/storage-and-backups).

## Importing a collection CSV

1. Choose **Import collection CSV...** (File menu or Collection ribbon tab) and pick a .csv file of 5 MB or less.
2. Mana Vault checks every row without changing anything and shows a preview: matched rows, the number of cards they hold, and up to eight skipped rows. All skipped rows are listed in the Import review panel.
3. Choose **Import matched rows** to add them, or **Cancel**. Skipped rows are never imported.
4. Imported cards are added to existing counts. Running the same import twice adds the cards twice. Imports cannot be undone.

### Collection CSV columns

The first line must hold column names. Column names are matched without regard to capital letters. Other columns are ignored.

| Column | Other accepted names | Required | Meaning |
|---|---|---|---|
| Name | Card Name | Yes | Card name, exactly as printed |
| Count | Quantity, Qty | No | Copies, a whole number from 1 to 10,000. Empty means 1 |
| Edition | Set, Set Code, Set Name | No | Set code or full set name |
| Collector Number | collector_number, Number | No | Collector number |
| Foil | | No | true, yes, y, 1 or foil for foil; empty, false, no, n, 0, nonfoil or non-foil for regular |

### How a row is matched

- The name is matched without regard to capital letters.
- When a set or collector number is given, the printing must match them. Otherwise, and when several printings match, the newest printing is used.
- Rows that list the same printing and finish are added together.
- A file can hold up to 5,000 card rows.

## Exporting the collection

**Export collection (Moxfield CSV)** downloads mana-vault-collection.csv with these columns, which Moxfield imports directly:

| Column | Value |
|---|---|
| Count | Copies |
| Tradelist Count | 0 |
| Name | Card name |
| Edition | Set name |
| Condition, Language, Tags, Last Modified, Alter, Proxy, Purchase Price | Empty |
| Foil | true or false |
| Collector Number | Collector number |

## Importing a decklist

1. Open the deck to import into.
2. Choose **Import decklist...** (File menu or Decks ribbon tab) and pick a .txt or .csv file of 5 MB or less.
3. Review the preview and choose **Import matched rows**. Cards are added to the deck's existing counts.

### Text decklists

One card per line: a count, an optional "x", then the card name, for example `4 Lightning Bolt` or `1x Sol Ring`.

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
