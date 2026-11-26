# Decks

A deck has a name, a format, a description, a cover card and cards in up to four zones. Every deck card is a specific printing, and it is linked to the copies in your collections that fill it. Decks belong to the account that made them; they can be shared or sent as described in [Sending and sharing](/about/sending-and-sharing). One deck is open at a time; Add to deck and Quick add put cards into it.

## Deck fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Deck name | Text, 1 to 100 characters | Yes | None | Shown in the title bar, the deck switcher, Deck list and Decks panel |
| Format | Commander, Standard, Pioneer, Modern, Legacy, Pauper, Vintage, Brawl, Standard Brawl, Historic, Explorer, Timeless, Alchemy, Oathbreaker, Pauper Commander, Duel Commander, Premodern, Old School, Penny Dreadful, PreDH or Casual | Yes | Commander | The format the deck is checked against (see Format and legality). Casual decks are not checked |
| Description | The text of the deck's top notes page, up to 20,000 characters | No | Empty | Edited on the Notes tab; see [Notes and the Wiki](/about/notes-and-the-wiki) |
| Cover card | Any printing in the deck | No | The first commander | Shown in the deck switcher and on the Notes tab |
| Collection for the deck | One of your collections | No | None | The collection that receives copies added straight to the deck, remembered per deck (see below) |

Every deck keeps the printing of each card. Each printing in a zone is its own row with its set and collector number.

## Zones

| Zone | Meaning |
|---|---|
| Commander | The commander or commanders of a commander deck |
| Main deck | The cards you play |
| Sideboard | Extra cards kept with the deck |
| Maybeboard | Cards you are considering. They are not counted in the deck's size, value, statistics, ownership or legality, and they are never missing |

The **target zone** decides where Add to deck and Quick add put a card. It starts at Main deck and is kept for your account.

The **All**, **Commander**, **Main**, **Sideboard** and **Maybe** buttons above the deck's cards and in the Deck list panel choose what the list shows and where cards go. A zone button shows only that zone and makes it the target zone. **All** shows every zone and makes Main deck the target zone. The same choice is on **Z** (All, Commander, Main, Sideboard, Maybe, then All again). The zone list beside Quick add and the ZONE item in the status bar change only the target zone. A zone with no cards shows "No cards in zone".

## Opening decks

- **The deck switcher**: the button with the deck's name at the left of the deck view header (on a phone, at the top of the Decks tab). It opens a list of every deck with its cover card, commander, format and card count. Type to find a deck by name, commander or format; Up and Down move through the list, Enter opens the highlighted deck and Esc closes the list. One click on a deck makes it where new cards go and keeps the list open; a double click opens it. In the Android app one tap opens the deck, and the open deck is where new cards go; browsers work as described here. **Sort** orders the list by Recently opened, Name, Date created, Card count, Format or Commander; the choice is kept for your account. **New deck...** is at the bottom of the list.
- **Decks panel**: decks are grouped by format, each with its card count and value. One click on a deck makes it where new cards go without leaving the view you are in (see [Collections](/about/collections)); a double click opens it in the deck view. The deck shows **Adding here** while it is where cards go. Right-click or long press a deck for its menu: Open, Rename..., Deck format..., Send to print list..., Send..., Export..., Delete or Leave. **Send to print list...** asks each time what to send: **The whole deck (not the maybeboard)**, **Missing cards only**, or **Chosen zones** (Commander, Main deck, Sideboard, Maybeboard). Each card goes in its deck printing and count, as one step that can be undone.
- **Open deck...** (Ctrl+O) lists every deck with its format and card count.
- **New deck...** (File menu, Decks panel, deck switcher) asks for the name and format. **Create deck** creates it and opens it; **Choose a precon...** opens the preconstructed deck list instead.
- **Add to...** in the scanner offers **New deck...** too (see [Scanning cards](/about/scanning-cards)).

Opening a deck closes the About guide. The last deck you opened opens again the next time you sign in.

The Decks panel, deck switcher and Deck list header show color-identity symbols and possible theme labels. When a deck has commanders, the symbols show their combined color identity; otherwise they show the main deck's combined identity. A nonempty colorless deck shows the colorless symbol.

Theme labels are suggestions from repeated card text, not definitive archetypes: at least two different cards in the main deck or commander zone must match a mechanic's text signal (for example, Tokens looks for creating tokens). The supported signals are Landfall, Tokens, Food, Amass, Treasure, Clues, Counters, Sacrifice, Graveyard, Lifegain, Mill, Cycling and Proliferate. Sideboard and maybeboard cards do not affect the symbols or themes. The deck search in the panel and switcher can find these labels.

