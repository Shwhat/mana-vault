# Collections

A collection holds the cards you own, such as a binder, a box or a set you are completing. Each account has its own collections, and every copy you record lives in exactly one of them.

## Collection settings

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Name | Text, 1 to 100 characters | Yes | None | Shown in the Collections panel, the collection view and the status bar |
| Description | Text, up to 500 characters | No | Empty | A note for yourself, such as where the binder is kept |
| Completion rule | Main set, Every printing, or Each card name once | Yes | Main set | How set completion is counted; see [Set completion](/about/set-completion) |
| Finish rule | Any finish, Regular only, Foil only, or One of each | Yes | Any finish | Which finishes count toward set completion. Etched copies count as foil |
| Wishlist | Ticked or not | No | Not ticked | Ticked makes the collection a wishlist: its cards are wanted, not owned; see [Wishlists and trading](/about/wishlists-and-trading) |
| Linked sets | Any number of sets, or none | No | None | The sets whose completion this collection tracks |

A new account starts with an empty collection named **Main collection** that is not linked to any set.

## Creating and changing collections

1. **New collection...** (Collection menu, Collection ribbon tab, or **New...** in the Collections panel) asks for every field above.
2. To link sets, type part of a set name or code in **Linked sets**, then tick the sets in the list. Chosen sets appear as chips above the list; **×** on a chip removes it. Sets appear once the card database is loaded.
3. **Create collection** creates it, opens it in the collection view and, when it is your only collection, makes it the target collection.
4. **Collection settings...** changes any field of the open collection. Changing the rules or the linked sets never changes the cards in the collection.
5. **Delete collection...** asks "Delete name and its N cards?" and removes the collection and its cards. A collection shared with other people warns that they will lose it too. Deleting cannot be undone, and it clears the undo history.

## The target collection

**Add to collection** always puts cards into the **target collection**. The status bar shows it as ADD TO: name.

- Change it with **Cycle target collection** (C), by clicking ADD TO in the status bar, with **Add here** on a row of the Collections panel, or with **Add cards here** in the collection view header.
- The target is kept for your account. If it is deleted, the first remaining collection becomes the target.
- In the Missing tab, **+ Collection** adds the card to the open collection instead, in the finish that is missing.

## Adding cards

1. Select a printing in the card search.
2. Press Enter, choose **+ Collection** on the row, double-click the row, or use **Add to collection**.
3. One copy is added to the target collection. If that collection already has the printing in the same finish, its count goes up by one.

**Add as foil** decides the finish. It is off by default and kept for your account. Switch it with **F**, FOIL in the status bar, the Home ribbon tab or the Cards menu.

## Collection entries

Each entry (row) is one printing in one finish, condition and language. A printing can have several rows in the same collection, for example a regular near mint English row and a foil played Japanese row.

| Field | Type | Default | Notes |
|---|---|---|---|
| Card | Printing | | The exact set and collector number |
| Finish | Regular, Foil or Etched | Regular, or Foil when Add as foil is on | Set by Add as foil, Copy details, or an import's Foil column |
| Condition | Mint, Near mint, Lightly played, Moderately played, Heavily played or Damaged | Near mint | Set by Copy details or an import's Condition column |
| Language | English and the other languages cards are printed in | English | Set by Copy details or an import's Language column |
| Count | Whole number from 1 to 10,000 | 1 | A count that would drop below 1 removes the entry |
| For trade | Whole number from 0 to the count | 0 | How many of the copies are on your trade list |

Rows that are not regular, near mint or English show the difference after the set, for example "Foil, Lightly played, Japanese".

## Copy details

**Copy details...** (E, Collection menu, Collection ribbon tab, the details button on a row, or a double-click in the binder) changes the selected row's Finish, Condition, Language and For trade. All copies in the row change together. When another row already has the new finish, condition and language, the two rows are merged and their counts and numbers for trade are added together. A change can be undone.

| Message | Cause |
|---|---|
| Enter a number for trade from 0 to N | For trade is not a whole number, or is more than the row's count |
| Select a row in the collection first | Copy details with no row selected |
| Card name changed | The change was saved |

## The collection view

Press **2** (or **Collection** on the Home ribbon tab) to open it. The header holds:

| Item | Use |
|---|---|
| Collection list | Switches the open collection |
| Cards, Completion, Missing, Statistics | The four tabs; see [Set completion](/about/set-completion) for Completion and Missing, and [Prices and statistics](/about/prices-and-statistics) for Statistics |
| Adds here, or Add cards here | Shows that the open collection is the target, or makes it the target |
| Wishlist | Shown when the collection is a wishlist |
| Shared by name, or Shared with names | Shown for shared collections |
| Filter box | Keeps the rows whose card name, set name or set code contains the text (Cards tab) |
| Select | Turns on checkboxes for picking rows by tap or click (Cards tab) |
| Count | Cards in the open collection |

