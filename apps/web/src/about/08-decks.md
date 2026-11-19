# Decks

A deck has a name, a format, a description, a cover card and cards in up to four zones. Every deck card is a specific printing, and it is linked to the copies in your collections that fill it. Decks belong to the account that made them; they can be shared or sent as described in [Sending and sharing](/about/sending-and-sharing). One deck is open at a time; Add to deck and Quick add put cards into it.

## Deck fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Deck name | Text, 1 to 100 characters | Yes | None | Shown in the title bar, the deck switcher, Deck list and Decks panel |
| Format | Commander, Standard, Pioneer, Modern, Legacy, Pauper, Vintage, Brawl, Standard Brawl, Historic, Explorer, Timeless, Alchemy, Oathbreaker, Pauper Commander, Duel Commander, Premodern, Old School, Penny Dreadful, PreDH or Casual | Yes | Commander | The format the deck is checked against (see Format and legality). Casual decks are not checked |
| Description | Text with headings, lists, bold and links, up to 20,000 characters | No | Empty | Shown on the Description tab |
| Cover card | Any printing in the deck | No | The first commander | Shown in the deck switcher and on the Description tab |
| Collection for the deck | One of your collections | No | None | The collection that receives copies added straight to the deck, remembered per deck (see below) |

Every deck keeps the printing of each card. Each printing in a zone is its own row with its set and collector number.

## Zones

| Zone | Meaning |
|---|---|
| Commander | The commander or commanders of a commander deck |
| Main deck | The cards you play |
| Sideboard | Extra cards kept with the deck |
| Maybeboard | Cards you are considering. They are not counted in the deck's size, value, statistics, ownership or legality, and they are never missing |

The **target zone** decides where Add to deck and Quick add put a card. It starts at Main deck and is kept for your account. Change it with the zone list beside Quick add, the Target zone list on the Decks ribbon tab, the Deck list panel switch, the ZONE item in the status bar, or **Z** (Main deck, Sideboard, Commander, Maybeboard, then Main deck again).

## Opening decks

- **The deck switcher**: the button with the deck's name at the left of the deck view header (on a phone, at the top of the Decks tab). It opens a list of every deck with its cover card, commander, format and card count. Type to find a deck by name, commander or format; Up and Down move through the list, Enter opens the highlighted deck and Esc closes the list. **Sort** orders the list by Recently opened, Name, Date created, Card count, Format or Commander; the choice is kept for your account. **New deck...** is at the bottom of the list.
- **Decks panel**: one click on a deck opens it in the deck view.
- **Open deck...** (Ctrl+O) lists every deck with its format and card count.
- **New deck...** (Ctrl+N) asks for the name and format. **Create deck** creates it and opens it.
- **Add to...** in the scanner offers **New deck...** too (see [Scanning cards](/about/scanning-cards)).

Opening a deck closes the About guide. The last deck you opened opens again the next time you sign in.

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
| Maybeboard | Cards added to the maybeboard are not linked to copies |
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

### Quick add

The box at the top of the Cards tab adds a card by typing it: a count and a name, such as `2 Sol Ring`, `2x Sol Ring` or `Sol Ring` (one copy). A set code and collector number pick the printing, such as `1 Sol Ring (C21) 263`; without them the newest printing is used. Names are suggested while you type. Choose the zone in the list beside the box, then press Enter or **Add**. **Q** jumps to the box. The cards are linked to a free copy as described above.

| Message | Cause |
|---|---|
| Count and name added to deck name | The card was added (with the zone when not the main deck, and the collection its copy came from) |
| No card named name in the card database | No card has the typed name, or no printing has the typed set and number |
| Type a card name, such as 2 Sol Ring | The line has no name, or the count is not 1 to 100 |

### From the card search

1. Select a card in the card search.
2. Press Shift+Enter or choose **+ Deck** (or **Add to deck**). One copy goes into the target zone.

### Changing cards

- Change counts with the minus and plus buttons in the List view or the Deck list panel. Each row holds 1 to 100 copies. Minus at 1, or the remove button, removes the row. Lowering a count removes links beyond the new count.
- The zone list on each row, or **Move to** in the right-click menu, moves all its copies to another zone, with their links. When the same printing is already in that zone, the counts are added together.

### Edit as text

**Edit as text...** (the Cards tab, or the Decks ribbon tab) shows the whole deck as text, one line per card such as `1 Sol Ring (C21) 263`, under the headings Commander, Deck, Sideboard and Maybeboard (Main, Mainboard, Side, SB, Maybe and Considering are also understood).

1. Change the text: add lines, change counts, delete lines.
2. **Check** shows how many cards would be added, changed and removed, and lists the lines that did not match with their line number and the reason.
3. **Apply** makes the deck match the text, as one step that can be undone.

Lines without a set keep the printing the card already has in the deck. Cards that stay keep their linked copies and tags. Cards that are not in the text are removed, and so are cards whose line did not match.

### Tags

Tags are your own groups, such as Ramp or Card draw. **Tags...** (right-click menu, or the Decks ribbon tab with a card selected) asks for the card's tags, separated by commas, and lists the tags already used in the deck. A card has up to 12 tags of up to 40 characters. Tags show on the card's row; clicking one groups the deck by tag.

## The deck view

Press **3** (or **Deck**) to open it. The header holds:

| Item | Use |
|---|---|
| Deck switcher | Opens another deck (see Opening decks) |
| Format | The deck's format: green when the deck is legal, red when it is not, grey for Casual. Click it to change the format |
| Shared by name, or Shared with names | Shown for shared decks |
| Cards, Ownership, Statistics, Playtest, Description, History | The tabs |
| Count | Cards in the main deck and commander zone, the deck's value and how many cards you own |

