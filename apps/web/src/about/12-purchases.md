# Purchases

Purchases records everything bought, sold and traded, and shows the gain or loss over time: what the product cost, what the cards pulled from it are worth today, what was sold, and what was traded. Each account has its own history; it is not shared or sent.

## Opening Purchases

- **Purchases** is a mode tab after Proxies (key **6**), and **Purchases view** is in the View menu.
- On a phone, **Purchases** is a button on the Home screen and an item in the Menu's View section. The bottom bar stays as it is.

The view has two tabs and an entry page:

| Part | Shows |
|---|---|
| Summary | The period (All time, This year, Last 12 months, Last 30 days), the tiles Spent, Received, Value now and Gain or loss, and the chart of money spent and the value of what it bought |
| History | Every entry, newest first, with its date, kind, description, place, money out, money in, value now and gain or loss |
| Entry | One entry, opened from the history with a click or Enter: its figures, products, openings, cards and sales, with Edit... and Delete... |

The tables on the entry page and the history are grids: every cell is bordered, the heading row stays in view while scrolling, text columns are left aligned and numbers right aligned, and alternate rows are shaded. A table wider than the page scrolls sideways inside its own frame.

| Table | Columns |
|---|---|
| Products | Product, Set, Quantity, Full cost, State (sealed, opened and sold counts; for a single card, where it is now), Value each (sealed value with its date, cost, or for a single card its price when added), buttons |
| Cards from this purchase (Cards got on a trade) | Card, Finish, Set, Count, Still held, Value when pulled (Value when added for single cards and trades), Trade price (trades), Price now, State, Remove from pack... |
| Sold (Cards given on a trade) | Card or Product, Count, Price or Trade value, Original cost (trades), From |

State is **In collection**, **Sold**, **Traded** or **Gone** (deleted from the collection), or a mix such as "1 in collection, 1 gone". Rows of cards no longer held are shown in a lighter color. Changes made on another device show at once.

The header holds **New entry...** (it asks for the kind: Purchase, Card sale, Product sale or Trade), **Make purchases from imported prices...**, **Read receipt...**, **Places...** and **Export...**. While an opening is where pulled cards go, the header shows it as a chip, **Opening: name**; a click on the chip opens its entry.

## Entry kinds

| Kind | Money | What it records |
|---|---|---|
| Purchase | Out | Products and single cards bought, from a store, a website or a person |
| Card sale | In | Copies from collections sold |
| Product sale | In | Sealed product sold |
| Trade | In and out | A completed trade: the cards given with their trade price, the cards got, and any cash added |

Each kind shows as a badge in the history, so the history can be filtered by it.

### Fields every entry has

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Date | Calendar date | Yes | Today | Orders the history and places the entry on the chart |
| Bought from, Sold to or on, Traded with | A place, up to 120 characters | No | Empty | Places on the server are offered while typing. A name that is not in the list is added as a new place when the entry is saved (shown as **New place** beside the field) |
| Note | Text, up to 1000 characters | No | Empty | Shown in the history and found by the find box |

Amounts are what you type; Mana Vault does not change them. Every amount is 0 or more.

## Purchases

A purchase has one line per product.

| Field | Choices | Notes |
|---|---|---|
| Product | Play booster, Draft booster, Set booster, Collector booster, Jumpstart booster, Other booster, Booster box, Bundle, Commander deck, Starter or other deck, Prerelease kit, Secret Lair, Single cards, Other | Other needs a product name |
| Set | A set from a searchable list, or No set | Each set shows its symbol, name, code in capitals and year. Type to find a set by name or code |
| Quantity | Whole number from 1 to 10000 | A line cannot go below what is opened or sold |
| Cost each, Total | Amounts | Typing either one fills the other |
| Packs in it | Whole number from 0 to 1000 | Filled for common products: Booster box 36, Bundle 9, Prerelease kit 6, a booster 1; can be changed for boxes, bundles, kits, Secret Lairs and Other |
| Tax, Shipping | Amounts for the whole purchase | Spread over the lines by cost |

A new purchase starts with no lines. **Add product** adds a product line.

### Single cards

Single cards are chosen, never typed. The Single cards table has one row per card with its printing, finish, condition, language, collection, quantity, cost each and total. There are three ways to add them:

| Button | What it does |
|---|---|
| Find cards | Card search with pictures. A click on a card shows its printings (extended art, showcase, borderless and every other printing) with their pictures; choosing one adds it |
| Scan | Opens the scanner with **This purchase** as the target. Every card scanned is added to the purchase; closing the scanner returns to the purchase window with what was typed kept |
| From scanned list... | The cards in the scanned list, with check boxes. The cards ticked are added and taken off the scanned list |

