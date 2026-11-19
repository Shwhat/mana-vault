# Screen layout

On screens 900 pixels wide or more, Mana Vault uses the desktop layout described first. Narrower screens use the phone layout described at the end.

## Desktop layout

From top to bottom: menu bar, ribbon, the main area (panels around the work area), and the status bar.

## Menu bar

The menu bar holds seven menus, the name of the open deck, and the account menu on the right. An amber count beside your user name shows offers waiting in your Inbox. Opening a menu and moving the pointer to another menu name switches menus. Clicking elsewhere or pressing Esc closes the menu. Items that cannot be used right now are grey. A check mark shows a setting that is on.

| Menu | Items |
|---|---|
| File | Import collection CSV..., Export collection (Moxfield CSV), Export missing list (text), Export missing list (CSV), Download backup, Restore backup..., Import decklist..., Export deck (text), Export deck (CSV) |
| Edit | Undo, Redo, Select all rows, Move selected..., Remove selected..., Find card, Clear filters |
| Cards | Scan card..., Add to collection, Cycle target collection, Add to deck, Add as foil, Update card database |
| Collection | New collection..., Collection settings..., Delete collection... (Leave shared collection... for a collection shared with you), Collection cards, Set completion, Missing cards, Send collection..., Collection sharing..., Inbox... |
| Deck | New deck..., Open deck..., Rename deck..., Delete deck... (Leave shared deck... for a deck shared with you), Main deck, Sideboard, Commander, Cycle target zone, Send deck..., Deck sharing..., Inbox... |
| View | Card search, Collection view, Deck view, Light theme, Dark theme, System theme, Filters panel, Collections panel, Decks panel, Card panel, Deck list panel, Import review panel, Save workspace..., Manage workspaces..., Reset panels, Customize ribbon... |
| Help | Keyboard shortcuts, About Mana Vault |
| Account (your user name) | Inbox... (with the number waiting), Change password..., Sign out |

Undo and Redo show the change they will reverse or repeat, for example "Undo Add Sol Ring".

## Ribbon

The ribbon has tabs of grouped buttons. A button shows an icon and a short label; pointing at it shows the full name and shortcut. Buttons that are on (such as the current view or theme) are highlighted.

| Tab | Groups and buttons |
|---|---|
| Home | Search: Find, Scan card, Clear filters. Add: Add to collection, Target, Add to deck, Add as foil. Views: Cards, Collection, Deck. Edit: Undo, Redo |
| Collection | Collection: New collection, Settings, Delete (Leave when shared with you). View: Cards, Completion, Missing. Selection: Select all, Move, Remove. Import and export: Import CSV, Moxfield CSV, Missing text, Missing CSV. Share: Send, Sharing, Inbox. Backup: Backup, Restore |
| Decks | Deck: New deck, Open deck, Rename, Delete (Leave when shared with you). Import: Import list. Export: Text, CSV. Share: Send, Sharing, Inbox |
| Database | Card database: Update database |
| View | Theme: Light theme, Dark theme, System theme. Panels: Filters, Collections, Decks, Card, Deck list, Import review. Workspace: Save workspace, Manage, Reset panels. Ribbon: Customize |
| Help | Help: Shortcuts, About |
| Deck (amber, only while a deck is open) | Target zone: Main, Sideboard, Commander (Cycle zone is available to add with Customize ribbon). Build: Add to deck, Deck, Cards. Export: Text, CSV |

The Deck tab is selected automatically when a deck is opened. The **Workspace** list at the right end of the tab row switches workspaces.

### Customize ribbon

**Customize ribbon...** opens a window with four lists: Tabs, Groups, Buttons and All commands.

- Type a name in the Name box, then use **Add** or **Rename** under Tabs or Groups.
- **Remove**, **Up** and **Down** remove or reorder the selected tab, group or button.
- Select a command and choose **Add to group** (or double-click it) to add it to the selected group.
- **Reset ribbon** restores the standard ribbon.

Changes apply at once and are saved for your account. When Mana Vault is updated to a new version, the ribbon returns to the standard layout so new buttons appear.

## Work area

The work area in the middle shows one of three views, chosen with the Home tab, the View menu or keys 1, 2 and 3. Each view has a header row with its name, a search or filter box where it applies, and a count on the right.

| View | Shows |
|---|---|
| Card search | Search results. A yellow bar under the header names the open deck, its mode and the target zone |
| Collection | The open collection, in three tabs: Cards (entries with count, move and remove buttons), Completion and Missing; see [Collections](/about/collections) and [Set completion](/about/set-completion) |
| Deck | The open deck grouped by zone, with count controls, a zone list to move cards and a remove button |

Click a row to select it; its details appear in the Card panel. Up and Down select the previous or next row. The About guide also opens in the work area and closes with **Close** or Esc.

## Panels

| Panel | Shows |
|---|---|
| Filters | Type, set code, color, rarity, legal format and mana value range filters for card search, and **Clear filters** |
| Collections | Your collections with card counts, completion bars and percentages, Shared badges, **Add here** to choose the target collection, and **New...** |
| Decks | Every deck with its mode, card count and a Shared badge for shared decks, a box to find a deck, and **New...**. Click a deck to open it; double-click to also show it in the work area |
| Card | The selected card: image, name, type, **Add to collection**, **Add to deck**, mana cost, mana value, rules text, set, number, rarity, artist, release date, and copies owned of this printing (regular and foil), of all printings, and in each of your collections |
| Deck list | The open deck in compact form by zone, with plus and minus buttons, and the Main, Sideboard and Commander target zone switch |
| Import review | The rows skipped by the latest import or import preview, with row number, card name and reason, and **Clear** |

### Moving and arranging panels

Panels sit in three dock areas (left, right and bottom) or float above the work area.

- Drag a panel's tab onto another panel's tab row to join it as a tab.
- Drag it to the top or bottom part of a panel to stack it above or below.
- Drag it to the left or right edge of a panel to place it in a new column beside it.
- Drag it to the left, right or bottom edge of the window to dock it there.
- Drop it on the work area to make it a floating window. Move a floating window by its grip strip and resize it from any edge or corner.
- A blue rectangle shows where the panel will land.
- Drag the line between panels to resize them, and the inner edge of a dock area to change its width or height.
- The **x** on a tab closes the panel. The View menu panel items open and close panels.

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
| ZONE | The target zone for Add to deck; click to cycle it |
| Message | Confirmations in blue and problems in red, at the right end |

## Phone layout

Below 900 pixels wide, the menu bar, ribbon, panels and status bar are replaced by:

- A top bar with the deck name or "Mana Vault", an **Inbox** button with a count when offers are waiting, a **Decks** button while in the deck view, and a menu button.
- The current view, filling the screen. The card search adds **Filters** and **Scan** buttons under the search box.
- A bottom tab bar: **Cards**, **Collection**, **Decks** and **More**. Decks shows the open deck, or the deck list when no deck is open.
- Sheets that slide up from the bottom: **Filters**, **Card** (opens when a card is tapped, except while picking rows), **Decks**, and **Menu** (every menu command that applies on a phone, plus Inbox, Change password and Sign out).
- In a collection, **Select** turns on checkboxes; tap rows to pick them and use the bar above the list to move or remove them. Close a sheet with **Close**, by tapping outside it, or with Esc.
- Messages appear as a short banner above the tab bar.

Panels (including the Collections panel), workspaces and ribbon customizing are desktop only; on the phone, switch collections with the list at the top of the collection view. Choices made on one layout are kept for the other.
