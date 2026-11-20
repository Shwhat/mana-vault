# Screen layout

On screens 900 pixels wide or more, Mana Vault uses the desktop layout described first. Narrower screens use the phone layout described at the end.

## Desktop layout

From top to bottom: title bar, ribbon, the main area (panels around the work area), and the status bar.

## Title bar

The title bar shows the program name, the name of the open deck, and the account menu on the right (your user name). An amber count beside your user name shows offers waiting in your Inbox. The account menu holds **Inbox...** (with the number waiting), **Change password...**, **Devices...** and **Sign out**.

## Ribbon

The ribbon is the only menu. It has tabs of grouped buttons. A button shows an icon and a short label; pointing at it shows the full name and shortcut. Buttons that are on (such as the current view) are highlighted.

- **Lists**: related commands share one button with a ▾ after its label. Clicking it opens a list of the commands; a check mark shows the one that is on. Esc or a click elsewhere closes the list.
- **Hidden commands**: a command that cannot be used right now is not shown. A group with no command to show is not shown.
- **Context groups**: some groups appear only while that part of the program is in use. Their group name is blue. The Decks tab adds Build, Check, Missing and Share while a deck is open; the Collection tab adds Selection, Layout and Wishlist while the collection view is shown. Opening a deck selects the Decks tab.
- **Import...** and **Export...** open the import and export windows; see [Import and export](/about/import-and-export).

| Tab | Groups and buttons |
|---|---|
| Home | Search: Find, Scan card, Clear filters. Views: Home, Search, Collection, Deck, Trade, Proxies. Files: Import, Export, Backup ▾ (Download backup, Restore backup...). Edit: Undo, Redo |
| Collection | Collection: New collection, Settings, Delete (Leave when shared with you). Selection: Select all, Move, Remove, Details, For trade (Mark for trade or Unmark for trade). Layout: Grid (Grid layout), Binder (Binder layout), List (List layout). Wishlist: Missing to wishlist. Share: Send, Sharing |
| Decks | Deck: New deck, Open deck, Rename, Delete (Leave when shared with you). Build: Add to deck, Target zone ▾ (Main deck, Sideboard, Commander, Maybeboard), Link copies, Tags (Tags...), Edit as text (Edit as text...). Check: Format (Deck format...), Playtest, History (Deck history). Missing: Missing to wishlist. Share: Send, Sharing |
| Trade | Open: Trade (Trade view, shown at all times). Trade: New trade (New trade...), Complete (Complete trade...), Send (Send trade...). Share: Copy list (Copy trade list), Share binder (Share trade binder...) |
| Proxies | Open: Print list, Card maker. Add to print list: Print deck (Print a deck...), Print missing (Print missing cards...) |
| View | Look: Theme ▾ (Light theme, Dark theme, System theme), Currency ▾ (Prices in US dollars, Prices in euros). Panels: Panels ▾ (Filters panel, Collections panel, Decks panel, Card panel, Deck list panel, Import review panel), Workspace ▾ (Save workspace..., Manage workspaces..., Reset panels). Ribbon: Button size ▾ (Large buttons, Compact buttons, Icons only), Customize. Card database: Update database |
| Help | Help: Shortcuts, About |

Undo and Redo show the change they will reverse or repeat, for example "Undo Add Sol Ring". The **Workspace** button at the right end of the tab row shows the current workspace; it opens a list of every workspace (a check mark shows the one in use) followed by Save workspace..., Manage workspaces... and Reset panels.

The views of a collection (Cards, Completion, Missing, Statistics) and of a deck (Cards, Ownership, Statistics, Playtest, Description, History) are the tabs in the header of that view.

### Button size

**Button size** in the View tab sets how the ribbon looks, for your account:

| Choice | Ribbon |
|---|---|
| Large buttons (the default) | An icon above a short label |
| Compact buttons | A small icon beside the label, in rows |
| Icons only | Icons without labels or group names |

### Customize ribbon

**Customize ribbon...** opens a window with four lists: Tabs, Groups, Buttons and All commands. Groups that show only in a context have it after their name.

- Type a name in the Name box, then use **Add** or **Rename** under Tabs or Groups.
- **Remove**, **Up** and **Down** remove or reorder the selected tab, group or button.
- Select a command and choose **Add to group** (or double-click it) to add it to the selected group.
- **Reset ribbon** restores the standard ribbon.

Changes apply at once and are saved for your account. When Mana Vault is updated to a new version, the ribbon returns to the standard layout so new buttons appear.

All commands also lists commands that are not on the standard ribbon but can be added to it. Their button labels are:

| Command | Button | Also reached by |
|---|---|---|
| Scan card... | Scan card | The Scan card button on Home, the Scan tab on a phone |
| Collection cards, Set completion, Missing cards, Collection statistics | Cards, Completion, Missing, Statistics | The tabs of the collection view, key 2 |
| Deck cards, Deck ownership, Deck statistics | Cards, Ownership, Statistics | The tabs of the deck view, key 3 |
| Cycle target zone | Cycle zone | Z, ZONE in the status bar |
| Import collection..., Import decklist... | Import, Import list | Import... |
| Export collection..., Export deck..., Export missing cards... | Export, Export missing | Export... |
| Export missing deck cards (text) | Missing text | Export missing on the Ownership tab |
| Mark for trade, Unmark for trade | For trade, Not for trade | The For trade button, the picked bar |
| Inbox... | Inbox | The account menu |
| Change password..., Devices..., Sign out | Password, Devices, Sign out | The account menu |