Adding the same printing and finish again raises its quantity. Saving puts single cards into their collection as copies with their purchase price, tied to the purchase.

### Receipts

A purchase can be read from a receipt: a photo, a PDF or a screenshot.

- **Read receipt...** in the Purchases header, or in the purchase window, chooses the file. On the Android app, the camera can take the photo, and a picture or PDF shared into the app offers **Read receipt**.
- The date, the place, product lines (with set codes when the receipt names a set), single cards, tax and shipping that can be read are filled in the purchase window to check before saving. The status bar says how many lines were read, or "No product lines found".
- PDFs and pictures are read by the server. On the Android app, camera photos are read on the phone, and the server reads the rest.
- The receipt is kept with the entry. The entry page has a **Receipt** section with **View**, **Replace** and **Remove**. A receipt can be added to any saved entry the same way. Replacing or removing a receipt can be undone.
- Receipts are files up to 20 MB, kept on the server with the account's data.

### Full cost

Tax and shipping are spread over the lines by cost, so each line has a full cost:

Full cost of a line = its total + (tax + shipping) × its total ÷ the total of all lines

Example: 6 Play boosters for 30.00 and a Bundle for 10.00, with 3.00 tax and 1.00 shipping. The lines total 40.00, so the boosters carry 4.00 × 30 ÷ 40 = 3.00 and cost 33.00 in full, and the Bundle carries 1.00 and costs 11.00. The purchase is 44.00.

## Opening product

A product line is sealed until it is opened.

1. On the entry page, **Open...** on a line asks how many to open (for example 3 of 6 packs, or 1 box) and the collection the pulled cards go to.
2. The opened part becomes an **opening**, named like "3 Play boosters, Foundations (Purchase of Nov 20)". It becomes where pulled cards are tied, and its collection becomes where new cards go.
3. While the opening is active, every card added to that collection is tied to it: from card search, Quick add, the scanner, pasted lists, imports and count changes. The status bar shows **OPENING: name**, and ADDING TO names the opening. A pulled card stays on its pack for good: removing it from the collection, moving it, changing its printing, selling it or trading it never takes it off the pack. Only **Remove from pack...** on the entry page does, and an undo of adding the card (the card was added by mistake).
4. The opening on the entry page has buttons to fill it:

| Button | What it does |
|---|---|
| Add cards | Opens card search with the opening as the target |
| Scan | Opens the scanner; cards scanned go into the opening's collection, tied to it |
| Add existing copies... | Copies already in collections, with a find box and a count; the copies chosen are tied to the opening |
| Done opening | Ends the opening |

5. A click on **OPENING** in the status bar, or on the opening chip in the Purchases header, opens the entry. **Continue opening** makes an ended opening active again, so a box of 36 packs can be recorded over several days.

Only one opening is active at a time; opening another ends the one before. An opening started on one device is the opening on every device: the phone's scanner shows **Scanning into: name** and fills it in as where scanned cards go (see [Scanning cards](/about/scanning-cards)), and ending it on one device ends it on all of them.

### Removing a card from its pack

**Remove from pack...** on a card of an opening (or **Remove from purchase...** on a single card bought) asks each time:

| Choice | What happens |
|---|---|
| Remove from pack, keep the card | The card leaves the pack's list and stays in the collection |
| Remove from pack and delete the card | The card leaves the pack's list and its copies still in the collection are deleted (shown only while copies are held) |

Both can be undone; undo puts the card back on the pack with its date and its Value when pulled.

Removing a copy from a collection when it came from a pack or purchase says so in the question, for example "1 card came from 3 Play boosters, Foundations (Purchase of Nov 20). It stays listed on that pack."

### Opening figures

Each opening shows its card count, how many of its cards are gone, the value per pack, and three values:

| Figure | Rule |
|---|---|
| Value when pulled | Every card pulled at its price for its finish on the day it was added to the pack. It never changes after that day. A card with no price that day counts as 0 |
| Pulled value | Every card pulled at today's price for its finish, held or not |
| Value now | Only the pulled cards still held, at today's price for their finish |

The value per pack is the pulled value ÷ the packs opened (the count opened × Packs in it, or the count when Packs in it is 0). Gain or loss uses Value now, so cards no longer held do not count as owned.

Worked example: a pack pulls 2 copies of a card worth 2.00 that day. Value when pulled is 4.00. The price rises to 5.00 and one copy is deleted from the collection: Pulled value is 10.00, Value now is 5.00, and Value when pulled stays 4.00.

## Sealed product kept

