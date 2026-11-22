# Card search

Card search finds cards in the local card database, one result per card name unless Show every printing is on. The search box and the Filters panel work together: a card must match every word, every filter in the box and every field in the panel.

## The search box

- Press **/** (or **Find**) to jump to the search box. Press Down to move from the box into the results.
- Results update a quarter of a second after you stop typing.
- Suggestions appear under the box while typing: card names for plain words, card types after `t:`, keywords after `kw:` and artists after `a:`. **Tab** moves through them (Shift+Tab back), **Enter** or a click takes one, and **Esc** closes them; Down still moves into the results. A name with spaces after a filter is put in quotes. The suggestions come from the name and keyword lists the card database update keeps, and also work offline in the Android app.
- Printings Scryfall removed are not found (see [Printing changes](/about/card-database#printing-changes)).
- A plain word matches a card whose name, flavor name, type line or rules text contains it. Several words must all match. A flavor name is the other name some printings carry, such as a Godzilla series name; results show it as "Also printed as".
- Put words in double quotes to search for a phrase, for example `"draw a card"`.
- Results are sorted by name, and load as you scroll.

## Filter syntax

A filter is a key, an operator and a value with no spaces, such as `t:dragon`. Put a minus sign in front to exclude matches, such as `-t:creature`.

| Filter | Matches | Example |
|---|---|---|
| `name:` | Card name or flavor name contains the text | `name:bolt` |
| `t:` or `type:` | Type line contains the text | `t:legendary` |
| `o:` or `oracle:` | Rules text contains the text | `o:"enters the battlefield"` |
| `m:` or `mana:` | Mana cost contains the text | `m:{R}{R}` |
| `set:` | Set code is exactly the value, or set name contains it | `set:lea` |
| `r:` or `rarity:` | Rarity is common, uncommon, rare, mythic, special or bonus | `r:mythic` |
| `c:` or `color:` | Card has all the given colors | `c:ur`, `c:red` |
| `id:` | Color identity has all the given colors | `id:wubg` |
| `c:c` or `c:colorless` | Card has no color (with `id:`, no color identity) | `c:c` |
| `mv` or `cmc` | Mana value compared with =, :, <, >, <= or >= | `mv>=4` |
| `legal:` or `f:` | Card is legal in the format | `legal:commander` |
| `is:custom` | Card is a custom card made in the card maker (`-is:custom` leaves them out) | `is:custom t:goblin` |
| `is:owned` | Any printing of the card is in one of your collections or one shared with you (not wishlists or proxies). `not:owned` is the opposite | `is:owned r:mythic` |
| `is:foil`, `is:nonfoil`, `is:etched` | The printing is made in that finish | `is:etched` |
| `is:fullart`, `is:borderless`, `is:showcase`, `is:extendedart`, `is:promo`, `is:variation` | The printing has that treatment | `is:borderless t:land` |
| `is:` and a special foil or promo type | The printing is made in it, such as `is:surgefoil`, `is:galaxyfoil`, `is:textured` or `is:prerelease` | `is:surgefoil` |
| `art:` or `atag:` | What the art shows, from Scryfall's Art Tags, including narrower tags (art:animal also finds cats) | `art:cat`, `art:dragon` |
| `role:`, `function:` or `otag:` | What the card does, from Scryfall's Oracle Tags | `role:ramp`, `role:removal` |
| `pow` or `power`, `tou` or `toughness` | Power or toughness compared with =, :, <, >, <= or >=. Cards with * or no power never match | `pow>=4`, `tou<2` |
| `year` | Release year compared with =, :, <, >, <= or >= | `year>=2020` |
| `a:` or `artist:` | Artist name contains the text | `a:"rebecca guay"` |
| `kw:` or `keyword:` | The card has the keyword ability | `kw:flying` |
| `frame:` | Frame year (1993, 1997, 2003, 2015, future) or frame effect (showcase, extendedart, etched...) | `frame:1993` |
| `border:` | Border color: black, white, borderless, silver or gold | `border:white` |
| `lang:` | Printing language: `en`, the languages chosen in Card languages (`es`, `fr`, `de`, `it`, `pt`, `ja`, `ko`, `ru`, `zhs`, `zht`) and unofficial languages such as Phyrexian (`ph`) | `lang:ja` |
| `usd` | Price compared with =, :, <, >, <= or >=. The regular price, or the foil price for printings only in foil. Printings without a price never match | `usd<1`, `usd>=20` |

Colors are W (white), U (blue), B (black), R (red) and G (green), or a color name. Mana values run from 0 to 100.

### Search messages

| Message | Cause |
|---|---|
| Unsupported search filter "x" | The key before the operator is not in the table above |
| Unknown card kind "x" | `is:` was followed by something that is not a word of letters and digits |
| x needs a comparison operator | `pow`, `tou` or `year` was followed by something other than =, :, <, >, <= or >= |
| x must be a number | The power or toughness is not a number |
| year must be four digits, such as 2019 | The year is not four digits |
| is:owned needs a signed-in account | The search ran without an account |
| x only supports the ":" operator | A text filter was used with <, >, = or similar |
| Unknown rarity "x" | The rarity is not one of the six listed |
| Invalid color filter "x" | The value contains something other than W, U, B, R, G or a color name |
| Mana value needs a comparison operator | `mv` was followed by something other than =, :, <, >, <= or >= |
| Mana value must be from 0 to 100 | The number is outside the range |
| usd needs a comparison operator | `usd` was followed by something other than =, :, <, >, <= or >= |
| Prices must be a number of 0 or more | The price is not a number, or is below 0 |
| Invalid format "x" | The format name has characters other than letters, digits or dashes |

## Filters panel

| Field | Default | Effect |
|---|---|---|
| Type | Empty | Type line contains the text |
| Set code | Empty | Set code is exactly the text, or set name contains it. The set's symbol shows beside a code it knows |
| Color | Any color | Card has the chosen color |
| Rarity | Any rarity | Common, Uncommon, Rare or Mythic |
| Legal in | Any format | Commander, Standard, Pioneer, Modern, Legacy, Pauper or Vintage |
| Name | Empty | Card name or flavor name contains the text |
| Card text | Empty | Rules text contains the text |
| Creature type | Empty | Type line contains the creature type. Types are suggested while typing |
| Keyword | Empty | The card has the keyword ability. Keywords are suggested while typing |
| Artist | Empty | Artist name contains the text. Artists are suggested while typing |
| Art shows | Empty | What the art shows (Art Tags), with suggestions from the card database as you type |
| Role | Empty | What the card does (Oracle Tags), with suggestions as you type |
| Power, Toughness | Empty | Min and Max for each |
| Mana value From and To | Empty | Mana value at least From and at most To (0 to 100, in steps of 0.5). From cannot be more than To |
| Price | Empty | Min and Max, in US dollars |
| Made in | Any finish | Printings made in Foil, Etched or Regular |
| Foil type | Any foil | Printings made in a special foil, such as Surge foil or Galaxy foil |
| Frame | Any frame | Full art, Borderless, Showcase, Extended art or Promo |
| Released | Empty | From year and To year |
| Owned | Owned or not | Owned or Not owned, by card name, as `is:owned` |

Art shows, Role, Card text and the other fields that need the card database also work on collection and deck cards: the server works out which printings match and the open view keeps only those.

The Filters panel filters the open view, and its first line names it:

| Filtering | Filters |
|---|---|
| Card search | The card search results (also when no other view is open) |
| Collection | The rows of the open collection, or of All collections |
| Deck | The cards on the deck's Cards tab |
| Deck card search | The results on the deck's Add tab |
| Trade, you give or Trade, you get | The trade search you last used |

Each view keeps its own filters. A collection's filters stay when another collection opens, and a deck's filters stay when another deck opens. **Clear filters** (also in the Edit menu) empties the filters of the open view only. Legal in uses each card's own legality, also in collections and decks. On a phone, **Filters** in the top bar opens the panel as a sheet for the collection, the deck and the trade view.

## Results

The count line after the search box shows the number of matching cards (or printings, with Show every printing), and while more are still to load, how many are loaded. More results load as you scroll, or as you turn binder pages. Leaving card search for another tab and coming back keeps the search, the filters, the results and where the list was scrolled to; owned counts are loaded again in place when cards change on another device.

**Sort** beside the search box orders the results:

| Sort | Order |
|---|---|
| Best match | The default. Cards named exactly as the search words come first (a search for sol ring puts Sol Ring at the top), then names that start with the words, then names that hold every word, then the rest, each by name |
| Name | A to Z |
| Newest, Oldest | By release date |
| Price, high to low; Price, low to high | By the price in US dollars; cards with no price last |
| Mana value | Lowest first |
| Rarity | Mythic, rare, uncommon, common |
| Color | White, blue, black, red, green, then multicolor, then colorless |
| Set | By set name and collector number |
| Owned first | Cards you own the most copies of first |

Card search, the deck's Add tab and the You give and You get searches in a trade each keep their own sort for your account.

**Options** beside the search box holds:

| Item | Use |
|---|---|
| Layout | **Grid** (the default), **Binder** (pages of nine with Previous page and Next page) or **List** |
| Card size | Small, Medium or Large, for the Grid layout |
| Show every printing | One result per printing instead of one per card name. Kept for your account |
| Done | Closes Options |

The desktop and phones each remember their own layout. The deck's Add tab and both trade searches use the same layout and card size.

| Layout | Each result shows |
|---|---|
| Grid, Binder | The card picture, an **N printings** badge when the card has more than one printing, and OWNED with every copy you own (the tooltip splits it by finish), the price when Prices on pictures is on, and the buttons (in Binder, under the selected one). Where each sits follows View, Card layout... |
| List | The image, name, mana cost, type line, set, set code, collector number, rarity, price and an OWNED badge with your copies. Clicking the set code fills the Set code filter; clicking the rarity sets the Rarity filter |

The add button names where the card goes: **+ name** of the collection or deck selected last, then **+ Wishlist**. It opens the printing chooser titled "Add card name to name" with the printing shown already selected and the finish set by Add as foil, so Enter adds it; another printing or finish can be picked first. A card made in only one printing is added at once when it has one finish; with more finishes only the finish is asked. Owned counts are real copies in your collections and collections shared with you, not wishlists or proxies.

## One result per card

Card search shows one result per card name: the newest regular printing (not a promo or variant), with an **N printings** badge and the copies you own summed over every printing by finish. Adding opens the printing chooser to pick the exact printing. **Show every printing** in the search Options brings back one result per printing; the choice is kept for your account. The You get search in a trade always lists every printing.

## The selected card

Click a result (or move to it with Up and Down) to select it. The Card panel shows its details. From the selected card:

| Action | Keys and buttons |
|---|---|
| Add one copy to where cards go (shown as ADDING TO in the status bar) | Enter, double-click |
| Add a copy to where cards go, choosing the printing and finish | **+ name**, **Add to name...** in the right-click menu |
| Add one copy to the open deck, in the target zone | Shift+Enter |
| Add one copy to the wishlist | W, **+ Wishlist**, **Add to wishlist** |
| Open the card page | **Card page** in the right-click menu; a tap on a phone |

## Empty results

When the card database has no printings, the results area says so and offers **Update card database**. Otherwise it shows "No matching cards" or "No cards found".

## The printing chooser

The printing chooser lists every printing of a card when adding it, in Change printing..., Upgrade wanted..., Find cards in a purchase, Match cards after reading a receipt, and the print list.

| Part | What it does |
|---|---|
| Find box | Narrows the printings by set name, set code, collector number, year or language. Enter takes the printing shown selected (or the first found); Down moves into the list |
| Options | Layout (Grid, List or Binder) and, in Grid, card size (Small, Medium or Large). The chooser opens in Grid; the choice is kept for your account, separate from card search |
| Grid and Binder | Each printing's picture, with its set symbol, set name, language pip, set code, collector number and year under it, and a button for each finish it is made in with its price (such as Regular $2.50 and Foil $12.00). Clicking the picture takes the highlighted finish (the current finish, or the one Add as foil chooses). The current printing is marked Current. Binder shows nine a page with Previous page and Next page |
| List | One row per printing with a larger picture, the same details and the finish buttons |
