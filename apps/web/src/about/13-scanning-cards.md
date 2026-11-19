# Scanning cards

The scanner watches the camera continuously, recognizes each card held in front of it, and collects the cards in a scanned list. Nothing is added to a collection or deck until **Add to...** is chosen.

## Opening the scanner

| Where | How |
|---|---|
| Desktop | **Scan card...** in the Cards menu, or **Scan card** in the Search group of the Home ribbon tab. The scanner opens in a large window: the camera on the left, the scanned list on the right. Close it with **Close**, Esc, or by clicking outside it. |
| Phone | The **Scan** tab in the bottom tab bar. The camera fills the screen; the scanned list opens as a sheet. Choosing another tab leaves the scanner. |

The browser asks for camera access the first time. The camera turns off when the scanner closes.

## Scanning

1. Hold a card inside the outline, flat and in good light, so that it fills most of the outline.
2. The scanner reads the card about twice a second. When it recognizes a card it adds one copy to the top of the scanned list, the phone vibrates briefly, and the message shows **Added** and the card name.
3. Move to the next card. A card that stays in view is counted once. To count another copy of the same card, take it out of view and bring it back, or choose **+1**.

Tapping or clicking the camera picture focuses on that point where the camera allows it; otherwise the camera keeps focusing automatically.

## How a card is recognized

Text recognition runs on the device. Pictures are never sent to the server; only the text read from them is.

1. The scanner reads the name line at the top of the card and the information line at the bottom left, which on cards printed since 2019 holds the collector number and set code (for example "0164 C" and "TRK EN").
2. The set code and collector number identify the exact printing when they agree with the name.
3. Otherwise the name is compared with every card name in the card database, allowing for small reading mistakes ("Lightning Bo1t" matches Lightning Bolt). Front face names of double-faced cards and flavor names (such as the Godzilla series titles) match too; a flavor name picks the printing that carries it.
4. With a name only, the scanner picks the printing in the set read from the information line when there is one, otherwise the newest printing (regular printings before promos and variants).
5. A card read by name needs two matching reads in a row before it is added; a card identified by set code and collector number is added after one.
6. When a read finds nothing, the next reads look in wider areas around the top and bottom of the outline, then for a smaller card in the middle, so a card held larger, smaller or off center is still found.

Light text on dark title bars (borderless and showcase frames) is read as well. Foil glare, sleeves with reflections and very small or blurred cards can prevent a match; **Add a card by name** covers those.

## Camera controls

| Control | What it does |
|---|---|
| **Scanned list** (phone, with the number of cards scanned) | Opens the scanned list sheet |
| **Torch** | Turns the camera light on or off. Dimmed when the camera has no light (most computer cameras) |
| **Scanner settings** | Opens the scanner settings |

## Last card strip

Under the camera, the most recently scanned card shows its picture, name, set name, set code and collector number. Below it:

| Button | What it does |
|---|---|
| **Normal** or **Foil** | Switches the card between the normal and foil finish. Dimmed when the printing exists in one finish only |
| Set code and number (for example **TRK #164**) | Opens the edit window to choose another printing |
| **+1** | Adds another copy of the card |

On the phone, tapping the card opens the scanned list.

## Scanned list

The header shows how many cards are scanned (copies, not rows). Each row shows the quantity and name, the set name, set code, collector number, the finish (**Normal** or **Foil**) and when it was scanned (for example "A moment ago" or "5 minutes ago"). The newest card is at the top. Scanning the same printing in the same finish again raises that row's quantity and moves it to the top.

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

When an edit makes two rows the same printing and finish, they are combined.

### Add to

**Add to...** asks for the destination: any collection, wishlist or deck the account owns or shares. The target collection is chosen at first.

- In a collection or wishlist, each row adds its quantity as near mint, English copies in its finish (foil rows of printings that only come etched are added as etched), up to 10,000 copies. Change condition or language afterwards with Copy details.
- In a deck, each row adds its quantity to the zone that Add to deck uses (Main deck, Sideboard or Commander). A normal deck counts cards by name; a theme deck keeps each printing.
- The whole list is one undo step, named for example "Add 5 scanned cards to Main collection".
- The added rows leave the scanned list.

## Scanner settings

| Setting | Choices | Default | Applies to |
|---|---|---|---|
| Vibrate when a card is added | On or off | On | Your account |
| New scans are foil | On or off | Off | Your account |
| Camera | Back camera or Front camera | Back camera | Your account |

A new scan gets the foil setting, unless the printing only exists in the other finish.

## Requirements and limits

- The camera needs a secure connection (HTTPS) or a local address such as localhost. Without it, cards can still be added by name.
- The first scan on a device loads the text recognition files (about 7 MB) from the Mana Vault server; the browser keeps them for later scans. No internet connection is needed.
- Recognition reads English card text. Prices, condition and language are not set by the scanner. Cards in other languages are found by their set code and collector number when the information line can be read.
- The scanner pauses while a window or the scanned list sheet is open, and while the page is hidden.

## Messages

| Message | Meaning and what to do |
|---|---|
| Starting camera | The browser is opening the camera |
| Loading text recognition | The text recognition files are loading |
| Point the camera at a card and fill the outline | Ready; no card is recognized at the moment |
| Reading card name | A card name was read once; hold the card steady for a second read |
| Added card name | The card was added to the scanned list |
| Text recognition could not start: reason | The text recognition files could not load. Reload the page; if it continues, check that the server is up to date |
| Scanning stopped for a moment: reason | A read or the match on the server failed; scanning tries again by itself |
| Camera access is unavailable. Open Mana Vault over HTTPS (or localhost), or add cards by name. | The page is not on a secure connection, or the browser has no camera support |
| Camera permission was denied. Allow camera access in your browser settings, or add cards by name. | Camera access was refused |
| No camera was found. Add cards by name instead. | The device has no camera |
| Could not start camera: reason | The camera failed to open, for example because another app is using it |
| card name added to the scanned list | Add a card by name found a card |
| No card name is close to "text" | Add a card by name found nothing close enough; check the spelling |
| Could not look up that name. | The server could not be reached |
| Enter a quantity from 1 to 999 | The edit window has a quantity out of range |
| set and number is not printed in foil (or a normal finish) | The chosen printing does not exist in the chosen finish |
| Could not load the printings of this card. | The edit window opened with the current printing only |
| N cards added to destination | Add to finished |
| Could not add the scanned cards. | Add to failed; the scanned list is unchanged |
| Create a collection first (Collection menu, New collection) | There is no collection or deck to add to |
| Scanned list cleared | Clear finished |
| Scanner settings saved | The scanner settings were changed |
