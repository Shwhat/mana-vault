# Prices and statistics

Mana Vault shows a price for each printing, the value of every collection and deck, and statistics with bar charts for a collection or a deck.

## Where prices come from

Prices are part of the card database. Each update stores Scryfall's prices for every printing: a regular, foil and etched price in US dollars, and a regular and foil price in euros. Prices change only when the card database is updated, so they are as old as the last update shown in the status bar. A printing without a price shows "No price".

## Currency

**Prices** chooses the currency for every price and value on screen: US dollars or euros. The choice is kept for your account.

- Change it with **Prices in US dollars** or **Prices in euros** (View menu, Database ribbon tab, group Prices: USD and EUR), with PRICES in the status bar, or with **Show in euros** or **Show in US dollars** on a Statistics tab.
- Values are never converted between currencies. A printing with a dollar price but no euro price has no value in euros.

## The price of a copy

| Copy | US dollars | Euros |
|---|---|---|
| Regular | Regular price | Regular price |
| Foil | Foil price | Foil price |
| Etched | Etched price, or the foil price when there is no etched price | Foil price |

Search results, which are not yet copies, show the regular price, or the foil price for printings that only come in foil.

## Values

| Value | Worked out as | Example |
|---|---|---|
| Row in a collection | Price of one copy times the count | 3 regular Lightning Bolt at $2.50 = $7.50 |
| Collection | Sum of every row. Copies without a price add nothing | $7.50 + $900.00 for a Shivan Dragon = $907.50 |
| Wishlist | The same sum, shown as the wanted value | |
| Normal deck | Each card at its cheapest printing's price (regular, or foil when only foil exists), times the count | 4 Lightning Bolt, cheapest printing $2.50 = $10.00 |
| Theme deck | Each card at its chosen printing's price, times the count | |
| Cards to buy for a deck | Missing copies times the deck price above; see [Decks](/about/decks) | |

Collection values appear in the Collections panel and the bar above the collection's rows. Deck values appear in the deck view header.

## Sorting by price

The **Sort** list above a collection's rows orders them by Name (the default), Price, highest first, Price, lowest first, Quantity, or Set and number. Price sorts use the price of one copy; rows without a price go last. The choice is kept for your account.

## Searching by price

The filters `usd` and `eur` compare a printing's price, for example `usd<1` or `eur>=20`; see [Card search](/about/card-search).

## Statistics

**Collection statistics** (the Statistics tab of the collection view) and **Deck statistics** (the Statistics tab of the deck view) show the same figures.

### Stat tiles

| Tile | Shows |
|---|---|
| Cards | Number of cards, and the number of rows (deck entries for a deck) |
| Value | Total value in the chosen currency, and how many cards have no price |
| Average per card | Total value divided by the priced cards, and the median price per card. A row of four copies counts four times |
| Most valuable | The highest price of one card, and its name |

Example: copies priced $1, $1, $1 and $10 have an average of $3.25 and a median of $1.00.

### Charts

Each chart is a list of bars in one color. The figure at the end of each bar is the number of cards, or their value when **Value** is chosen in place of **Cards**. Pointing at a bar, or moving to it with Tab, shows the name, the number of cards, its share of the chart's cards and its value.

| Chart | Groups |
|---|---|
| Mana curve | Mana value 0 to 6 and 7+, in order. Lands are left out. Fractional mana values count in the lower group |
| Color | White, Blue, Black, Red, Green for one color, Multicolor for two or more, Colorless for none |
| Type | Creature, Instant, Sorcery, Artifact, Enchantment, Planeswalker, Land, Battle, and Other for cards with none of these. A card counts once for each of its types, so an artifact creature counts under Artifact and Creature. Two-faced cards count by their front face |
| Rarity | Common, Uncommon, Rare, Mythic, Special, Bonus, in that order |
| Finish | Regular, Foil and Etched (collections only) |
| Top sets | The twelve sets with the highest value, with their set code |

In a collection, clicking a bar (or pressing Enter on it) opens the Cards tab with only the matching rows, shown as a filter tag; see [Collections](/about/collections). Deck charts are not clickable.

A Normal deck's statistics use the newest printing of each card for rarity and set, and the cheapest printing for value.