Sealed lines count at their full cost until a value is entered. **Set current value...** on a sealed line records what each is worth today; each value is kept with its date, so the chart follows it over time, and the entry page shows the date of the value in use. Opening or selling part of a line moves that part out of the sealed value.

## Sales

- **Card sale**: **New entry...** with Card sale, **Sell selected cards...** (File menu, with cards picked in a collection) or **Sell...** in a collection card's right-click menu. Find copies by name, then set the count and the price each (filled with today's price). Fees are always taken from the money in. Saving removes the sold copies from their collections, and keeps each copy's record in the sale with the purchase it came from.
- **Product sale**: choose sealed lines from your purchases with the count sold and the sale price. The sold part leaves the sealed value of its purchase.

### Shipping on sales

Each sale says who paid the shipping, chosen per entry with **Who paid shipping**:

| Choice | Default | Effect |
|---|---|---|
| Buyer paid shipping | Yes | The shipping is recorded but does not count as money in or out |
| I paid shipping | No | The shipping is taken from the money in, like the fees |

Example: a card sold for 4.00 with 0.50 fees and 1.00 shipping. With Buyer paid shipping, Received is 3.50. With I paid shipping, Received is 2.50.

Deleting a sale puts sold copies back in their collections and sold product back to sealed.

## Trades