Above the rows of the Cards tab, a bar holds:

| Item | Use |
|---|---|
| Sort | Name, Price, highest first, Price, lowest first, Quantity, or Set and number. Kept for your account |
| List, Binder | Shows rows, or binder pages of nine cards. **Binder layout** (B) switches between them |
| For trade only | Keeps only rows with copies for trade |
| Filter tags | One tag for each active filter, with **×** to remove it, and **Clear tags** when there are two or more |
| Count and value | The rows shown of all rows, and the collection's value (wanted value for a wishlist) |

Each row in the list shows the card image, name, a FOIL or ETCHED badge, a FOR TRADE badge with the number for trade, set, set code, collector number, rarity, the condition and language when not near mint English, the row's value, the count with minus and plus buttons, and details, move and remove buttons.

## Filter tags

Clicking the set code or rarity on a row keeps only the rows that share it, and adds a tag above the rows. Clicking a bar in the Statistics tab opens the Cards tab with that bar's tag. Tags combine with each other and with the filter box.

| Tag | Keeps rows whose |
|---|---|
| Set | Printing is from the set |
| Rarity | Printing has the rarity |
| Color | Card is that one color, Multicolor (two or more) or Colorless |
| Type | Type line holds the type (front face for two-faced cards) |
| Mana value | Mana value is in the group, lands excluded |
| Finish | Finish is Regular, Foil or Etched |
| For trade | Row has copies for trade |

Tags are cleared when you open another collection.

## Binder layout

The binder shows the rows in the current sort and filter as pages of nine cards in three rows. Each card shows its count, a FOIL or ETCHED badge, a TRADE badge, and the price of one copy. **Previous page** and **Next page**, or Page Up and Page Down, turn the pages. Click a card to select it, Ctrl+click or Shift+click to pick several, and double-click to open Copy details.

## Picking several rows

| To | Do |
|---|---|
| Pick one row | Click it, or move to it with Up and Down |
| Add or remove a row from the picked rows | Ctrl+click it (Cmd+click on a Mac), or tap it with **Select** turned on |
| Pick a range | Click the first row, then Shift+click the last |
| Pick every row the filter box shows | Ctrl+A, **Select all rows**, or **Select all** in the picked bar |
| Drop the picked rows | Esc, or **Done** in the picked bar |

When more than one row is picked (or Select is on), a bar above the list shows how many entries and cards are picked, with **Select all**, **Move...**, **For trade**, **Not for trade**, **Remove...** and **Done**. For trade and Not for trade work like Mark for trade and Unmark for trade; see [Wishlists and trading](/about/wishlists-and-trading). The status bar also shows the number picked.

## Removing cards

- The remove button on a row, or minus at a count of 1, removes that entry at once.
- **Remove selected...** (Delete key, Edit menu, Collection ribbon tab, or **Remove...** in the picked bar) asks first, for example "Remove 37 entries (112 cards) from Binder?", then removes every picked entry.
- To remove many cards of one kind, type in the filter box (for example a set name), press Ctrl+A, then Delete.

## Moving cards

- The move button on a row opens **Move**: choose the collection to move to and, when the entry has more than one copy, how many copies to move.
- **Move selected...** (Edit menu, Collection ribbon tab, or **Move...** in the picked bar) moves every copy of each picked entry to the chosen collection.
- Moved copies are added to the other collection's counts, in a row with the same finish, condition and language. A move needs at least two collections.
- Copies marked for trade stay behind while enough copies are left; the rest of the marks move with the copies.

## Owned counts

The Card panel's Owned group shows, for the selected printing, the regular, foil and etched copies across all your collections, the copies of every printing of the same card, and a line for each collection that holds the card, with the number for trade. A collection that holds only other printings of the card shows "Other printings only". Wishlists are not counted; each wishlist that holds the card has its own "Wanted" line.

## Collections panel

The Collections panel lists your collections, including those shared with you, with the number of cards, their value and, for collections linked to sets, a completion bar and percentage. Click a collection to open it in the collection view. **Add here** makes it the target; the target shows **Adds here**. A **Shared** badge marks collections shared with or by you, and a **Wishlist** badge marks wishlists.

## Undo

Adding cards, changing counts, removing entries (one or many), moving cards, Copy details, trade marks and adding to the wishlist can be undone with Ctrl+Z and redone with Ctrl+Y. A bulk remove or move undoes as one step. Creating, changing and deleting collections cannot be undone.
