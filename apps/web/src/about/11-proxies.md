# Proxies and the card maker

The Proxies view prints proxies of any card and makes custom cards. Open it with the **Proxies** tab (key 5), or the Proxies tab on a phone. It has two tabs: **Print** and **Card maker**.

## The print list

The print list holds the cards to print. It is saved with your account on the server, so it is the same on every device, and it stays until you clear it.

| Way to add cards | What it adds |
|---|---|
| **From deck...** (Print a deck...) | Every card of a deck in the commander zone, main deck and sideboard (not the maybeboard), or only its missing cards |
| **Missing cards...** (Print missing cards...) | The cards of a deck that have no linked copy |
| **From collection...** | Every row of a collection, with its count |
| **Selected cards** | The rows picked in the open collection |
| **Paste list...** | Lines in the deck list format, such as `4 Lightning Bolt` or `1 Opt (XLN) 65 *F*`. Lines that match no card are listed after adding |
| **Add tokens** | The tokens the listed cards make, one of each, that are not already listed |
| The search box | Any card in the card database, custom cards included, with **+ Print** |
| **Add to print list** | In the right-click menu of search results, collection rows and deck cards, and in the card maker |

A card already listed with the same faces gets its count raised. Each line shows the card's picture, set and number, and has:

| Control | What it does |
|---|---|
| **Printing...** | Chooses another printing of the card (the printing chooser) |
| Faces | For two-faced cards: **Front**, **Back** or **Both faces**. One-faced cards print their front |
| Minus and plus | The count, from 1 to 100. Below 1 the line is removed |
| **Remove** | Takes the line off the list |

**Clear list** removes every line after asking. Count changes are saved a moment after the last change.

### Sort and layout

Above the lines, **Sort** orders the list and **Options** chooses the layout. Both are kept for your account. The preview, the PDF and the MakePlayingCards pictures follow the list's order.

| Sort | Order |
|---|---|
| Order added | The order the cards were added (the default) |
| Name | A to Z |
| Set | By set name and collector number |
| Mana value | Lowest first |
| Rarity | Mythic, rare, uncommon, common |
| Color | White, blue, black, red, green, then multicolor, then colorless |
| Price | Highest first, in the chosen currency |
| Count | Most copies first |

| Layout | Shows |
|---|---|
| List (the default) | One line per card with its picture, set and number and the controls above |
| Grid | Card pictures with the count on each, in Small, Medium or Large; minus, plus and **Remove** under each |
| Binder | Nine pockets a page, with **Previous page** and **Next page** |

## Sheet settings

| Setting | Choices | Default |
|---|---|---|
| Paper | Letter (8.5 x 11 in), A4 (210 x 297 mm), Legal (8.5 x 14 in), Custom size (Page width and Page height in millimetres) | Letter |
| Margins | 0 to 50 mm on every side | 6 mm |
| Card size | Standard (63 x 88 mm) or Custom size (Card width and Card height) | Standard |
| Scale | 50 to 150 percent of the card size | 100% |
| Gap | 0 to 20 mm between cards | 0 mm |
| Bleed | 0 to 3 mm around each card, filled with the edges of the card picture | 0 mm |
| Cutting guides | Cut lines (lines through the whole page along every card edge), Corner marks (3 mm marks outside each corner), None | Cut lines |
| Background | Any color for the page | White |
| Card backs | None, Standard back (the standard Magic card back, downloaded by the card database update) or Uploaded back (**Upload back...**, a JPEG, PNG or WebP picture up to 6 MB, kept with your account) | None |

**Reset sheet** returns every setting to its default. The settings are kept with your preferences.

The page layout puts as many columns and rows on a page as fit inside the margins and centers the grid. For example, standard cards on Letter paper with 6 mm margins fit 3 columns and 3 rows: 3 x 63 mm = 189 mm fits in 215.9 - 12 = 203.9 mm, and 3 x 88 mm = 264 mm fits in 279.4 - 12 = 267.4 mm. Every card printed counts once per face: a line of 4 two-faced cards printed with both faces fills 8 places.