## Right-click menus

Right-clicking a card row, a collection or a deck opens a menu of what can be done with it. On a phone, a long press (half a second) opens the same menu; moving the finger cancels it.

| Row | Menu |
|---|---|
| Search result | Card page, Add to collection, Add as proxy, Add to wishlist, Add to the open deck, Add to trade (you get), Add to print list |
| Collection row, grid card or binder pocket | Card page, Copy details..., Change printing..., Move..., Mark for trade or Unmark for trade, Add to trade (you give), Add to the open deck, Add to print list, Remove |
| Deck card, in any view and in the Deck list panel | Card page, Change printing..., Link copies..., Tags..., Move to each other zone, Use as cover card, Add missing to wishlist (when cards are missing), Add to print list, Remove from deck |
| Collection, in the Collections panel or the collection switcher | Open, Rename..., Collection settings..., Send..., Export..., Delete (Leave for a collection shared with you). Rename, settings and Send are only for your own collections |
| Deck, in the Decks panel or the deck switcher | Open, Rename..., Deck format..., Send..., Export..., Delete (Leave for a deck shared with you). Rename, format and Send are only for your own decks. Deck format and Export open the deck first |

**Change printing...** opens the printing chooser: every printing of the card, newest first, with its picture, set, number and year, a button with the price for each finish the printing is made in (**Regular**, **Foil**, **Etched**), and a box to find a set, code or number. The current printing shows **Current** with its finish, and its finish button is highlighted. Choose a finish button to switch to that printing in that finish, such as the foil version of the current printing. Clicking a printing, or pressing Enter on it, chooses it in the finish in use (or its first finish when it is not made in that one).

Commands that can be used are shown in the normal text color.

## Work area

The work area in the middle shows one of six views, chosen with the Views group on the Home tab or keys 1, 2, 3, 4 and 5. Each view has a header row with its name, a search or filter box where it applies, and a count on the right.

| View | Shows |
|---|---|
| Home | Totals for your collections (cards owned, value, collections, decks), Scan cards, Search and Import buttons, offers waiting in your Inbox, and your recent scans |
| Card search | Search results as a grid of card pictures, binder pages or a list, with prices and owned counts; see [Card search](/about/card-search) |
| Collection | The open collection, in four tabs: Cards (a grid of card pictures, binder pages or a list), Completion, Missing and Statistics; see [Collections](/about/collections), [Set completion](/about/set-completion) and [Prices and statistics](/about/prices-and-statistics) |
| Deck | The open deck, in seven tabs: Cards (the format check and the cards by zone and group as a list, text, stacks or grid), Add (Quick add and a card search), Ownership, Statistics, Playtest, Description and History; see [Decks](/about/decks) |
| Trade | Saved trades: You give and You get with their searches, the balance bar and wishlist matches; see [Wishlists and trading](/about/wishlists-and-trading) |
| Proxies | The print list with sheet settings, preview and exports (Print tab), and the card maker (Card maker tab); see [Proxies and the card maker](/about/proxies) |

Click a row to select it; its details appear in the Card panel. Up and Down select the previous or next row. The About guide and the card page also open in the work area and close with **Close**, **Back** or Esc. The About guide also closes when you open a collection, deck, card or view, or select a card in a panel.

## Card page

The card page shows one card in full. It opens from **Card page** in a right-click menu, by tapping a card on a phone, and by tapping a card in the scanner.

- A banner with the card's art and a **Back** button.
- Name, mana cost, type line, power and toughness, and the rules text.
- Where you have it: each collection with its copies (and proxies), and each wishlist that wants it.
- **Versions**: every printing of the card with set, number, rarity and year, and the market price for Normal, Foil and Etched where the printing exists in that finish. The card shown is first and highlighted; tapping another printing shows it.
- **Rulings**: the official rulings for the card with their dates, or "No rulings".
- A round actions button at the bottom right: Add to collection, Add as proxy, Add to wishlist, Add to the open deck, Add to trade (you get) and Scan cards.

## Panels

| Panel | Shows |
|---|---|
| Filters | Type, set code, color, rarity, legal format and mana value range filters for the open view (card search, collection, deck or a search inside them), with a Filtering line naming it, and **Clear filters** |
| Collections | Your collections with card counts, values, completion bars and percentages, Wishlist and Shared badges, and **New...**. Click a collection to open it; it becomes where new cards go and is highlighted |
| Decks | Every deck grouped by format (Commander, Standard and the other formats, Casual last, each heading with its number of decks), with its card count and value under its name and a Shared badge for shared decks, a box to find a deck by name or commander, and **New...**. Click a deck to open it; it becomes where new cards go and is highlighted |
| Card | The selected card: image, name, type, **Add to collection**, **Add to deck**, **Add to wishlist**, **You get**, mana cost, mana value, rules text, set, number, rarity, artist, release date, flavor name, regular, foil and etched prices, copies owned of this printing (regular, foil and etched), of all printings and in each of your collections with the number for trade, and copies wanted in each wishlist |
| Deck list | The open deck in compact form by zone, with plus and minus buttons, the deck card menu on right-click, and the Main, Sideboard, Commander and Maybeboard target zone switch |
| Import review | The rows skipped by the latest import or import preview, with row number, card name and reason, and **Clear** |

