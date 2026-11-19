# Scanning cards

The scanner watches the camera continuously, recognizes each card held in front of it, and collects the cards in a scanned list. Nothing is added to a collection or deck until **Add to...** is chosen.

## Opening the scanner

| Where | How |
|---|---|
| Desktop | **Scan card** in the Search group of the Home ribbon tab, or **Scan cards** on Home. The scanner opens in a large window: the camera on the left, the scanned list on the right. Close it with **Close**, Esc, or by clicking outside it. |
| Phone | The **Scan** tab in the bottom tab bar. The camera fills the screen; the scanned list opens as a sheet. Choosing another tab leaves the scanner. |

The browser asks for camera access the first time. The camera turns off when the scanner closes.

## Scanning

1. Hold a card inside the outline, flat and in good light, so that it fills most of the outline.
2. The scanner reads the card about twice a second. When it recognizes a card it adds one copy to the top of the scanned list with the finish, condition and language on the strip, plays a short tone and vibrates (when those settings are on), and the message shows **Added** and the card name.
3. Move to the next card. A card that stays in view is counted once. To count another copy of the same card, take it out of view and bring it back, or choose **+1**.

Tapping or clicking the camera picture focuses on that point where the camera allows it; otherwise the camera keeps focusing automatically.

## How a card is recognized

Text recognition runs on the device. Pictures are never sent to the server; only the text read from them is.

1. The scanner reads the name line at the top of the card and the information line at the bottom left, which on cards printed since 2019 holds the collector number and set code (for example "0164 C" and "TRK EN").
2. The set code and collector number identify the exact printing when they agree with the name.
3. Otherwise the name is compared with every card name in the card database, allowing for small reading mistakes ("Lightning Bo1t" matches Lightning Bolt). Front face names of double-faced cards and flavor names (such as the Godzilla series titles) match too.
4. A card read by name needs two matching reads in a row; a card identified by set code and collector number needs one.
5. When a read finds nothing, the next reads look in wider areas around the top and bottom of the outline, then for a smaller card in the middle, so a card held larger, smaller or off center is still found.

Light text on dark title bars (borderless and showcase frames) is read as well. Foil glare, sleeves with reflections and very small or blurred cards can prevent a match; **Add a card by name** covers those.

## Choosing the printing

| The card was read by | What happens |
|---|---|
| Set code and collector number | That printing is added. With a set filter, a printing from another set is not added: the message shows "Not in set: card name (SET)" in red |
| Name only | The printings that fit are the card's printings in the filter sets (all sets without a filter), without promos when Ignore promos is on. None: "Not in set: card name". One: it is added. More than one: with **Quick mode** on, the newest is added; with Quick mode off, the printing picker opens |

The **printing picker** opens over the lower half of the camera. It shows a **Filter sets** box and a row of card pictures that scrolls sideways, each with its set name, set code and collector number. Tapping a picture adds that printing. **Skip** closes the picker without adding the card. Scanning pauses while the picker is open.

## Camera controls

At the top right of the camera:

| Control | What it does |
|---|---|
| **Scanned list** (phone, with the number of cards scanned) | Opens the scanned list sheet |
| **Torch** | Turns the camera light on or off. The scanner opens a back camera that has a light when there is one, and remembers it; in the Android app, when the camera itself cannot switch its light, the phone's own light control is used. On a camera without a light (most computer cameras) the scanner shows "This camera has no light" |
| **Scanner settings** | Opens the scanner settings. A number on it shows the active filters (each set, and Ignore promos) |
| Set chips with a lock (for example **LEA**) | One for each set in the set filter. Tapping one opens the scanner settings |
| PROXY | Shown while Mark as proxy is on |

With **Display total value** on, the value of the scanned list (proxies have none) shows at the bottom left of the camera.

## The strip

Under the camera, the most recently scanned card shows its picture, quantity, name, set name, set code, collector number, Foil and Proxy when they apply, and with **Display copies in collection** on, how many copies of the card your collections already hold. Tapping it opens the card's page; the pencil opens the edit window.

Below it, the strip sets the next cards:

| Item | What it does |
|---|---|
| **Normal** or **Foil** | The finish of the next cards (the same as Prefer foil if possible). A printing that exists in one finish only gets that finish |
| Condition (NM, LP and so on) | The condition of the next cards |
| Language (EN, JA and so on) | The language of the next cards |
| **+1** | Adds another copy of the last card |

## Scanned list

The header shows how many cards are scanned (copies, not rows). Each row shows the quantity and name, the set name, set code, collector number, the finish (**Normal** or **Foil**), the condition and language when not NM and EN, PROXY, and when it was scanned (for example "A moment ago" or "5 minutes ago"). The newest card is at the top. Scanning the same printing with the same details again raises that row's quantity and moves it to the top. Tapping a row opens the card's page.