### Add precon as deck...

**Add precon as deck...** in the File menu lists every preconstructed deck MTGJSON knows, with a find box. Choosing one makes a new deck named after it, with its commander, main board and side board in the printings and finishes the decklist names. A deck with a commander gets the Commander format; others are Casual. Undo deletes the new deck. The same happens from a precon in a card page's **Found in**.

## Renaming and deleting decks

- **Rename...** in a deck's right-click menu (Decks panel or deck switcher) changes the deck's name, 1 to 100 characters. Renaming a shared deck changes it for both people.
- **Delete deck...** asks "Delete name and its N cards?" and removes the deck. A deck you share warns that the other people will lose it too. Deleting cannot be undone, and it clears the undo history. The copies stay in their collections.
- For a deck shared with you, the command is **Leave shared deck...**: the deck stays with its owner and leaves your list.

## Cards and the copies that fill them

Every card you own is in a collection. Putting a card in a deck does not take it out of its collection: the deck card is **linked** to the copy. The collection row shows the deck, and the deck card shows the collection.

| Rule | What happens |
|---|---|
| One deck per copy | A copy fills one deck card at a time. When a second deck needs the same card and no other copy is free, that card is missing in the second deck |
| Cards you do not own | A deck can hold cards with no linked copy. They show **Missing** with a **+ Wishlist** button |
| Choosing the copy | Add to deck links a free copy of exactly the printing and finish added, at once when it is free in one collection. When it is free in more than one collection, Mana Vault asks which copy to use (or None, missing). Copies of other printings or finishes are never linked on their own. **Link copies...** changes it later |
| Edit as text and imports | Lines with a set and collector number are linked to free copies of exactly that printing and finish, the deck's own collection first. Lines without a set and number stay missing until a copy is linked |
| Maybeboard | Cards added to the maybeboard are not linked to copies |
| The deck follows the copy | Linking a copy of another printing or finish changes those deck cards to the copy's printing and finish, so the deck shows the cards it really holds. The same printing can be in a zone twice, once regular and once foil |
| Moving a copy | Moving a linked copy to another collection keeps the link: the deck card then shows the new collection. Copies in no deck move first |
| Removing a copy | Removing a linked copy from its collection makes the deck card missing |
| Changing copy details | Changing a linked copy's condition, language or proxy keeps the link. Changing its finish keeps the link and the deck card takes the new finish |
| Changing a copy's printing | When a copy linked to a deck changes printing or finish, Mana Vault asks "A copy that changes is in deck name. Change the deck too?" **Yes, change the deck** moves the deck card with the copy. **No, show it as missing** changes only the copy; the deck card keeps its version and shows **Missing** with **Other version owned** |
| Proxies | A proxy can fill a deck card. It is marked **PROXY** on the deck card |
| Wishlists | Wishlist cards are not owned and cannot fill a deck card |
| Sending | A deck sent as a copy or a transfer arrives without links; the receiver links it to their own collections |

### Adding cards straight to a deck

Scanned cards added to a deck are new physical cards, so they go into a collection and are linked to the deck cards they fill. **Copies go into** in the Add to window offers a new collection named after the deck, or any of your collections. The choice is remembered for the deck and filled in the next time; confirm it with **Add**.

### Change printing

**Change printing...** in a deck card's right-click menu (in every deck view and the Deck list panel) changes the printing of the deck card, its finish, or both. Choose the printing and finish in the printing chooser, such as the foil version of the current printing.

1. The links to the old copies are removed.
2. Free copies of the new printing in the chosen finish in your collections are linked, up to the card's count. When free copies are in more than one collection, Mana Vault asks which collection's copies to link (or None, missing).
3. Cards without a copy show as missing. Maybeboard cards are not linked.

With more than one card, the chooser first asks **How many to change**, as its own step, starting at 1, with **-**, **+** and **All N** buttons; **Choose the printing** goes on to the printings, and **Change how many** goes back. Only that many cards change; the rest stay as they are, so two copies can become one regular and one foil card without removing either. When the deck already has the new printing and finish in the same zone, the cards join it. The change is written to the deck's history and can be undone. The message reads "Card name is now (SET) number" (with "foil" or "etched" for those finishes), or "N of M Card name changed to (SET) number" when only some cards change, with where copies were linked from and how many are missing. A printing can only be chosen in a finish it is made in.

