# Prices and statistics

Mana Vault shows a price for each printing, the value of every collection and deck, and statistics with bar charts for a collection or a deck.

## Where prices come from

Prices are part of the card database. Each card database update stores Scryfall's prices for every printing (a regular, foil and etched price in US dollars), and MTGJSON's prices are saved once a day from five stores:

| Store | Prices kept | Currency |
|---|---|---|
| TCGplayer | Retail and buylist | US dollars |
| Card Kingdom | Retail and buylist | US dollars |
| CardSphere | Retail | US dollars |
| Cardmarket | Retail | Euros |
| Cardhoarder | Retail (MTGO) | MTGO tix |

Each is kept for regular, foil and etched where the store lists it. A store's current prices are its newest saved day. A printing without a price shows "No price".

## Main price source

**Main price source...** in the View menu chooses, for your account, the store every price and value uses: TCGplayer (the default), Card Kingdom, CardSphere or Scryfall. It drives collection values, statistics, deck values, Purchases (Value now, Pulled value, Expected value), trades, the print list and sorting and searching by price. Cardmarket and Cardhoarder are shown in the card page's Prices table and chart only, since their prices are not in US dollars.

When the main source has no price for a printing and finish, the next of TCGplayer, Scryfall, Card Kingdom and CardSphere with a price is used. The card page's Prices table shows which store each price comes from. Value when pulled and Value when added keep the price they were saved with; changing the main source does not change them.

| Main source | Card Kingdom price | TCGplayer price | Scryfall price | Price used |
|---|---|---|---|---|
| Card Kingdom | $3.00 | $14.00 | $9.50 | $3.00 |
| Card Kingdom | none | $4.00 | none | $4.00 (TCGplayer) |
| Card Kingdom | none | none | $1.00 | $1.00 (Scryfall) |

## Buylist prices

A buylist price is what a store pays for a card. The buylist of a card is the highest buylist price of any store (TCGplayer, Card Kingdom) for its finish. **Buylist prices in lists** in the View menu shows each row's buylist price beside its price in collection and deck lists. The trade view always shows each line's buylist and a buylist total for each side.

## Price history

Each card database update saves the day's Scryfall prices of every printing whose price changed since the last saved day. Each day's MTGJSON prices are saved the same way for every store: a day is kept only when it differs from the day before, and a day already saved is never changed. Mana Vault's own history older than 90 days is kept.

The first time, an admin can download MTGJSON's last 90 days of every store's prices (Administration, Card database, MTGJSON), so the charts start with history; see [Administration](/about/administration).

The **Price history** tab of the card page shows one line per store for the finish chosen (Regular, Foil, Etched). The store buttons choose **US dollar stores** (every store priced in US dollars on one chart, the main source first) or one store; Cardmarket and Cardhoarder are shown on their own. Each store keeps its color; a legend names them and each line is labeled at its end. Moving over the chart shows the day and every store's price under the pointer. **Show table** lists every day with each store's price. A printing with no saved history shows "No price history yet. Prices are saved with each card database update and each day's MTGJSON prices."

## Currency

Every price and value is in US dollars. Euro prices are not stored; euro prices saved by versions before 0.17.0 are removed when the server starts with 0.17.0.

## The price of a copy

| Copy | Price |
|---|---|
| Regular | Regular price |
| Foil | Foil price |
| Etched | Etched price, or the foil price when there is no etched price |

Search results, which are not yet copies, show the regular price, or the foil price for printings that only come in foil.

## Values

| Value | Worked out as | Example |
|---|---|---|
| Row in a collection | Price of one copy times the count | 3 regular Lightning Bolt at $2.50 = $7.50 |
| Collection | Sum of every row. Copies without a price add nothing | $7.50 + $900.00 for a Shivan Dragon = $907.50 |
| Wishlist | The same sum, shown as the wanted value | |
| Proxy | No value. Proxies are left out of collection values, statistics and the trade list | |
| Deck | Each card at its printing's price, times the count, maybeboard cards left out | 4 Lightning Bolt (M10) at $2.50 = $10.00 |
| Cards to buy for a deck | Missing copies times the deck price above; see [Decks](/about/decks) | |

Collection values appear in the Collections panel and the bar above the collection's rows. Deck values appear in the deck view header.

## Sorting by price

The **Sort** list above a collection's rows orders them by Name (the default), Price, highest first, Price, lowest first, Quantity, or Set and number. Price sorts use the price of one copy; rows without a price go last. The choice is kept for your account.

## Searching by price

The filter `usd` compares a printing's price, for example `usd<1`; see [Card search](/about/card-search).

## Statistics

**Collection statistics** (the Statistics tab of the collection view) and **Deck statistics** (the Statistics tab of the deck view) show the same figures.

### Stat tiles

| Tile | Shows |
|---|---|
| Cards | Number of cards, and the number of rows (deck entries for a deck) |
| Value | Total value in US dollars, and how many cards have no price |
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

In a collection, clicking a bar (or pressing Enter on it) opens the Cards tab with only the matching rows, shown as a filter tag; see [Collections](/about/collections). Deck charts are not clickable. Deck statistics leave out the maybeboard, and start with Mana symbols and sources; see [Decks](/about/decks).