**Preview** shows every page with the cards in their places, the number of pages and the cards per page.

With a card back chosen, the PDF adds a back page after each page of fronts. The backs are mirrored left to right, so they line up with the fronts when the sheet is printed on both sides (flip on the long edge). A two-faced card printed with both faces takes one place, with its back face on the reverse; every other card has the chosen card back on the reverse. For example, 9 cards on Letter paper make one page of fronts and one page of backs.

## Exports

| Export | File | Contents |
|---|---|---|
| **Export PDF** | proxies.pdf | The pages with the sheet settings. Each card face is drawn once at 300 DPI from its full-size picture (745 x 1040 pixels from Scryfall, or the custom card's picture) |
| **MakePlayingCards pictures** | makeplayingcards.zip | One picture per card face in list order, 822 x 1122 pixels (2.74 x 3.74 inches at 300 DPI, the card in the middle 750 x 1050 with bleed around it), named with the order, the count and the card, such as "003 4x Sol Ring.jpg", ready to upload to MakePlayingCards. The zip also holds back.jpg, the card back in the same size (the uploaded back when Card backs is Uploaded back, otherwise the standard back), for the back of the order |
| **MPC Autofill list** | mpc-autofill.txt, and custom-cards.zip when custom cards are listed | One line per card with its count, such as `4 Sol Ring`, for the card list box of MPC Autofill, which finds its own scans. Two-faced cards printed with one face are listed by that face's name. Custom cards are left out of the list and put in custom-cards.zip as MakePlayingCards pictures |

Mana Vault makes every export itself and does not depend on MPC Autofill or download anything from it. Card pictures are downloaded from Scryfall through your server, three at a time, and a picture that fails is tried again. When the full-size picture cannot be had, the server uses the large picture (or the normal one), from its picture folder first.

Before a PDF or a MakePlayingCards zip is made, every picture is loaded. If some cannot be had, **Some card pictures are missing** lists those cards:

| Choice | What happens |
|---|---|
| **Try again** | Asks for the missing pictures again |
| **Make it anyway** | Makes the file; each card without a picture prints as a white card with its name |
| **Cancel** | Makes nothing |

**After exporting, add the printed cards as proxies to** adds the printed cards, one per line count, after the export, as one step that can be undone. It is off by default.

| Chosen | What happens |
|---|---|
| A collection | The cards are added as proxy copies (Near mint, English, regular) |
| A deck | The cards are added as proxy copies to the collection chosen in **Proxy copies go in**, and linked to the deck's missing cards of the same printing. Cards the deck does not have are added to its main deck with the proxies linked |

## Card maker

The card maker makes custom cards with a live preview. A saved custom card is a card in the card database for every account on the server.

### The list

The list on the left shows every custom card with its set, number, type and maker, with a search box. **New card** starts an empty card in the set chosen last with the next free collector number. **Custom sets...** opens the custom sets window. Clicking a card opens it. Leaving a card with changes that are not saved asks first. The card being made stays while other views are used.

### Buttons

| Button | What it does |
|---|---|
| **Save to card database** (**Save** for a saved card) | Checks the card, draws its pictures at 1490 x 2080 pixels and saves it. Saving changes it everywhere it is used |
| **Duplicate** | Makes an unsaved copy with the next free collector number |
| **Export PNG** | Saves the face shown as a picture |
| **Add to print list** | Adds the saved card, both faces for a double-faced card |
| **Delete...** | Deletes the card after a warning (see Rules below) |

"Not saved yet" shows while there are changes. A card made by another account opens for looking, exporting and printing; its fields cannot be changed.

### Card fields

| Field | Notes |
|---|---|
| Custom set | The custom set the card belongs to; required |
| Collector number | Up to 10 letters, digits and dashes, unique in the set |
| Rarity | Common, Uncommon, Rare, Mythic rare or Special. Colors the set symbol when the set has no picture |
| Artist | Shown on the card's information line as "Illus." |
| Double-faced card | Adds a back face, edited the same way with the **Front face** and **Back face** tabs |
| Kind | Normal, Creature, Planeswalker, Saga or Token |
| Style | Classic (the default), Borderless, Full art, Showcase or Nickname; see the table below |
| Frame | Automatic, White, Blue, Black, Red, Green, the ten two-color hybrids, Multicolor (gold), Artifact, Colorless or Land |
| Legendary | Adds a crest over the name bar |
| Name | Required. Card names from the card database are suggested while typing |
| Nickname | Nickname style only: shown in the name bar, with the card's name in a small bar under it |
| Mana cost | Symbols in braces, such as {2}{R} |
| Type line | Required. Card types, supertypes and subtypes are suggested while typing |
| Rules text | One ability per line. Keywords are suggested at the start of a line or after a comma. Symbols in braces are drawn as mana symbols; text in parentheses is reminder text in italics. Planeswalker lines such as "+1: Draw a card." get a loyalty cost badge; saga lines such as "I: ..." or "II, III: ..." get a chapter badge |
| Rules text size, Flavor text size | 60 to 140 percent. Text that does not fit shrinks further |
| Flavor text | In italics under a line |
| Power, Toughness | Shown in a box at the bottom right |
| Loyalty | For planeswalkers, in a shield at the bottom right |

**Symbols**, on the face heading line, opens the Symbols window. A click on a symbol puts it at the cursor of the mana cost or the rules text, whichever was used last (the mana cost before either is used); the window's title says which. On a desktop the window floats over the card maker and moves by its title bar; on a phone it is a sheet at the bottom of the screen. **Close**, **Symbols** again or Esc closes it.

The window shows the symbols as they are drawn on the card, in groups: Numbers, Colors (white, blue, black, red, green, colorless and snow), Phyrexian, Hybrid, Two or color and Other (tap, untap, energy and the rest). Once the card database update has loaded Scryfall's symbol list, the groups hold every symbol in it (except the ones from joke sets), and pointing at a symbol shows its name, such as "one white or blue mana". Before that, the groups are Numbers (0 to 20 and X), the seven colors, the five Phyrexian symbols, the ten hybrid pairs, 2/W to 2/G, and tap, untap and energy.

| Style | How the card is drawn |
|---|---|
| Classic | The frame, name bar, art box, type line and text box |
| Borderless | The art fills the whole card; the bars and text box sit over it, a little see-through |
| Full art | The art fills the frame behind the type line and text box, which sit over it |
| Showcase | A gold-trimmed frame with a double gold line, a diamond at each corner and bars with cut corners |
| Nickname | Classic, with the nickname in the name bar and the card's name in a small bar at the top of the art |

Each style comes in every frame color. Dragging the art moves it inside the area the style gives it.

On a phone the whole card shows small at the top while the fields scroll under it. A tap on it shows the card full size; **Close** or a tap closes it.

The Automatic frame follows the mana cost and type: no colored symbols gives Artifact (for artifacts) or Colorless, a land without a mana cost gives Land, one color gives that color, two colors in hybrid symbols only gives that hybrid, and two or more colors otherwise give Multicolor (gold).

The frames are Mana Vault's own designs, with the parts of a card in their usual places: name bar with mana cost, art box, type line with set symbol, text box, power and toughness box and an information line. They are not copies of the frame artwork printed on real cards. Mana symbols are Scryfall's symbol pictures, downloaded once by the server and kept in its database; a symbol that cannot be downloaded is drawn as a colored circle with its letters.

### Art

| Control | What it does |
|---|---|
| **Upload art...** | A JPEG, PNG or WebP picture up to 10 MB. Saving the card also keeps the art in your art library |
| **Art library...** | Opens your art library to choose art for this face |
| **Art of a card...** | Searches the card database and uses the chosen card's art |
| **Remove art** | Clears the art |
| Zoom | 50 to 300 percent |
| Dragging the art | Moves it inside the art box |

### Card data

| Field | Notes |
|---|---|
| Colors from the mana cost | On by default. Off: choose the colors |
| Color identity from the mana symbols on the card | On by default (mana cost and rules text). Off: choose the colors |
| Finishes | Regular, Foil, Etched; at least one |
| Price (USD), Price (EUR) | Optional. The price is used for every finish |
| Legal in | The formats the card is legal in. New cards are legal in Casual only |
| Tokens it makes | Tokens from the card database, found by name |

Colors from the mana cost, Color identity and the mana value use Scryfall's symbol list once the card database update has loaded it: {W/U} is white and blue, {2/R} counts 2, and {R/P} is red. Before that, numbers count as themselves, X as 0, a hybrid symbol as its larger part and every other symbol as 1.

### Art library

Your art library keeps pictures for the card maker. It belongs to your account and is part of your account backups.

| Command | What it does |
|---|---|
| **Upload art...** (in the window) | Adds a JPEG, PNG or WebP picture up to 10 MB, named after its file |
| A click on a picture | Uses it on the face being edited |
| Right-click (long press) menu | **Use on this card**, **Rename...**, **Delete...** |
| Find art by name | Shows only the pictures whose name holds the words |

Art uploaded on a card or chosen with **Art of a card...** is added to the library when the card is saved; the same picture is kept once. The first start of 0.15.0 adds the art of every custom card you made. Deleting a picture from the library leaves the cards that use it unchanged.

### Custom sets

The **Custom sets** window lists every custom set with its symbol, code, name, release date, card count and maker. A right-click (a long press on a phone, or the menu key) on a set opens its menu; a double click on your own set opens **Edit set...**.

| Command | What it does |
|---|---|
| **Edit set...** | Your own sets: the Edit set window |
| **Show its cards** | Card search for `set:` and the set's code |
| **New card in this set** | Starts a new card in the set, numbered after its last card |
| **Delete...** | Your own sets without cards: asks, then deletes the set |

| Field | Notes |
|---|---|
| Set code | 2 to 6 letters or digits, such as XXX. A code used by a Scryfall set or another custom set cannot be taken |
| Set name | Required |
| Release date | Cards of the set get the date |
| Set symbol | **Upload symbol...** (SVG, PNG, JPEG or WebP up to 512 KB), **Scryfall set symbol...** (the symbol of any Scryfall set, from the symbols the card database update saved, found by name or code) or **Remove symbol**. The symbol is shown on the type line |
| Rarity colors (SVG symbols) | On by default. An SVG symbol is drawn in the card's rarity colors with a white outline: black for common, silver for uncommon, gold for rare, orange for mythic rare and purple for special. Off: the symbol keeps its own colors |

**Create set** adds the set with the fields under New custom set. **Save** in Edit set saves every change at once. A new code moves every card of the set to it, and is checked the same way as a new set's code. Edit set changes can be undone and redone (Edit, Undo and Redo).

SVG symbols are cleaned when they are saved: scripts, event handlers, links to other files and embedded pages are removed, and an SVG without any drawing left is refused with "This SVG has no drawing Mana Vault can use".

### Rules

- Custom cards and custom sets are shared by every account on the server. Each shows who made it, and only that account can change or delete it.
- Custom cards work like every other card: card search (also `is:custom` and `set:XXX`), collections, decks with format checks by the chosen legality, deck import and Quick add by name or set and number, trades, statistics, exports and the print list. They show a Custom badge. The scanner does not match them.
- Card database updates never change or remove custom cards.
- A custom card that is in another account's collection, deck or trade cannot be deleted. Deleting one that is only in your own collections and decks removes those copies and deck cards too.
- Backups include the custom sets and custom cards you made or use, with their pictures and art.