### Finish

Every deck card has a finish: regular, foil or etched. A foil or etched card shows FOIL or ETCHED in every deck view (List, Text, Stacks and Grid), the Deck list panel and the Card panel, and the deck's value, statistics and the card's price use the price of that finish (or another finish of the printing when that one has no price). The finish is set by:

- `*F*` (foil) or `*E*` (etched) after a line in Quick add, Edit as text and decklist imports. In Edit as text, a line without a mark makes the card regular, and **Edit as text** writes the marks for foil and etched cards.
- The finish picked in the printing chooser when adding (it starts on foil while **Add as foil** is on).
- **Change printing...**.
- Linking a copy: the deck card takes the copy's finish.

A regular and a foil card of the same printing are two deck cards. The finish is kept in backups and when a deck is sent as a copy.

### Owned, link and Other version owned

A deck card with missing copies shows what you own of it, in every deck view:

| Mark | Meaning | Click |
|---|---|---|
| **Owned, link** | Free copies of exactly this printing and finish are in your collections | Links them, from one collection, up to the number missing (also **Link owned copies** in the right-click menu) |
| **Other version owned** | Free copies of another printing or finish are in your collections | Lists them with their collection and how many are free. **Switch** changes the missing cards to that version and links the copies (also **Switch to the version owned...** in the right-click menu) |

