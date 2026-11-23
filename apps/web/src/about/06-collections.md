# Collections

A collection holds the cards you own, such as a binder, a box or a set you are completing. Each account has its own collections, and every copy you record lives in exactly one of them.

## Collection settings

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Name | Text, 1 to 100 characters | Yes | None | Shown in the Collections panel, the collection view and the status bar |
| Description | Text, up to 500 characters | No | Empty | A note for yourself, such as where the binder is kept |
| Completion rule | None, Main set, Every printing, or Each card name once | Yes | None | How set completion is counted; see [Set completion](/about/set-completion). None tracks no completion, for bulk cards; the Completion and Missing tabs are then hidden. Choose another rule at any time in Collection settings |
| Finish rule | Any finish, Regular only, Foil only, or One of each | Yes | Any finish | Which finishes count toward set completion. Etched copies count as foil |
| Wishlist | Ticked or not | No | Not ticked | Ticked makes the collection a wishlist: its cards are wanted, not owned; see [Wishlists and trading](/about/wishlists-and-trading) |
| Linked sets | Any number of sets, or none | No | None | The sets whose completion this collection tracks |

A new account starts with an empty collection named **Main collection** that is not linked to any set.

## Creating and changing collections

1. **New collection...** (File menu, **New...** in the Collections panel, **New collection...** in the scanner's Add to window, or in the Import window) asks for every field above.
2. To link sets, type part of a set name or code in **Linked sets**, then tick the sets in the list. Chosen sets appear as chips above the list; **×** on a chip removes it. Sets appear once the card database is loaded.
3. **Create collection** creates it, opens it in the collection view and, when it is your only collection, makes it the target collection.
4. **Collection settings...** changes any field of the open collection. Changing the rules or the linked sets never changes the cards in the collection.
5. **Delete collection...** asks "Delete name and its N cards?" and removes the collection and its cards. A collection shared with other people warns that they will lose it too. Deleting cannot be undone, and it clears the undo history.

## Where new cards go

New cards go to the collection or deck **selected last**. How a click works depends on where you are:

| Where | One click (or tap) | Double click (or double tap) |
|---|---|---|
| Collection or Decks tab: the switcher and the Collections and Decks panels | Opens it | Opens it |
| Search tab and the other tabs: the Collections and Decks panels | Picks it as where new cards go; the search stays open | Opens it in the Collection or Decks tab |

Only a true double click opens (at the computer's double-click speed); a slow second click only picks it again. Coming back to Search keeps the search, the filters, the results and the scroll position. Only that one is highlighted and marked **Adding here** in its panel. The status bar shows it as ADDING TO: name, or ADDING TO: DECK name; clicking it with a deck open switches between the deck and the target collection ("Adding to name").

- With a collection selected, **Add to collection** puts cards into it, the **target collection**.
- With a deck selected, every add command (**Add to collection**, Enter, a double-click in card search, the Card panel and the scanner's **Add to**, which is filled in with the deck) adds the card to that deck in the target zone. A free collection copy is linked; when free copies are in more than one collection you choose one; with none the card is missing (see [Decks](/about/decks)). **Add as proxy** still adds a proxy copy to the target collection.
- **Cycle target collection** (C), clicking ADDING TO in the status bar without a deck open, and **+ Add** in the collection view header choose a collection.
- The add button names where the card goes: **+ name** (or **Add to name** in the Card panel) follows the collection or deck selected last. Card search results, the Card panel, the card page and right-click menus use it.
- The choice is kept for your account. If the target collection is deleted, the first remaining collection becomes the target.
- In the Missing tab, **+ Collection** adds the card to the open collection instead, in the finish that is missing.

## Adding cards

1. Select a printing in the card search.
2. Press Enter, choose **+ collection name** under the card, double-click it, or use **Add to collection**. The right-click menu and the card page have **Add to collection name...**.
3. The printing chooser opens titled "Add card name to collection name", with the printing shown selected and the finish set by Add as foil. Press Enter to take it, or pick another printing or finish (only the finishes a printing is made in are offered). A card made in only one printing and one finish skips the chooser.
4. One copy is added to the target collection (or the deck selected last). If that collection already has the printing in the same finish, its count goes up by one.
5. When a wishlist wants the card, its want goes down by one (see [Wishlists and trading](/about/wishlists-and-trading)).

**Add as proxy** (right-click menu, card page) adds a proxy copy instead.

**Add as foil** decides the finish the printing chooser starts on: foil when it is on and the printing is made in foil. It is off by default and kept for your account. Switch it with **F** or FOIL in the status bar.

### Add precon to collection...

**Add precon to collection...** in the File menu lists every preconstructed deck MTGJSON knows (name, set, release date, deck type) with a find box. After a precon is chosen, **Add to** picks the collection (or New collection..., named after the precon), and **Add cards** adds every card of its commander, main board and side board as Near Mint English copies in the printing and finish the decklist names, as one undo step. A decklist is downloaded the first time it is used and kept. When it cannot be downloaded, nothing is added and the message says so.

### New collection...

Every list that chooses where cards go to (Add deck to collection, Move, imports, the scanner, single cards in a purchase, Open..., Change collection..., cards you get in a trade, proxy copies and Add precon to collection...) ends with **New collection...**. Choosing it asks for a name, filled in where there is one to suggest (the product, precon or deck); **Create** makes an ordinary collection of yours and picks it, with every other choice kept, and **Cancel** keeps the collection chosen before.

## Collection entries

Each entry (row) is one printing in one finish, condition and language, real or a proxy. A printing can have several rows in the same collection, for example a regular near mint English row, a foil played Japanese row and a proxy row.

| Field | Type | Default | Notes |
|---|---|---|---|
| Card | Printing | | The exact set and collector number |
| Finish | Regular, Foil or Etched | Regular, or Foil when Add as foil is on | Set by Add as foil, Copy details, or an import's Foil column |
| Condition | Mint, Near mint, Lightly played, Moderately played, Heavily played or Damaged | Near mint | Set by Copy details or an import's Condition column |
| Language | English and the other languages cards are printed in | English | Set by Copy details or an import's Language column |
| Count | Whole number from 1 to 10,000 | 1 | A count that would drop below 1 removes the entry |
| For trade | Whole number from 0 to the count | 0 | How many of the copies are on your trade list. Proxies are never for trade |
| Proxy | Yes or no | No | A proxy is a printed stand-in card. It is kept in its own row, marked PROXY everywhere, has no value, and does not count toward set completion, collection value or statistics. It can fill a deck card |
| Purchase price | Number, 0 or more | Empty | What you paid for one copy |
| Purchase currency | Three letter code | USD with a price | The currency of the purchase price |
| Date added | Date | The day the row was first added | Set by imports that carry it |
| Misprint, Altered, Signed | Yes or no | No | Marks for special copies |
| Decks | List | None | The decks the row's copies fill; see [Decks](/about/decks) |

Rows that are not regular, near mint or English show the difference after the set, for example "Foil, Lightly played, Japanese".

## Copy details

**Copy details...** (E, the details button on a row, the right-click menu, or a double-click in the binder) changes the selected row's Finish, Condition, Language, Proxy, For trade, Purchase price, Purchase currency, Date added, Misprint, Altered and Signed. All copies in the row change together. When another row already has the new finish, condition, language and proxy, the two rows are merged and their counts and numbers for trade are added together. Copies linked to decks stay linked. A change can be undone.

| Message | Cause |
|---|---|
| Enter a number for trade from 0 to N | For trade is not a whole number, or is more than the row's count |
| Enter a purchase price of 0 or more | The purchase price is not a number |
| Enter a three letter currency such as USD | The currency is not three letters |
| Enter the date added as a date, such as 2026-08-10 | The date is not a date |
| Select a row in the collection first | Copy details with no row selected |
| Card name changed | The change was saved |

## Change printing

**Change printing...** in an entry's right-click menu changes the printing of its copies, for a card that was added as the wrong printing, or their finish, such as switching to the foil version. Choose the printing and finish in the printing chooser. With more than one copy, **How many to change** (all by default) changes only that many; the rest stay, so two copies can become one regular and one foil. The copies keep their count, condition, language, proxy mark, number for trade and copy details. When the collection already has a row of the new printing with the same finish, condition, language and proxy, the rows are merged. Free copies change first. When copies linked to a deck change, Mana Vault asks "A copy that changes is in deck name. Change the deck too?":

| Answer | What happens |
|---|---|
| **Yes, change the deck** | The copies stay linked and the deck cards they fill change to the new printing and finish too |
| **No, show it as missing** | Only the copies change. The deck keeps its version, those deck cards show **Missing** and **Other version owned**, and the message ends with "decks kept their version" |
| Cancel | Nothing changes |

The change can be undone (undo changes the copies back; deck links removed by No are not put back), and the message reads "Card name is now (SET) number", followed by "foil" or "etched" for those finishes, or "N of M Card name changed to (SET) number" when only some copies change.

## The collection view

Press **2** (or the **Collection** tab) to open it. The header holds:

| Item | Use |
|---|---|
| Collection switcher | The button with the collection's name. It opens a list of your collections with their card counts and values, with All collections first (see below) |
| Cards, Completion, Missing, Statistics, Notes | The tabs; see [Set completion](/about/set-completion) for Completion and Missing (shown only with a completion rule), [Prices and statistics](/about/prices-and-statistics) for Statistics, and [Notes and the Wiki](/about/notes-and-the-wiki) for Notes (not on All collections) |
| Wishlist | Shown when the collection is a wishlist |
| Shared by name, or Shared with names | Shown for shared collections |
| Filter box | Keeps the rows whose card name, set name, set code or collection name contains the text (Cards tab). The Filters panel also filters the rows (Filtering: Collection) |
| Options | Sort, layout, card size, deck and trade filters and picking (Cards tab, see below). An amber number shows how many of its filters are on |
| + Add | Makes the open collection the target collection and goes to the card search, so the cards you add go here (not in All collections) |
| Count | Cards and unique rows in the collection and its value (wanted value for a wishlist), such as "1,122 cards (314 unique), $390.32". While a filter hides rows, it adds "showing N of M" |

### The collection switcher

The switcher lists every collection, including those shared with you, with a Wishlist or Shared badge. Type to find a collection by name; Up and Down move through the list, Enter opens the highlighted collection and Esc closes the list. One click on a collection makes it where new cards go and keeps the list open (it is marked Adding here); a double click opens it. All collections opens with one click. **Sort** orders the list by Recently opened, Name, Date created, Card count or Value, and is kept for your account. **New collection...** is at the bottom of the list. On a phone the list opens as a full sheet. Opening a collection closes the About guide.

### All collections

**All collections** is always the first entry of the switcher. It lists every row of every collection you own or that is shared with you, each with a badge naming its collection, and its count line adds up every collection. Wishlists are left out unless **Include wishlists** is on in Options (kept for your account). It has the Cards tab only.

Everything done to a row acts on the row's own collection: counts, Copy details, Remove, Move, marking for trade, and picking several rows across collections (a bulk remove or move is one step for every collection involved, and can be undone).

### Options

| Item | Use |
|---|---|
| Group | For the List layout: Type, SubType, Rarity, Color, Color Identity, Mana Value, Set, Artist or No grouping; see [List views](/about/screen-layout#list-views). Kept for your account |
| Sort | Name, Mana Value, Price, highest first, Price, lowest first, Rarity, Color, Quantity, or Set and number. Kept for your account |
| Layout | Grid, Binder or List (see Card layouts) |
| Card size | Small, Medium or Large, for the Grid layout. Kept for your account |
| Decks | **In decks or not**, **In a deck** (rows whose copies fill a deck) or **Not in a deck** |
| For trade only | Keeps only rows with copies for trade |
| Include wishlists | All collections only: also lists the rows of wishlists |
| Select several cards | Turns on checkboxes for picking rows by tap or click |
| Done | Closes Options |

Above the cards, a tag shows each active filter, with **×** to remove it, and **Clear tags** when there are two or more.

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
| In a deck, Not in a deck | Row's copies fill a deck, or fill none |

Tags, the filter box and the Filters panel's collection filters stay when you open another collection.

## Card layouts

The Cards tab shows the rows in the current sort and filter in one of three layouts. Each layout is kept for your account, separately for the desktop and the phone. New accounts start with Grid. Change it in **Options**, or with **B**, which switches between Binder and Grid.

| Layout | Shows |
|---|---|
| Grid | Card pictures that fill the width of the work area, as many in a row as fit (on a phone, 4, 3 or 2 in a row for Small, Medium and Large). More cards appear as you scroll, with no pages |
| Binder | Pages of nine printings in three rows, like a binder sheet, as large as the work area allows |
| List | One row per entry, as described below |

In Grid and Binder each printing has one picture, with a pip bar under it that holds every pip, so nothing covers the card: the count (such as 2x), FOIL or ETCHED (special foils by name, such as SURGE FOIL), the condition and language when not near mint English (such as LP and JA), Proxy, a T badge with the number for trade, **Printing removed** when Scryfall removed the printing (a click opens Change printing...), and the price when Prices on pictures is on. Where each of these sits around the picture is set in **View, Card layout...** (see [Screen layout](/about/screen-layout)). When the printing is held as more than one kind of copy (such as regular and foil), a line for each sits under the picture with its pips (REGULAR, FOIL, ETCHED and the others) and its count. Pictures show no prices; the List layout has them.

Click a picture or line to select it, Ctrl+click or Shift+click to pick several, double-click to open Copy details, and right-click (or long press on a phone) for its menu. Clicking a picture with lines selects the first line; right-clicking it opens the first line's menu. All collections uses the same layout. The List layout keeps one row per entry.

In the Binder, **First**, **Previous page**, **Next page** and **Last**, or Page Up and Page Down, turn the pages. Type a page number in the page box and press Enter to go to that page.

## List layout

In the List layout, each entry shows the card image, name, a FOIL or ETCHED badge, a PROXY badge, a FOR TRADE badge with the number for trade, set, set code, collector number, rarity, the condition and language when not near mint English, a green tag for each deck its copies fill (with ×N for more than one; clicking it opens the deck), the row's value (Proxy for proxies), the count with minus and plus buttons, and details, move and remove buttons. Copies in no deck are free.

## Picking several cards

| To | Do |
|---|---|
| Pick one card | Click it, or move to it with Up and Down |
| Add or remove a card from the picked cards | Ctrl+click it (Cmd+click on a Mac), or tap it with **Select several cards** turned on |
| Pick a range | Click the first card, then Shift+click the last |
| Pick every card the filter box shows | Ctrl+A, **Select all cards**, or **Select all** in the picked bar |
| Drop the picked cards | Esc, or **Done** in the picked bar |

When more than one card is picked (or Select several cards is on), a bar above the list shows how many entries and cards are picked, with **Select all**, **Move...**, **For trade**, **Not for trade**, **Reduce to 1**, **Remove...** and **Done**. For trade and Not for trade work like Mark for trade and Unmark for trade; see [Wishlists and trading](/about/wishlists-and-trading). The status bar also shows the number picked.

## Removing cards

- Minus at a count of 1 removes that entry at once.
- The remove button on an entry, or **Remove** in its right-click menu, removes an entry with one copy at once. With more copies it asks **How many to remove** ("There are N copies."), with **Reduce to 1** and **Remove all**. Copies in no deck are removed first.
- **Reduce to 1** (right-click menu of an entry with more than one copy, or the picked bar) leaves one copy of each picked entry, for copies added by accident. It is one step that can be undone. With every picked entry at one copy it says "Each picked card has one copy already".
- **Remove selected...** (Delete key, or **Remove...** in the picked bar) asks first, for example "Remove 37 entries (112 cards) from Binder?", with **Remove all** (every picked entry goes) and **Reduce to 1**.
- To remove many cards of one kind, type in the filter box (for example a set name), press Ctrl+A, then Delete.

## Moving cards

- The move button on a row opens **Move**: choose the collection to move to and, when the entry has more than one copy, how many copies to move.
- **Move selected...** (**Move...** in the picked bar or the right-click menu) moves every copy of each picked entry to the chosen collection.
- Moved copies are added to the other collection's counts, in a row with the same finish, condition and language. A move needs at least two collections.
- Copies marked for trade stay behind while enough copies are left; the rest of the marks move with the copies.
- Copies in no deck move first. When more copies move than are free, the deck links move with them, so the decks keep their cards.
- Removing copies that fill a deck makes those deck cards missing.

## Owned counts

The Card panel's Owned group shows, for the selected printing, the regular, foil and etched copies across all your collections (proxies are not counted as owned), the copies of every printing of the same card, and a line for each collection that holds the card, with the number for trade. A collection that holds only other printings of the card shows "Other printings only". Wishlists are not counted; each wishlist that holds the card has its own "Wanted" line.

## Collections panel

The Collections panel lists your collections, including those shared with you, with the number of cards, their value and, for collections linked to sets, a completion bar and percentage. One click on a collection opens it in the collection view and makes it where new cards go; it is highlighted until a deck is selected. The collection cards go to shows **Adding here** while it is selected. Right-click or long press a collection for its menu (see [Screen layout](/about/screen-layout)). A **Shared** badge marks collections shared with or by you, and a **Wishlist** badge marks wishlists.

## Undo

Adding cards, changing counts, removing entries (one or many), moving cards, Copy details, trade marks and adding to the wishlist can be undone with Ctrl+Z and redone with Ctrl+Y. A bulk remove or move undoes as one step. Creating, changing and deleting collections cannot be undone.
