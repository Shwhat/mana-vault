# Set completion

A collection linked to one or more sets, with a completion rule other than None, shows how much of each set it holds and which cards are still missing. Only cards in that collection count, and proxies never count.

## Completion rules

| Rule | Each set needs | Example |
|---|---|---|
| None (the default for new collections) | Nothing: the collection tracks no completion, for bulk cards. The Completion and Missing tabs are hidden | A box of bulk commons |
| Main set | One copy of every numbered card printed in the set, from 1 up to the set's printed size | A set printed with 281 cards needs cards 1 to 281; showcase and extended-art versions numbered above 281 are not needed |
| Every printing | One copy of every printing in the set, including variants, promos and versions with letters in the number | The same set might need 400 printings |
| Each card name once | One copy of each different card in the set, in any of its versions from that set | A card with a regular and a borderless version in the set needs either one. A copy of the same card printed in a different set does not count |

The printed size comes from the set list that card database updates download. Until a set has a printed size, Main set counts the numbered printings that are not promos or variants.

## Finish rules

| Rule | A card counts when the collection has |
|---|---|
| Any finish | A regular or a foil copy |
| Regular only | A regular copy. Printings never made in regular are left out of the total |
| Foil only | A foil (or etched foil) copy. Printings never made in foil are left out of the total |
| One of each | A regular copy and a foil copy. Each counts separately, so a card made in both finishes adds 2 to the total |

## How the numbers are worked out

- **Total** is the number of cards (or finishes, under One of each) the rules require across the linked sets.
- **Owned** is how many of those the collection meets.
- **Percent complete** is owned divided by total, rounded down to one decimal place in the Completion tab and to a whole number in the Collections panel.

Example: a collection is linked to one set with a printed size of 8, uses Main set and One of each, and holds a regular and a foil copy of card 1 and a regular copy of card 2. Every card was made in both finishes, so the total is 8 × 2 = 16, owned is 3, and the collection is 3 / 16 = 18.7% complete.

## Completion tab

The Completion tab of the collection view shows:

- **Overall completion**: the percentage, "owned of total owned, missing missing", and a bar.
- The rules in use, with **Change rules** (opens Collection settings) and **Show missing cards**.
- A row for each linked set with its symbol, name, code, a Digital badge for sets only released online, a bar, owned / total and the percentage. Sets of the same block (two or more linked) are listed together under the block's name, such as Ice Age.

A collection with no linked sets shows **Collection settings...** to link them.

## Missing tab

The Missing tab lists every card still needed, with its image, mana cost, type, set, collector number and rarity. Under Regular only, Foil only and One of each, a badge shows which finish is needed: FOIL NEEDED or REGULAR NEEDED. Under Each card name once, the main version of the card is shown.

- Narrow the list by set, rarity or color (Colorless lists cards with no color). The count shows how many of the missing cards are listed.
- **+ Collection** on a row adds one copy of that printing to the open collection, as foil when a foil is needed and regular when a regular is needed. The list and the completion update at once.
- Click a row to see the card in the Card panel.
- **Add all to wishlist**  adds one copy of every missing card to your wishlist, foil where a foil is needed, in one step that can be undone. It is not offered when the open collection is itself a wishlist. Etched copies count as foil for set completion.

## Exporting the missing list

**Export...** in the Missing tab (**Export missing cards...**) opens the export window with Missing cards chosen; it downloads every missing card of the open collection (filters are not applied) in the chosen format, for example:

| Format | File | Contents |
|---|---|---|
| Text | collection-name-missing.txt | One line per card: `1 Card Name (SET) 123`, with ` *F*` at the end when a foil is needed |
| CSV | collection-name-missing.csv | Columns Count (always 1), Name, Edition (set code), Collector Number, Foil (true or false), Rarity |
