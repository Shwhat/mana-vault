# Card search

Card search finds printings in the local card database. The search box and the Filters panel work together: a card must match every word, every filter in the box and every field in the panel.

## The search box

- Press **/** (or **Find**) to jump to the search box. Press Down to move from the box into the results.
- Results update a quarter of a second after you stop typing.
- A plain word matches a card whose name, flavor name, type line or rules text contains it. Several words must all match. A flavor name is the other name some printings carry, such as a Godzilla series name; results show it as "Also printed as".
- Put words in double quotes to search for a phrase, for example `"draw a card"`.
- Up to 40 results are shown, sorted by name and then by newest printing first. Narrow the search to see more specific results.

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
| `usd`, `eur` | Price compared with =, :, <, >, <= or >=. The regular price, or the foil price for printings only in foil. Printings without a price never match | `usd<1`, `eur>=20` |

Colors are W (white), U (blue), B (black), R (red) and G (green), or a color name. Mana values run from 0 to 100.

### Search messages

| Message | Cause |
|---|---|
| Unsupported search filter "x" | The key before the operator is not in the table above |
| x only supports the ":" operator | A text filter was used with <, >, = or similar |
| Unknown rarity "x" | The rarity is not one of the six listed |
| Invalid color filter "x" | The value contains something other than W, U, B, R, G or a color name |
| Mana value needs a comparison operator | `mv` was followed by something other than =, :, <, >, <= or >= |
| Mana value must be from 0 to 100 | The number is outside the range |
| usd needs a comparison operator (or eur) | `usd` or `eur` was followed by something other than =, :, <, >, <= or >= |
| Prices must be a number of 0 or more | The price is not a number, or is below 0 |
| Invalid format "x" | The format name has characters other than letters, digits or dashes |

## Filters panel

| Field | Default | Effect |
|---|---|---|
| Type | Empty | Type line contains the text |
| Set code | Empty | Set code is exactly the text, or set name contains it |
| Color | Any color | Card has the chosen color |
| Rarity | Any rarity | Common, Uncommon, Rare or Mythic |
| Legal in | Any format | Commander, Standard, Pioneer, Modern, Legacy, Pauper or Vintage |
| Mana value From and To | Empty | Mana value at least From and at most To (0 to 100, in steps of 0.5). From cannot be more than To |

Changing a field switches the work area to the card search. **Clear filters** empties the search box and every field.

## Result rows

Each result shows the image, name, mana cost, type line, set, set code, collector number, rarity and price. Clicking the set code fills the Set code filter; clicking the rarity sets the Rarity filter. **+ Collection**, **+ Wishlist** and, while a deck is open, **+ Deck** appear when you point at a row.

## The selected card

Click a result (or move to it with Up and Down) to select it. The Card panel shows its details. From the selected card:

| Action | Keys and buttons |
|---|---|
| Add one copy to the collection | Enter, **+ Collection**, double-click, **Add to collection** |
| Add one copy to the open deck, in the target zone | Shift+Enter, **+ Deck**, **Add to deck** |
| Add one copy to the wishlist | W, **+ Wishlist**, **Add to wishlist** |
| Add one copy to the trade calculator's You get side | G, **Add to trade (you get)**, **You get** |
| Open the card page | **Card page** in the right-click menu; a tap on a phone |

## Empty results

When the card database has no printings, the results area says so and offers **Update card database**. Otherwise it shows "No matching cards" or "No cards found".