### Moving and arranging panels

Panels sit in three dock areas (left, right and bottom) or float above the work area.

- Drag a panel's tab onto another panel's tab row to join it as a tab.
- Drag it to the top or bottom part of a panel to stack it above or below.
- Drag it to the left or right edge of a panel to place it in a new column beside it.
- Drag it to the left, right or bottom edge of the window to dock it there.
- Drop it on the work area to make it a floating window. Move a floating window by its grip strip and resize it from any edge or corner.
- A blue rectangle shows where the panel will land.
- Dragging a floating window by its grip works the same way: over another panel or floating window, at a panel's edge or at a window edge, the blue rectangle shows where it will land, and letting go docks all of its panels there (as tabs, split beside the panel, or in the dock area). In open space the window just moves, and its edges snap to the edges of other floating windows that are within a few pixels.
- When a panel's tabs do not fit its width, they wrap onto more rows.
- Drag the line between panels to resize them, and the inner edge of a dock area to change its width or height.
- The **x** on a tab closes the panel. The Panels list on the View tab opens and closes panels.

### Workspaces

A workspace is a saved panel layout and view. Three are built in:

| Workspace | Layout |
|---|---|
| Search | Filters above Collections on the left, Card on the right, card search view |
| Collection | Collections on the left, Card on the right, Import review at the bottom, collection view |
| Deck building (the default) | Filters and Decks above Collections on the left, Deck list above Card on the right, card search view |

**Save workspace...** saves the current layout under a name (saving with an existing name replaces it). **Manage workspaces...** lists all workspaces with **Use** and, for saved ones, **Delete**. **Reset panels** returns to the current built-in workspace, or Deck building. Built-in names cannot be used for saved workspaces.

## Status bar

| Item | Meaning |
|---|---|
| View name | The current view |
| Count | Results, collection entries or deck cards in the current view |
| Picked | Number of picked collection rows, when more than one |
| Card database | Number of printings and the date of the last update; pointing at it shows the automatic update schedule |
| Updating card database | Shown in amber while an update runs |
| Last update failed | Shown in red after a failed update; click it to read the reason |
| ADD TO | The target collection for Add to collection; click to cycle it |
| FOIL | Click to switch Add as foil on or off (highlighted when on) |
| PRICES | The currency for prices and values, USD or EUR; click to switch it |
| ZONE | The target zone for Add to deck; click to cycle it |
| Message | Confirmations in blue and problems in red, at the right end |

## Phone layout

Below 900 pixels wide, and always in the Android app, the title bar, ribbon, panels and status bar are replaced by:

- A top bar with the deck name, "Card", "Scan" or "Mana Vault", in the Android app the sync button (see [Android app](/about/android-app)), **Filters** in the collection, deck and trade views, **Trades** with a count when trades wait for your answer, an **Inbox** button with a count when offers are waiting, and the **Menu** button at the top right.
- The current view, filling the screen. Phones open on Home. The card search adds a **Filters** button under the search box.
- A bottom tab bar: **Home**, **Search**, **Collection**, **Decks**, **Trade**, **Proxies** and **Scan**. Search is card search. Decks shows the open deck, with the deck switcher at the top. Scan opens the camera scanner in place of the view (see [Scanning cards](/about/scanning-cards)).
- Tapping a card opens its card page (except while picking rows).
- **Menu** opens a sheet with one section per ribbon tab (Home, Collection, Decks, Trade, Proxies, View, Help). Tapping a section opens it; lists such as Backup or Theme open inside it. The last section, **Account**, is open and holds Inbox, Change password, Devices and Sign out; the Android app adds Sync now, Notifications and Check for updates. Commands that do not apply are not shown.
- Sheets that slide up from the bottom: **Filters**, **Menu** and the scanned list in the scanner. Close a sheet with **Close**, by tapping outside it, or with Esc.
- In a collection, **Select several cards** in **Options** turns on checkboxes; tap rows to pick them and use the bar above the list to move or remove them.
- Messages appear as a short banner above the tab bar.

Panels (including the Collections panel), workspaces and ribbon customizing are desktop only; on the phone, switch collections and decks with the switcher at the top of the view, which opens as a full sheet. Choices made on one layout are kept for the other, except the collection layout and the search layout (Grid, Binder or List), which each layout remembers on its own.

## Choice lists

Every list of choices (in windows, Options, the Filters panel, the scanner and the deck) is the app's own list: click or tap the button showing the current choice, then the choice you want. Up and Down move through the list, Enter chooses and Esc closes it. Long lists have a **Find** box at the top. On a phone the list opens as a sheet with **Close**. In a window, Enter on a list button confirms the window.