### Cards tab

Below Quick add, a bar holds:

| Item | Use |
|---|---|
| List, Text, Stacks, Grid | How the cards are shown (kept for your account) |
| Group | Type, Mana value, Color, Rarity, Tag or None (kept for your account) |
| Sort | Name, Mana value or Price, within each group (kept for your account) |
| Edit as text... | See Edit as text |

The cards are shown under a heading for each zone (Commander, Main deck, Sideboard, Maybeboard) with its count, and inside each zone under a heading for each group with its count. Type groups are Creatures, Planeswalkers, Battles, Instants, Sorceries, Artifacts, Enchantments, Lands and Other; a creature that is also an artifact is a creature. Mana value groups go from 0 to 7+, with lands last. A card with several tags is listed under each tag; cards without one are under No tag.

| View | Shows |
|---|---|
| List | A row for each card: picture, name, mana cost, type, printing, a **Not legal** badge, its tags, the collections its copies are in, PROXY, Missing and + Wishlist, the price, the link button, the count controls, the zone list and a remove button |
| Text | A compact line for each card: count, name, mana cost and price, in columns. Cards that break a rule are red; missing cards have an amber count |
| Stacks | A column of overlapping card pictures for each group |
| Grid | Card pictures in rows |

On the desktop, pointing at a card's name in the List or Text view shows a large picture of the card. Click a card to select it; on a phone, tapping opens its card page.

Below the zones, **Tokens** lists the tokens the deck's cards create (from the card database), with the cards that make each one. Click a token to open its card page.

The right-click menu of a deck card holds Card page, Link copies..., Tags..., Move to each other zone, Use as cover card, Add missing to wishlist (when cards are missing) and Remove from deck.

## Format and legality

Every deck except a Casual one is checked against its format each time it changes. A bar above the cards shows **Legal in format**, or **Not legal in format: N problems**; click it to list the problems, and click a problem to select its card. Cards that break a rule show **Not legal**.

| Rule | Formats | Check |
|---|---|---|
| Deck size | Commander, Duel Commander, Pauper Commander, PreDH, Brawl | Exactly 100 cards in the main deck and commander zone |
| Deck size | Standard Brawl, Oathbreaker | Exactly 60 cards in the main deck and commander zone |
| Deck size | Every other format | At least 60 cards in the main deck, and at most 15 in the sideboard |
| Commander | Commander formats | The deck has a commander. A commander that is not a legendary creature or planeswalker, and does not say it can be your commander, is listed to check |
| Copies | Commander formats | One copy of each card in the main deck and commander zone |
| Copies | Every other format | Four copies of each card in the main deck and sideboard together; one of a restricted card |
| Copies | All | Basic lands, and cards that say a deck can have any number of them, have no limit. Cards that name their own limit use it |
| Banned and not legal cards | All | From each card's legality in the card database |
| Color identity | Commander formats | Every main deck card's colors are within the commanders' colors |

Maybeboard cards are never checked. The card database must hold legality data; it arrives with every card database update.

| Message | Meaning |
|---|---|
| Format decks need a commander | The commander zone is empty |
| Format decks have exactly N cards with the commander; this deck has M | The deck is too small or too large |
| Format decks have at least 60 cards in the main deck; this deck has N | The main deck is too small |
| The sideboard can have at most 15 cards; it has N | The sideboard is too large |
| Card: N copies, the limit is M | Too many copies (restricted cards say so) |
| Card is banned in format, Card is not legal in format | The card cannot be played in the format |
| Card is outside the commander's colors (colors) | The card has a color the commanders do not have |
| Card may not be able to be a commander | The commander is not a legendary creature or planeswalker |

## Ownership

The Ownership tab counts the deck cards that have a linked copy. Maybeboard cards are left out.

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

## Statistics

The Statistics tab is described in [Prices and statistics](/about/prices-and-statistics). For a deck it starts with **Mana symbols and sources**: for each color, the colored mana symbols in the costs of the main deck and commander cards (with the share of all colored symbols), beside the number of cards that can make that color. Hybrid symbols count for each of their colors. A card's colors of mana come from the card database.

## Playtest

The Playtest tab draws sample hands from the main deck. Nothing here changes the deck.

| Button or action | What happens |
|---|---|
| New game | Shuffles the main deck and draws seven cards. Turn 1 |
| Mulligan | Shuffles again and draws seven, then asks you to put one card per mulligan on the bottom: tap the cards in your hand to put them there |
| Draw | Draws one card |
| Next turn | Adds one to the turn and untaps your cards |
| Tap a card in your hand | Plays it to the battlefield |
| Tap a card on the battlefield | Taps or untaps it |
| × on a battlefield card | Puts it into the graveyard |

The commanders are shown in the command zone. The bar shows the turn, the cards left in the library and the number of mulligans.

## Description

The Description tab shows the **Cover card** (choose any card in the deck, or The commander), the format, and the description. **Edit description** opens a text box: lines starting with `#` are headings, `**text**` is bold, lines starting with `-` are lists, and `[text](https://...)` is a link (only web addresses become links). **Save** keeps it, **Cancel** leaves it unchanged.

## History

The History tab lists the deck's changes, newest first, with the date and time and who made each one: cards added, removed or moved between zones, counts changed, tags, imports, edits as text, renames, format, description and cover card changes. The newest 500 changes are kept.

## Undo

Adding cards (by search, Quick add or the scanner), changing counts, moving between zones, linking copies, tags, Edit as text and removing cards can be undone and redone. Creating, renaming and deleting decks, and changes to the format, description and cover card, cannot be undone.