| Control | What it does |
|---|---|
| **Add a card by name** and **+** | Adds the card whose name is closest to the typed text, with the same matching as the camera |
| Edit (pencil) | Opens the edit window for the row |
| Remove (bin) | Removes the row from the list |
| **Clear** | Removes every row, after asking |
| **Add to...** | Adds every scanned card to a collection or deck |

The list is kept on this device and browser for the signed-in account, so it survives closing the scanner or reloading the page, until the cards are added or cleared.

### Edit window

| Field | Type | Notes |
|---|---|---|
| Quantity | Number | 1 to 999 |
| Finish | Normal or Foil | The printing must exist in that finish |
| Printing | List | Every printing of the card, newest first, as set name, set code, collector number and year |
| Condition | Mint to Damaged | |
| Language | Any card language | |
| Proxy | Yes or no | |

When an edit makes two rows the same, they are combined.

### Add to

**Add to...** opens a window:

| Item | Choices |
|---|---|
| Add N to | Collections: every collection and wishlist the account owns or shares, and **New collection...**. Decks: every deck, and **New deck...** |
| Name | For a new collection or deck |
| Copies go into (decks) | **New collection: deck name**, or any of your collections. Filled in with the collection used for that deck last time |

- In a collection or wishlist, each row adds its quantity with its finish, condition, language and proxy (foil rows of printings that only come etched are added as etched), up to 10,000 copies.
- In a deck, the copies go into the chosen collection first, and each row is added to the deck's target zone, linked to those copies; see [Decks](/about/decks). The collection chosen is remembered for the deck.
- Copies added to a collection lower the wants of wishlists that hold the card.
- The whole list is one undo step, named for example "Add 5 scanned cards to Main collection".
- The added rows leave the scanned list.
- New collections and decks can be made, and cards added, without a connection in the Android app.

## Scanner settings

The settings sheet opens over the camera. **Done** closes it. Settings are saved for your account at once.

| Setting | Choices | Default |
|---|---|---|
| Quick mode (takes the first matching printing) | On or off | Off |
| Play sounds | On or off | On |
| Vibrate | On or off | On |
| Mark as proxy | On or off | Off |
| Camera | Back camera or Front camera | Back camera |
| Filters: Set | Any number of sets. Type part of a set name or code, then tap the set. Each set shows as a chip; **×** removes it | None |
| Ignore promos | On or off | Off |
| Prefer foil if possible | On or off | Off |
| On screen: Display total value | On or off | Off |
| On screen: Display copies in collection | On or off | Off |

The set filter stays on until it is changed.

## Requirements and limits

- The camera needs a secure connection (HTTPS) or a local address such as localhost. Without it, cards can still be added by name.
- The first scan on a device loads the text recognition files (about 7 MB) from the Mana Vault server; the browser keeps them for later scans. No internet connection is needed.
- Recognition reads English card text. Cards in other languages are found by their set code and collector number when the information line can be read.
- The scanner pauses while a window, the picker, the settings, the card page or the scanned list sheet is open, and while the page is hidden.

## Messages

| Message | Meaning and what to do |
|---|---|
| Starting camera | The browser is opening the camera |
| Loading text recognition | The text recognition files are loading |
| Point the camera at a card and fill the outline | Ready; no card is recognized at the moment |
| Reading card name | A card name was read once; hold the card steady for a second read |
| Added card name | The card was added to the scanned list |
| Not in set: card name (SET) | The card is from a set outside the set filter; it was not added |
| Text recognition could not start: reason | The text recognition files could not load. Reload the page; if it continues, check that the server is up to date |
| Scanning stopped for a moment: reason | A read or the match on the server failed; scanning tries again by itself |
| Camera access is unavailable. Open Mana Vault over HTTPS (or localhost), or add cards by name. | The page is not on a secure connection, or the browser has no camera support |
| Camera permission was denied. Allow camera access in your browser settings, or add cards by name. | Camera access was refused |
| No camera was found. Add cards by name instead. | The device has no camera |
| Could not start camera: reason | The camera failed to open, for example because another app is using it |
| card name added to the scanned list | Add a card by name found a card |
| No card name is close to "text" | Add a card by name found nothing close enough; check the spelling |
| Could not look up that name. | The server could not be reached |
| No set matches | The picker's Filter sets box matches no printing |
| Enter a quantity from 1 to 999 | The edit window has a quantity out of range |
| set and number is not printed in foil (or a normal finish) | The chosen printing does not exist in the chosen finish |
| Could not load the printings of this card. | The edit window opened with the current printing only |
| N cards added to destination | Add to finished |
| Enter a name for the new collection (or deck) | New collection... or New deck... without a name |
| Could not add the scanned cards. | Add to failed; the scanned list is unchanged |
| Scanned list cleared | Clear finished |
