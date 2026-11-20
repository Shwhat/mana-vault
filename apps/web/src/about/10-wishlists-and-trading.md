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
| Show only rows with copies for trade | **For trade only** in the collection's Options |

A row with copies for trade shows a FOR TRADE badge with the number. Lowering a row's count lowers its number for trade with it. When copies move to another collection, copies marked for trade stay behind while there are enough copies left; otherwise the marks move with them. Marks can be undone.

The cards marked for trade are what the **You give** search of a trade shows, what other accounts' wishlists are matched against, and what your public trade binder lists.

## The trade view

Press **4**, choose **Trade view** (Views group of the Home ribbon tab, or the Trade ribbon tab), or tap **Trade** in the phone's bottom bar. The header holds:

| Item | Use |
|---|---|
| Trade list | The open trade's name. It lists every saved trade, grouped Open, Done and Cancelled, with whom, whose turn it is and the number of cards |
| Status | Open, Done or Cancelled; for a trade with another account, Sent to name or From name, and Your turn or Waiting for an answer |
| New... | Starts a trade with a name (a date by default) |
| Rename... | Changes the open trade's name (also **Rename trade...** in the phone Menu) |
| Cancel, Reopen | Cancels the open trade, or opens a cancelled trade again. For a trade with another account, Cancel declines it for both sides |
| Delete... | **Delete trade...**: deletes the trade after asking; the cards stay where they are. Only the account that started a trade can delete it |
| Options | The layout and card size of the two searches (the same as card search) |
| Count | The cards in the trade and its status |

## Building a trade

The trade has two columns, **You give** and **You get**. Each column lists its lines, then a search for cards to add:

| Column | Search | Adds with |
|---|---|---|
| You give | The cards you marked for trade, in every collection you own. **All cards, not only for trade** searches every card in your collections. Each result shows its collection | **+ Give** (with the number for trade), a double-click, or the right-click menu |
| You get | The whole card database | **+ Get**, a double-click, or the right-click menu |

The Filters panel filters the search you last used; the Filters line says which. When no trade is open, adding a card starts a new trade.

Each line shows the picture, name (with FOIL or ETCHED for those finishes), set, number and the collection it comes from (You give), and has:

| Control | Use |
|---|---|
| Count | Minus and plus; minus at 1 removes the line |
| Finish | Regular, Foil or Etched |
| Condition | Mint to Damaged |
| Price each | Empty uses the card database price for the finish; typing a price replaces it, and the line shows **EDITED**. **Use card price** goes back to the database price |
| Remove | Removes the line |

Adding the same card in the same finish, condition and language again raises its count. Each column shows its card count and total.

The **balance bar** under the header shows You give against You get as one bar, and the difference: "Even trade", or the amount "in your favor" or "in their favor", with the number of lines without a price (they count as nothing).

## Completing a trade

**Complete trade...** asks which collection the cards you get go to, then, in one step:

1. The cards you give leave the collections they come from. When one of them fills a deck, the trade names the cards and decks first and asks before going on; those deck cards become missing.
2. The cards you get are added to the chosen collection, and your wishlist wants for them go down.
3. The trade becomes Done.

**Undo** (Ctrl+Z) puts every card back and opens the trade again. A done trade cannot change.

| Message | Cause |
|---|---|
| Choose the collection for the cards you get | No collection was chosen for the cards you get |
| Name: only N of M copies are in the collection | The collection no longer has enough copies to give |
| Choose the collection that Name comes from | A given card has no collection |

## Trading with another account

**Send to another account...** sends the open trade to an account on this server, with the collection your cards go to.

- The other account sees it in the trade list and in the **Inbox** under Trades waiting for your answer, with **Open trade**. Their view shows the sides turned around: what you give is what they get.
- Either side can change the lines. A change goes back to the other account as a counter-offer, and their status shows Your turn.
- The account whose turn it is can **Accept trade...** (choosing the collection their cards go to). Accepting completes the trade for both accounts: each side's given cards move to the other side's collection, and wishlist wants go down.
- **Decline** (or **Cancel trade** for the sender) ends the proposal for both sides.

| Message | Cause |
|---|---|
| Wait for the other account to answer your last change | You changed the trade last; the other account answers next |
| The other account has to choose where their cards go first | The other account has not chosen a collection yet |
| Only the account that started a trade can delete it. Decline it instead. | Delete on a trade sent to you |

## Wishlist matches

**Wishlist matches** under the trade lists:

- **Others have cards you want**: cards other accounts on this server marked for trade that your wishlists want, with the account and how many. **+ Get** adds one to what you get.
- **Others want your trade cards**: your cards for trade that other accounts' wishlists want. **+ Give** adds one to what you give.

## Copying, exporting and sharing

- **Copy list** (Copy trade list) copies both sides with prices, the totals and the difference as text.
- **Export...** (Export trade list) downloads the lines as a CSV file with the columns Side, Count, Name, Set, Number, Finish, Condition, Language, Price each and Total.
- **Share trade binder...** makes a public link to a page named "your name's trade binder" that lists the cards you marked for trade, with sets, finishes, conditions and prices. It is the only page that opens without signing in. **Copy link** copies it, **New link** replaces it (the old link stops working) and **Turn off** removes it.
