# Wishlists and trading

A wishlist holds the cards you want. The trade list holds the copies you are willing to trade, and the trade calculator compares what you give with what you get.

## Wishlists

A wishlist is a collection with **Wishlist** ticked in its settings. It works like any collection (adding, counts, copy details, moving, sending, set completion), with these differences:

- Its cards are wanted, not owned. They do not count in the Card panel's Owned group, in the deck ownership check, or in your trade list.
- The Card panel lists each wishlist that holds the card as "Wanted: N copies (wishlist)".
- Its value is shown as the wanted value.
- A **Wishlist** badge marks it in the Collections panel and the collection view header.

**Wishlist** can be ticked or cleared at any time in **Collection settings...**; the cards stay where they are.

### Adding to a wishlist

| From | Command |
|---|---|
| A selected card | **Add to wishlist** (W, Home ribbon tab, Card panel, card page), or **+ Wishlist** on a search result. Adds one copy, foil when Add as foil is on |
| The Missing tab of a collection linked to sets | **Add missing cards to wishlist** (Collection ribbon tab), or **Add all to wishlist** above the list. Adds one copy of every missing card, foil where foil is missing |
| A deck | **Add missing deck cards to wishlist** (Decks ribbon tab), **Add missing to wishlist** on the Ownership tab, or **+ Wishlist** on a missing deck card. Adds the missing number of copies of each card |

These commands use your first wishlist. When you have none, a wishlist named **Wishlist** is created. Copies already on the wishlist are added to. Each command undoes as one step, for example "Undo Add missing cards of Blue deck to Wishlist".

### Wants go down as cards arrive

The count of a wishlist row is the number of copies wanted. Adding copies of a card to a collection (Add to collection, the scanner's Add to, and Add as proxy excepted) lowers the wishlist rows of the same card, in any printing, by one per copy added:

- The row added to a wishlist first is lowered first, across all your wishlists.
- A row lowered to zero is removed.
- Proxies lower nothing, and imports and moves lower nothing.
- Undo of the add puts the wants back.

Example: Wants holds 2 Lightning Bolt (added first) and More wants holds 1. Adding 3 Lightning Bolt to Main collection empties both.

## The trade list

Any copy in a collection you own can be marked for trade, except proxies. The number for trade is kept per row and is never more than the row's count.

| To | Do |
|---|---|
| Mark every copy of the picked rows | **Mark for trade** (Collection ribbon tab, For trade button), **For trade** in the picked bar, or the right-click menu |
| Clear the marks of the picked rows | **Unmark for trade**, or **Not for trade** in the picked bar |
| Mark some copies of one row | **Copy details...** (E), field For trade |
| Show only rows with copies for trade | **For trade only** above the collection's rows |

A row with copies for trade shows a FOR TRADE badge with the number. Lowering a row's count lowers its number for trade with it. When copies move to another collection, copies marked for trade stay behind while there are enough copies left; otherwise the marks move with them. Marks can be undone.

The **trade list** on the left of the trade view lists every row marked for trade in the collections you own, with the number for trade of the row's count, its price, and the collection it is in. Wishlists and collections shared with you by others are not listed. The box above it finds a card, and the bar shows the number of cards and their value.

## The trade view

Press **4**, or choose **Trade view** (Views group of the Home ribbon tab), to open the trade view: the trade list on the left and the trade calculator on the right. On the phone it opens from the Home section of **Menu**.

## The trade calculator

The calculator has two sides, **You give** and **You get**. Each line shows the card, its set and number, the finish, where it comes from (You give), its value and a count with minus and plus buttons. Minus at 1 removes the line. Each side shows its total.

| To add to | Do |
|---|---|
| You give | **Give** on a trade list row, or select a row in a collection and choose **Add to trade (you give)** (T). The line keeps the row's finish |
| You get | Select a card anywhere and choose **Add to trade (you get)** (G, Trade menu, Trade ribbon tab, **You get** in the Card panel). The line is foil when Add as foil is on |

Adding the same card in the same finish again raises its count.

The **Difference** tile shows the gap between the two totals and who it favors: "In your favor: you get more than you give", "In their favor: you give more than you get", or "An even trade". Lines without a price count as nothing, and the tile says how many there are.

- **Copy trade summary** copies both sides, their totals and the difference as text, ready to paste into a message.
- **Clear trade...** asks first, then empties both sides.

The trade calculator does not change your collections. Its lines are kept until the page is reloaded or the trade is cleared. After a trade, update your collections by removing what you gave and adding what you got.
