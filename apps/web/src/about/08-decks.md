# Decks

A deck has a name, a format and cards in up to three zones. Every deck card is a specific printing, and it is linked to the copies in your collections that fill it. Decks belong to the account that made them; they can be shared or sent as described in [Sending and sharing](/about/sending-and-sharing). One deck is open at a time; Add to deck puts cards into it.

## Deck fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Deck name | Text, 1 to 100 characters | Yes | None | Shown in the title bar, Deck list and Decks panel |
| Format | Commander, Standard, Pioneer, Modern, Legacy, Pauper, Vintage or Casual | Yes | Commander | A label for the deck. Mana Vault does not enforce format rules |
| Collection for the deck | One of your collections | No | None | The collection that receives copies added straight to the deck, remembered per deck (see below) |

Every deck keeps the printing of each card. Each printing in a zone is its own row with its set and collector number. Decks from before 0.6.0 that kept cards by name keep the printing they showed (the newest printing of each card).

## Zones

| Zone | Meaning |
|---|---|
| Main deck | The cards you play |
| Sideboard | Extra cards kept with the deck |
| Commander | The commander or commanders of a Commander deck |

The **target zone** decides where Add to deck puts a card. It starts at Main deck and is kept for your account. Change it with the Target zone list on the Decks ribbon tab, the Deck list panel switch, the ZONE item in the status bar, or **Z** (Main deck, then Sideboard, then Commander).

## Creating and opening decks

1. **New deck...** (Ctrl+N) asks for the name and format. **Create deck** creates it and opens it.
2. **Open deck...** (Ctrl+O) lists every deck with its format and card count, and opens the chosen deck in the deck view.
3. Clicking a deck in the Decks panel opens it; double-clicking also shows it in the work area.
4. **Add to...** in the scanner offers **New deck...** too (see [Scanning cards](/about/scanning-cards)).

The last deck you opened opens again the next time you sign in.

## Renaming and deleting decks

- **Rename deck...** (Decks ribbon tab) changes the open deck's name, 1 to 100 characters. Renaming a shared deck changes it for both people.
- **Delete deck...** asks "Delete name and its N cards?" and removes the deck. A deck you share warns that the other people will lose it too. Deleting cannot be undone, and it clears the undo history. The copies stay in their collections.
- For a deck shared with you, the command is **Leave shared deck...**: the deck stays with its owner and leaves your list.

## Cards and the copies that fill them

Every card you own is in a collection. Putting a card in a deck does not take it out of its collection: the deck card is **linked** to the copy. The collection row shows the deck, and the deck card shows the collection.

| Rule | What happens |
|---|---|
| One deck per copy | A copy fills one deck card at a time. When a second deck needs the same card and no other copy is free, that card is missing in the second deck |
| Cards you do not own | A deck can hold cards with no linked copy. They show **Missing** with a **+ Wishlist** button |
| Choosing the copy | Add to deck links a free copy at once when the card is free in one collection. When it is free in more than one collection, Mana Vault asks which copy to use (or None, missing). **Link copies...** changes it later |
| Another printing | Linking a copy of another printing changes those deck cards to the copy's printing, so the deck shows the cards it really holds |
| Moving a copy | Moving a linked copy to another collection keeps the link: the deck card then shows the new collection. Copies in no deck move first |
| Removing a copy | Removing a linked copy from its collection makes the deck card missing |
| Changing copy details | Changing a linked copy's finish, condition, language or proxy keeps the link |
| Proxies | A proxy can fill a deck card. It is marked **PROXY** on the deck card |
| Wishlists | Wishlist cards are not owned and cannot fill a deck card |
| Sending | A deck sent as a copy or a transfer arrives without links; the receiver links it to their own collections |

### Adding cards straight to a deck

Scanned cards added to a deck are new physical cards, so they go into a collection and are linked to the deck cards they fill. **Copies go into** in the Add to window offers a new collection named after the deck, or any of your collections. The choice is remembered for the deck and filled in the next time; confirm it with **Add**.

### Link copies

**Link copies...** (Decks ribbon tab, the link button on a deck card, or the right-click menu) lists the free copies of the card in your collections, each with its collection, set, number, finish, condition, language, proxy and how many are free. Choose a copy and **How many**, or **None (missing)**, then **Link**. The change can be undone.

## Building a deck

1. Select a card in the card search.
2. Press Shift+Enter or choose **+ Deck** (or **Add to deck**). One copy goes into the target zone, linked to a free copy as described above. The message names the collection, for example "Lightning Bolt added to Burn, from Main collection".
3. Change counts with the minus and plus buttons in the deck view or the Deck list panel. Each row holds 1 to 100 copies. Minus at 1, or the remove button, removes the row. Lowering a count removes links beyond the new count.
4. In the deck view, the zone list on each row moves all its copies to another zone, with their links. When the same printing is already in that zone, the counts are added together.

## The deck view

Press **3** (or **Deck**) to open it. The header shows the deck name, format, the tabs **Cards**, **Ownership** and **Statistics**, the total cards, the deck's value and how many cards you own.

On the Cards tab, cards are grouped under Commander, Main deck and Sideboard headings with a count for each zone, and sorted by name. Each row shows the image, name, mana cost, type line and printing, then its tags:

| Tag | Meaning |
|---|---|
| Collection name (blue), with ×N for more than one | The collection that holds the linked copies. Clicking it opens that collection |
| PROXY | A linked copy is a proxy |
| Missing, with a number when only some are missing | Deck cards with no linked copy |
| + Wishlist | Adds the missing copies to your wishlist |

Then the link button, the count controls, the zone list and a remove button. The Statistics tab is described in [Prices and statistics](/about/prices-and-statistics).

## Ownership

The Ownership tab counts the deck cards that have a linked copy.

| Item | Shows |
|---|---|
| Cards you own | The share of deck cards with a linked copy, the numbers owned and missing, and the cost of the missing cards |
| Card | Card name, with the zone when not the main deck |
| Owned | Linked copies of copies needed |
| Where | Each collection that holds the linked copies, with how many, and the number of proxies, or Missing |
| To buy | Missing copies times the price, or Owned |

The price of a missing card is the price of its printing in the regular finish (foil when the printing only comes in foil). Click a row to see the card in the Card panel.

- **Add missing to wishlist** (or **Add missing deck cards to wishlist**) adds the missing copies to your wishlist in one step that can be undone; see [Wishlists and trading](/about/wishlists-and-trading).
- **Export missing** (or **Export missing deck cards (text)**) downloads deck-name-missing.txt with one line per card, such as `2 Lightning Bolt (M10) 146`.

| Message | Cause |
|---|---|
| You own every card in deck name | Add missing to wishlist or Export missing with nothing missing |
| Missing cards exported (N cards) | Export missing finished |
| No free copy of card is in your collections | Link copies for a card with no free copy |
| A linked copy must be the same card | A link to a copy of a different card |
| Wishlist cards are not owned, so they cannot fill a deck | A link to a copy in a wishlist |

## Undo

Adding cards, changing counts, moving between zones, linking copies and removing cards can be undone and redone. Creating, renaming and deleting decks cannot be undone.
