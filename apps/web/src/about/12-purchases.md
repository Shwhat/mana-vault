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

The header holds **New entry...** (it asks for the kind: Purchase, Card sale, Product sale or Trade), **Make purchases from imported prices...** and **Export...**. While an opening is where pulled cards go, the header shows it as **Opening: name**.

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
| Bought from, Sold to or on, Traded with | Text, up to 120 characters | No | Empty | Places used before are offered while typing |
| Currency | USD or EUR | Yes | The currency chosen in the View menu | Prices of cards for Value now are read in this currency |
| Note | Text, up to 1000 characters | No | Empty | Shown in the history and found by the find box |

Amounts are what you type; Mana Vault does not change them. Every amount is 0 or more.

## Purchases

A purchase has one line per product.

| Field | Choices | Notes |
|---|---|---|
| Product | Play booster, Draft booster, Set booster, Collector booster, Jumpstart booster, Other booster, Booster box, Bundle, Commander deck, Starter or other deck, Prerelease kit, Secret Lair, Single cards, Other | Other needs a product name |
| Set | A set code (a Scryfall set or a custom set), or none | The set's symbol shows beside a code it knows |
| Quantity | Whole number from 1 to 10000 | A line cannot go below what is opened or sold |
| Cost each, Total | Amounts | Typing either one fills the other |
| Packs in it | Whole number from 0 to 1000 | Filled for common products: Booster box 36, Bundle 9, Prerelease kit 6, a booster 1; can be changed for boxes, bundles, kits, Secret Lairs and Other |
| Tax, Shipping | Amounts for the whole purchase | Spread over the lines by cost |

**Add product** adds a line; **Add single card** adds a Single cards line with the card name (names are suggested), finish, condition and the collection it goes to. Saving puts single cards into that collection as copies with their purchase price, tied to the purchase. The newest printing of the name is used; type a set code on the line to choose the set.

### Full cost

Tax and shipping are spread over the lines by cost, so each line has a full cost:

Full cost of a line = its total + (tax + shipping) × its total ÷ the total of all lines

Example: 6 Play boosters for 30.00 and a Bundle for 10.00, with 3.00 tax and 1.00 shipping. The lines total 40.00, so the boosters carry 4.00 × 30 ÷ 40 = 3.00 and cost 33.00 in full, and the Bundle carries 1.00 and costs 11.00. The purchase is 44.00.

## Opening product

A product line is sealed until it is opened.

1. On the entry page, **Open...** on a line asks how many to open (for example 3 of 6 packs, or 1 box) and the collection the pulled cards go to.
2. The opened part becomes an **opening**, named like "3 Play boosters, Foundations (Purchase of Nov 20)". It becomes where pulled cards are tied, and its collection becomes where new cards go.
3. While the opening is active, every card added to that collection is tied to it: from card search, Quick add, the scanner, pasted lists, imports and count changes. The status bar shows **OPENING: name**. Lowering a count (or undoing an add) unties the copies taken away.
4. **Done opening** (on the entry page, or a click on OPENING in the status bar) ends it. **Continue opening** makes it active again, so a box of 36 packs can be recorded over several days.

Only one opening is active at a time; opening another ends the one before. **Untie** on a card of an opening takes it off the purchase; the copy stays in the collection.

Each opening shows its card count, the value pulled (the cards tied to it at today's price) and the value per pack (the value pulled ÷ the packs opened, where packs opened is the count opened × Packs in it, or the count when Packs in it is 0).

## Sealed product kept

Sealed lines count at their full cost until a value is entered. **Set current value...** on a sealed line records what each is worth today; each value is kept with its date, so the chart follows it over time, and the entry page shows the date of the value in use. Opening or selling part of a line moves that part out of the sealed value.

## Sales

- **Card sale**: **New entry...** with Card sale, **Sell selected cards...** (File menu, with cards picked in a collection) or **Sell...** in a collection card's right-click menu. Find copies by name, then set the count and the price each (filled with today's price). Fees and shipping are taken from the money in. Saving removes the sold copies from their collections, and keeps each copy's record in the sale with the purchase it came from.
- **Product sale**: choose sealed lines from your purchases with the count sold and the sale price. The sold part leaves the sealed value of its purchase.

Deleting a sale puts sold copies back in their collections and sold product back to sealed.

## Trades

Completing a trade in the Trade view, or accepting one from another account, records a Trade entry for each account: the cards given at the prices in the trade (a line without a price uses the card's price that day), and the cards got, tied to the entry. Undo of a completed trade removes the entry. **Edit...** on a trade sets the cash each side added. **New entry...** with Trade records a trade by hand, with its cash only.

## Imported purchase prices

Imports that carry a purchase price per card (ManaBox files, for example) can become purchases, so past spending counts from the start.

- When importing a collection file with prices, the Import window asks: **One purchase for this import**, **One purchase per date added** (grouped by the date added in the file), or **Do not record a purchase** (the prices stay in Copy details only).
- **Make purchases from imported prices...** in Purchases does the same for copies that have a purchase price but no purchase: **One purchase for these copies** or **One purchase per date added**.
- Each card becomes a Single cards line at its price, tied to the copy. The place is the import's format, such as "ManaBox import", or "Imported prices".

## Value and gain

| Figure | Rule |
|---|---|
| Spent | Purchases with tax and shipping, plus cash you added to trades |
| Received | Sales after fees and shipping, plus cash added to trades for you |
| Value now | Tied cards still owned at today's price for their finish, plus sealed lines at their current value |
| Gain or loss | Received + Value now - Spent |

- A tied card counts while its copy is still in the collection it went to. When several purchases tied the same copy, the oldest purchase keeps the copies first.
- Proxies and cards without a price count as 0; the Value now tile counts the cards without a price.
- The summary counts the entries in the currency chosen in the View menu, for the period chosen; entries in the other currency are counted in a note under the history.
- Per purchase, the entry page shows its cost, the value of its pulls and sealed product still held, what its pulls and products sold for, and its gain or loss (value now + sold for - cost).

Worked example: the purchase above (44.00). Three of the six boosters are opened and pull cards worth 8.00 today; one of those cards, worth 1.00, is later sold for 2.50. The other three boosters are still sealed at their full cost of 16.50 and the Bundle at 11.00. Value now is 7.00 + 16.50 + 11.00 = 34.50, sold for is 2.50, so the purchase's gain or loss is 34.50 + 2.50 - 44.00 = -7.00. Over the whole history, Spent is 44.00, Received 2.50 and Gain or loss -7.00.

## The chart

The chart shows two lines on one axis: Spent (blue) and Value of what it bought (orange), from the first entry to today, up to about 60 points. The value line uses the price history saved since 0.12.0, so it goes back as far as prices were recorded; each date counts the cards tied by then and not yet sold, and sealed lines at the value in use on that date. Pointing at the chart shows the date with both figures; **Show table** lists them. Cards without a price count as 0 and are counted in a note under the chart.

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

**Export purchase history...** (File menu) and **Export...** in Purchases write CSV files: **Entries** (date, kind, place, description, note, money out, money in, value now, gain or loss, currency) or **Lines** (each product line and each card or product sold or given).

## Android app

Purchases works online. Without a connection, the history and the summary show from the last copy kept on the phone, and changes need a connection, like trades.

## Messages

| Message | Cause |
|---|---|
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