Completing a trade in the Trade view, or accepting one from another account, records a Trade entry for each account: the cards given at the prices in the trade (a line without a price uses the card's price that day), and the cards got, tied to the entry. Undo of a completed trade removes the entry. **Edit...** on a trade sets the cash each side added.

A Trade entry page shows four tiles:

| Tile | Rule |
|---|---|
| Gave | The trade value of the cards given, plus cash you added |
| Got | The trade value of the cards got, plus cash added for you |
| Net | Got - Gave |
| Original cost | What the cards given first cost: each card's share of the purchase it came from. Cards with no recorded cost count at their trade value, and are named under the tile |

The cards given list each card with a **From** column naming the purchase it came from, or "No purchase". **New entry...** with Trade records a trade by hand, with its cash only.

## Imported purchase prices

Imports that carry a purchase price per card (ManaBox files, for example) can become purchases, so past spending counts from the start.

- When importing a collection file with prices, the Import window asks: **One purchase for this import**, **One purchase per date added** (grouped by the date added in the file), or **Do not record a purchase** (the prices stay in Copy details only).
- **Make purchases from imported prices...** in Purchases does the same for copies that have a purchase price but no purchase: **One purchase for these copies** or **One purchase per date added**.
- Each card becomes a Single cards line at its price, tied to the copy. The place is the import's format, such as "ManaBox import", or "Imported prices".

## Value and gain

| Figure | Rule |
|---|---|
| Spent | Purchases with tax and shipping, plus cash you added to trades |
| Received | Sales after fees (and after shipping when I paid shipping), plus cash added to trades for you |
| Value now | Tied cards still owned at today's price for their finish, plus sealed lines at their current value |
| Gain or loss | Received + Value now - Spent |

- A tied card counts in Value now while its copy is still owned; a deleted copy stays listed on its pack as Gone. When copies move to another collection, or become another printing, their ties move with them. When several purchases tied the same copy, the oldest purchase keeps the copies first.
- Proxies and cards without a price count as 0; the Value now tile counts the cards without a price.
- The summary counts the entries for the period chosen. All amounts are in US dollars.
- Per purchase, the entry page shows its cost, the value of its pulls and sealed product still held, what its pulls and products sold for, and its gain or loss (value now + sold for - cost).

Worked example: the purchase above (44.00). Three of the six boosters are opened and pull cards worth 8.00 today; one of those cards, worth 1.00, is later sold for 2.50. The other three boosters are still sealed at their full cost of 16.50 and the Bundle at 11.00. Value now is 7.00 + 16.50 + 11.00 = 34.50, sold for is 2.50, so the purchase's gain or loss is 34.50 + 2.50 - 44.00 = -7.00. Over the whole history, Spent is 44.00, Received 2.50 and Gain or loss -7.00.

## The chart

The chart shows two lines on one axis: Spent (blue) and Value of what it bought (orange), from the first entry to today, up to about 60 points. The value line uses the price history saved since 0.12.0, so it goes back as far as prices were recorded; each date counts the cards tied by then and not yet sold, and sealed lines at the value in use on that date. Pointing at the chart shows the date with both figures; **Show table** lists them. Cards without a price count as 0 and are counted in a note under the chart.

## Places

Places (stores, websites and people) are shared by every account on the server. Each entry stores its place, so renaming a place changes it on every entry that uses it.

**Places...** in the Purchases header opens the list of places with the number of entries using each.

| Action | Who | What it does |
|---|---|---|
| Add place | Any account | Type a name in the find box, then Add place. The new place opens for editing |
| Edit | Any account | Changes the name, the kind (Store, Website, Person, Other) and a note |
| Merge into... | Admins | Moves every entry of the place to another place and removes it. Undo puts it back |
| Delete | Admins | Removes a place no entry uses |

## History

| Control | What it does |
|---|---|
| Find | Entries whose description, place, kind or note holds the words |
| Kind | Every kind, or one kind |
| Product | Entries with a line of that product |
| Set | Entries with a line of that set code |
| From, To | Entries dated in the range |
| Sort | Newest first, Oldest first, Gain first, Loss first, Most money out |

A click or Enter opens an entry; the right-click menu has **Open**.

## Undo

Saving, editing and deleting entries, **Open...**, **Set current value...**, **Untie**, card sales and **Make purchases from imported prices...** can be undone (Edit, Undo). Undo of Open... removes the opening and the ties of its cards; the cards stay in the collection. Redo of Open... and Untie asks you to do them again from the entry.

## Export

**Export purchase history...** (File menu) and **Export...** in Purchases write CSV files: **Entries** (date, kind, place, description, note, money out, money in, value now, gain or loss) or **Lines** (each product line and each card or product sold or given).

## Android app

Purchases works online. Without a connection, the history and the summary show from the last copy kept on the phone, and changes need a connection, like trades.

## Messages

| Message | Cause |
|---|---|
| Enter the name of the place | A place without a name |
| Name is already in the list of places | Adding a place that exists |
| Name is already in the list of places. Merge the two places instead. | Renaming a place to the name of another |
| That place is not in the list of places | The place was merged or deleted |
| Only an admin can merge or delete places | Merge or Delete by an account that is not an admin |
| Choose two different places to merge | Merging a place into itself |
| Name is used by N entries. Merge it into another place first. | Deleting a place in use |
| That place cannot be put back | Undo of a merge that cannot be done |
| Choose a PDF or a picture of the receipt | A receipt that is not a PDF or a picture |
| This entry has no receipt | Viewing a receipt that was removed |
| The receipt could not be read. Enter the purchase by hand. | Read receipt... could not read the file |
| N lines read, or No product lines found | Read receipt... |
| Receipt kept with the purchase of date | A receipt added to a saved entry |
| Card added to the purchase | Find cards, Scan or From scanned list... |
| N cards tied to the opening | Add existing copies... |
| Adding to name | Add cards on an opening |
| Choose Purchase, Card sale, Product sale or Trade | An entry of an unknown kind |
| Enter the date as a calendar date | The date is empty or not a date |
| Amounts must be 0 or more | A negative or unreadable amount |
| Add at least one product | A purchase without lines |
| Choose a product for every line | A line without a product |
| Name the product of every Other line | An Other line without a name |
| Quantities are whole numbers from 1 to 10000 | A quantity out of range |
| Packs in it is a whole number from 0 to 1000 | Packs in it out of range |
| Type the card name of every Single cards line | A Single cards line without a card |
| Choose the card, its finish and the collection for every Single cards line | A Single cards line without a card or collection |
| Choose one of your collections for the single cards | The collection is a wishlist or not yours |
| Name: N are opened or sold | A line lowered below what is opened or sold |
| Name has openings or sales and cannot be removed | Removing a line that was opened or sold |
| Single cards are added as a new purchase | Adding a Single cards line to a saved purchase |
| Choose the copies sold | A card sale without copies |
| Each copy sold needs its collection, a count and a price | A sale line that is not complete |
| Name: only N of M copies are in the collection | Selling more copies than the collection holds |
| Choose the sealed product sold | A product sale without lines |
| Name: only N still sealed | Selling more than is still sealed |
| Open from 1 to N | Opening more than is sealed |
| Choose the collection the pulled cards go to | Open... without a collection |
| Choose a product line to open | Open... on a Single cards line |
| That entry is not in your purchase history | The entry was deleted, or belongs to another account |
| That entry cannot be put back, or That entry is already in your purchase history | Undo of a delete that cannot be done |
| Choose One purchase or One purchase per date added | Make purchases from imported prices without a choice |
| Purchase of date saved, Card sale of date saved: N cards removed from collections, Product sale of date saved | Saving an entry |
| Opening name: cards added to collection are tied to it | Open... |
| Done opening | Ending an opening |
| Name valued at amount each | Set current value... |
| N purchases made from imported prices | Make purchases from imported prices... |
| Purchase history exported, Purchase lines exported | Export |