**Link owned copies** (the Ownership tab, or a deck card's right-click menu) links free copies of the exact printing and finish to every missing card in the deck at once, the deck's own collection first. The message reads "N owned copies linked to deck name", or "No free copies of the missing cards' exact printings are in your collections".

### Upgrade wanted

A card in the deck that you want in a better version, such as a foil or an older printing, can be marked **Upgrade wanted**. The card stays in the deck and counts as owned; the mark only records the version you are looking for.

1. Right-click the card and choose **Mark as upgrade wanted...**.
2. Choose the version wanted in the printing chooser, with its finish.

The card shows an **Upgrade wanted** badge (the wanted version in its tooltip), and the List view adds "wanted (SET) number". The Ownership tab lists every card marked Upgrade wanted with its version in the deck and the version wanted. **Change upgrade wanted...** chooses another version, and **Remove upgrade wanted mark** removes it. When a copy of the wanted version is linked to the card, the mark goes by itself. Choosing the version the deck already has gives "The deck already has this version. Choose the version you want instead." The mark is kept in backups and the deck's history.

### Link copies

**Link copies...** (the link button on a deck card, or the right-click menu) lists the free copies of the card in your collections, each with its collection, set, number, finish, condition, language, proxy and how many are free. Choose a copy and **How many**, or **None (missing)**, then **Link**. The change can be undone.

## Building a deck

### Quick add

The box at the top of the Add tab adds a card by typing it: a count and a name, such as `2 Sol Ring`, `2x Sol Ring` or `Sol Ring` (one copy). A set code and collector number pick the printing, such as `1 Sol Ring (C21) 263`; without them the newest printing is used. Card names are suggested under the box while you type (Up and Down move through them, Enter or a click takes one and keeps the count). Choose the zone in the list beside the box, then press Enter or **Add**. **Q** jumps to the box. The cards are linked to a free copy as described above.

| Message | Cause |
|---|---|
| Count and name added to deck name | The card was added (with the zone when not the main deck, and the collection its copy came from) |
| No card named name in the card database | No card has the typed name, or no printing has the typed set and number |
| Type a card name, such as 2 Sol Ring | The line has no name, or the count is not 1 to 100 |

### Adding from card search

With a deck selected last in the Decks panel or the deck switcher, **Add to collection** (Enter or a double-click on a result) adds the card to that deck in the target zone, shown as ZONE in the status bar. The status bar shows ADDING TO: DECK name, and the deck is marked **Adding here** in the Decks panel. Selecting a collection, or clicking ADDING TO in the status bar, makes cards go to the collection again. Shift+Enter always adds to the open deck.

### The Add tab

Below Quick add and **Edit as text...**, the Add tab searches the whole card database. Type in the header's **Search cards to add** box; the Filters panel filters the results (Filtering: Deck card search). Results use the card search layout and card size from **Options**.

Each result has **+ Main**, **+ Side**, **+ Maybe** and **+ Commander**. A button with cards of that name already in the zone is highlighted and shows the count. Each opens the printing chooser with the shown printing selected, to pick the printing and finish; a card made in one printing and one finish is added at once. Double-click adds one copy to the target zone; the right-click menu holds Card page, Add to each zone and Add to wishlist. Copies are linked as described above.

### From the card search

1. Select a card in the card search.
2. Press Shift+Enter, or select the deck last and choose **+ deck name** (or **Add to deck name...** in the right-click menu).
3. Pick the printing and finish in the printing chooser and press Enter. One copy goes into the target zone.

### Changing cards

- Change counts with the minus and plus buttons in the List view or the Deck list panel. Each deck card holds 1 to 100 copies. Minus at 1 removes the card. Lowering a count removes links beyond the new count.
- The remove button, or **Remove from deck** in the right-click menu, removes a card with one copy at once. With more copies it asks how many to remove ("There are N copies."), with **Reduce to 1** and **Remove all**. **Reduce to 1** is also in the right-click menu of a card with more than one copy.
- The zone list on each row, or **Move to** in the right-click menu, moves all its copies to another zone, with their links. When the same printing is already in that zone, the counts are added together.

### Edit as text

**Edit as text...** (the Add tab, or Options on the Cards tab) shows the whole deck as text, one line per card such as `1 Sol Ring (C21) 263`, under the headings Commander, Deck, Sideboard and Maybeboard (Main, Mainboard, Side, SB, Maybe and Considering are also understood).

1. Change the text: add lines, change counts, delete lines.
2. **Check** shows how many cards would be added, changed and removed, and lists the lines that did not match with their line number and the reason.
3. **Apply** makes the deck match the text, as one step that can be undone.

Lines without a set keep the printing the card already has in the deck. Cards that stay keep their linked copies and tags. Cards that are not in the text are removed, and so are cards whose line did not match. A card whose line only changes its finish mark keeps its tags; its links to copies of the old finish go.

Lines with a set and collector number are linked to free copies of exactly that printing and finish (see the table above); the message ends with "N linked to owned copies". Lines without a set and number stay missing until a copy is linked.

### Tags

Tags are your own groups, such as Ramp or Card draw. **Tags...** (right-click menu of a deck card) asks for the card's tags, separated by commas, and lists the tags already used in the deck. A card has up to 12 tags of up to 40 characters. Tags show on the card's row; clicking one groups the deck by tag.

## The deck view

Press **3** (or **Deck**) to open it. The header holds:

| Item | Use |
|---|---|
| Deck switcher | Opens another deck (see Opening decks) |
| Cards, Add, Ownership, Statistics, Playtest, Notes, History | The tabs. On a phone they scroll sideways |
| Shared by name, or Shared with names | Shown for shared decks |
| Filter box | Cards tab: **Filter deck cards** keeps the cards whose name, type or set contains the text. Add tab: **Search cards to add** |
| Options | Cards tab: view, group, sort and Edit as text, with a count of active filters. Add tab: the search layout and card size |
| Count | The format badge (green when the deck is legal, red when it is not, grey for Casual; click it to change the format), then cards in the main deck and commander zone, the deck's value and how many cards you own; while filters hide cards, "showing N". On the Add tab, the number of results |

The deck's filter box and the Filters panel (Filtering: Deck) stay when another deck opens.

### Cards tab

The Cards tab shows only the deck's cards. **Options** holds:

| Item | Use |
|---|---|
| View: List, Text, Stacks, Grid | How the cards are shown (kept for your account) |
| Group | Type, SubType, Type and Tag, Rarity, Color, Color Identity, Mana Value, Set, Artist, Tag or No grouping (kept for your account); see [List views](/about/screen-layout#list-views) |
| Sort | Name, Mana Value, Price, Rarity or Color, within each group (kept for your account) |
| Clear filters | Shown while deck filters are on |
| Edit as text... | See Edit as text |
| Done | Closes Options |

The cards are shown under a heading for each zone (Commander, Main deck, Sideboard, Maybeboard) with its count, and inside each zone under a heading for each group with its count. Type groups are, in this order, Planeswalkers, Creatures, Sorceries, Instants, Artifacts, Enchantments, Battles, Lands and Other (the Commander zone comes first); a creature that is also an artifact is a creature. Mana value groups go from 0 to 7+, with lands last. A card with several tags is listed under each tag; cards without one are under No tag.

| View | Shows |
|---|---|
| List | A row for each card: picture, name, mana cost, type, printing, a **Not legal** badge, its tags, the collections its copies are in, PROXY, Missing and + Wishlist, the price, the link button, the count controls, the zone list and a remove button |
| Text | A compact line for each card: count, name, mana cost and price, in columns. Cards that break a rule are red; missing cards have an amber count |
| Stacks | A column of overlapping card pictures for each group, one picture per printing. Each picture has a pip bar above it (in the strip that stays in view while the pictures overlap) with its total count, finish badges, Missing, Upgrade wanted, Printing removed and the owned marks |
| Grid | Card pictures in rows, one per printing, with a pip bar under the picture: the count, FOIL or ETCHED, Missing (with the number when only some are missing), Upgrade wanted, Printing removed (a click opens Change printing...) and the owned marks. A printing in the deck in more than one finish gets a line under the picture for each finish with its pip, Missing and count. Pictures show no prices; the List view has them |

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

### Who can lead a deck

With MTGJSON data, the commander check uses MTGJSON's list of which formats each card can lead: Commander and other commander formats, Oathbreaker (where the Commander zone also holds the signature spell, an instant or sorcery) and Brawl and Standard Brawl. A card that cannot lead the format gets the warning "name cannot lead a Format deck". A card MTGJSON has no record of is checked by its type line and rules text as before ("name may not be able to be a commander").

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
- **Link owned copies** links free copies of the exact printing and finish to every missing card.
- **In Deck name**: a missing card whose copies all fill other decks shows a badge naming each deck (IN DECK NAME on pictures). A click on it lists those copies with **Move to this deck**, which unlinks the copy from the other deck (that deck then misses it) and links it here, as one step that can be undone. The message reads "Card moved from Deck to this deck. Deck now misses it".

On deck pictures, multiple status marks are grouped under a count. Hover, focus or tap it to see the marks and use their actions.
- **Export missing** (or **Export missing deck cards (text)**) downloads deck-name-missing.txt with one line per card, such as `2 Lightning Bolt (M10) 146`.

| Message | Cause |
|---|---|
| You own every card in deck name | Add missing to wishlist or Export missing with nothing missing |
| Missing cards exported (N cards) | Export missing finished |
| No free copy of card is in your collections | Link copies for a card with no free copy |
| No other version of card is free in your collections | Switch to the version owned when no other version is free |
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

## Notes

The Notes tab (Description before 0.22.0) shows the **Cover card** (choose any card in the deck, or The commander) and the format at the top, then the deck's notes: its top page, which is the deck's description, and any child pages, such as a primer, a sideboard guide or combo notes. See [Notes and the Wiki](/about/notes-and-the-wiki).

## History

The History tab lists the deck's changes, newest first, with the date and time and who made each one: cards added, removed or moved between zones, counts changed, tags, imports, edits as text, renames, format, description and cover card changes. The newest 500 changes are kept.

## Undo

Adding cards (by search, Quick add or the scanner), changing counts, moving between zones, linking copies, tags, Edit as text and removing cards can be undone and redone. Creating, renaming and deleting decks, and changes to the format, description and cover card, cannot be undone.

## Add deck to collection

**Add deck to collection...** puts the deck's cards into a collection as copies, for example after building a deck with Edit as text from cards you have in hand. It is beside Edit as text on the Add tab (**To collection**), and in a deck's right-click menu in the Decks panel and the deck switcher.

1. Choose **Add deck to collection...**.
2. Pick the **Collection** (the deck's own collection or the target collection first). Wishlists are not offered. If you have no collections, **New collection...** is selected with the deck's name suggested; enter a name to create one.
3. Pick **Cards to add**: **Missing cards only, linked to the deck** adds a copy for every card the deck is missing; **Every card as new copies** adds a copy for every card in the deck, even cards already filled by copies you own.
4. Choose **Add cards**.

The copies are near mint English in the deck card's printing and finish, and the deck's missing cards are linked to them either way. The maybeboard is left out. Wishlist wants for those cards go down as for any added card. The change is written to the deck's history ("Added N cards to name") and is one undo step.

| Message | Meaning |
|---|---|
| N cards added to name, N linked to the deck | The copies were added and the missing cards linked |
| The deck is not missing any cards | Missing cards only found nothing to add |
| Nothing was added | The collection already holds 10,000 copies of each card |
| Choose a collection, not a wishlist | The collection is a wishlist |
| Create a collection first | You have no collection to add to |
