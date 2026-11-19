# Messages

Messages appear at the right end of the status bar (on the phone, in a banner above the tabs). Confirmations are blue and disappear after a few seconds. Problems are red and stay for about seven seconds. Messages specific to search, scanning, the card database, accounts and backups are listed on those pages: [Card search](/about/card-search), [Scanning cards](/about/scanning-cards), [Card database](/about/card-database), [Accounts and access](/about/accounts) and [Storage and backups](/about/storage-and-backups).

## Confirmations

| Message | Shown after |
|---|---|
| Card name added to collection name (foil adds "(foil)") | Add to collection |
| Card name added to Deck name (with the zone when not the main deck) | Add to deck |
| Card name removed from collection name | Removing a collection entry |
| Removed N entries (M cards) from collection name | Remove selected |
| Moved N cards to collection name | Moving cards |
| New cards go to collection name | Changing the target collection |
| Collection name created, or saved, or deleted | New collection, Collection settings, Delete collection |
| You left name | Leaving a shared collection or deck |
| Missing list exported (N cards) | Exporting a missing list |
| Deck renamed to name, or Deck name deleted | Rename deck, Delete deck |
| Sent to name. It is added when they accept it. | Sending a collection or deck |
| Name accepted, or Name declined | Accepting or declining an offer |
| Offer of name to person cancelled | Cancelling an offer you sent |
| Stopped sharing with name | Stop sharing |
| Card name removed from Deck name | Removing a deck card |
| Card name moved to zone | Moving a deck card to another zone |
| Deck name created | New deck |
| Deck name opened | Opening a deck |
| Cards are added as foil, or Cards are added as regular copies | Switching Add as foil |
| New deck cards go to the main deck (or the sideboard, the commander) | Changing the target zone |
| Imported N cards from M rows (into collection name for collections) | A collection or decklist import |
| Collection name exported | Export collection |
| Deck name exported as text, or as CSV | Export deck |
| Backup downloaded | Download backup |
| Backup restored | Restore backup |
| Card database update started | Update card database |
| Card database updated with N printings | An update finished |
| Undone: change, or Redone: change | Undo or Redo |
| Filters cleared | Clear filters |
| Light theme, Dark theme, or System theme | Changing the theme |
| Workspace name, Workspace name saved, Workspace name deleted | Using, saving or deleting a workspace |
| Ribbon reset | Reset ribbon |
| Searching for card name. Check the results before adding a card. | A successful scan |

## Problems shown by Mana Vault

| Message | Cause | What to do |
|---|---|---|
| Select a card first | Add was used with no card selected | Click a card in a list |
| Open or create a deck first (Deck menu, Open deck or New deck) | Add to deck or Import decklist with no deck open | Open or create a deck |
| Open a deck first | Export deck with no deck open | Open a deck |
| There are no decks yet. Use New deck to create one. | Open deck with no decks | Create a deck |
| Enter a deck name | New deck with an empty name | Type a name |
| Deck names can be up to 100 characters | The name is too long | Shorten it |
| Enter a workspace name | Save workspace with an empty name | Type a name |
| Name is a built-in workspace. Choose another name. | Saving under Search, Collection or Deck building | Use another name |
| Type a name in the Name box first | Add or Rename in Customize ribbon with an empty Name box | Type the name, then choose Add or Rename |
| Collection name is empty, so there is nothing to export | Export collection with no entries | Add cards first |
| Create a collection first (Collection menu, New collection) | Adding, importing or exporting with no collection | Create a collection |
| Enter a collection name | New collection or Collection settings with an empty name | Type a name |
| Pick one or more rows first | Remove selected or Move selected with no rows picked | Pick rows |
| Create another collection to move cards into | Move with only one collection | Create a second collection |
| Enter a whole number from 1 to N | Move with a copy count outside the entry's copies | Enter a valid count |
| Nothing was moved | The copies were already gone, for example removed by someone sharing the collection | Check the collection |
| Collection name is not linked to any set, or Nothing is missing from collection name | Exporting a missing list that has nothing to export | Link sets in Collection settings, or there is nothing to buy |
| There are no other accounts on this server to send to | Send with no other accounts | Create another account first |
| Deck name is empty, so there is nothing to export | Export deck on an empty deck | Add cards first |
| The CSV file must be 5 MB or smaller | Collection import file too large | Split the file |
| The decklist file must be 5 MB or smaller | Decklist file too large | Split the file |
| Could not action. | The action failed and the server gave no reason, often because the server could not be reached | Check the connection and try again |

## Problems reported by the server

| Message | Cause |
|---|---|
| CSV has no card rows | The collection file has only a header, or nothing |
| CSV needs a "Name" or "Card Name" column | The first line has no name column |
| CSV can contain at most 5,000 rows per import | The file is too long; split it |
| Could not read CSV: reason | The file is not valid CSV |
| Upload a non-empty CSV file, or Upload a non-empty decklist file | The file is empty |
| Decklist has no card rows | The decklist has no card lines |
| Decklist can contain at most 5,000 rows per import | The decklist is too long |
| Deck not found, Deck card not found, Collection entry not found, Card printing not found | The item was removed, for example by another person or a restore; reload the page |
| Deck name must be between 1 and 100 characters | The deck name is empty or too long |
| Collection names must be 1 to 100 characters, Descriptions can be up to 500 characters | A collection field is too long or empty |
| These sets are not in the card database: CODES | A linked set has no printings; update the card database |
| Collection not found | The collection was deleted, or is no longer shared with you; reload the page |
| Only the owner can delete a collection. Use Leave shared collection instead. (or deck) | Deleting a collection or deck shared with you |
| Choose a different collection to move to | Moving into the same collection |
| Only the owner can share or transfer this. You can send a copy. | Sending a shared item as a share or transfer |
| Choose someone other than yourself | Sending to your own account |
| That account no longer exists | The recipient account was removed |
| Name already has this collection (or deck) | Sharing with someone who already has it |
| Name already has an offer for this collection (or deck) waiting | An earlier offer is still in their Inbox |
| This offer is no longer waiting | The offer was accepted, declined or cancelled already |
| This item is no longer available to send | The item was deleted, or the sender lost the right to send it |
| Only a copied or transferred collection can be merged | Merging a share |
| Only the owner can stop sharing with someone | Removing another person from an item shared with you |
| Choose a supported deck format | The format is not in the list |
| This request is missing its safety header. Reload the page and try again. | The page is out of date; reload it |
| The server answered with an error (code) | An unexpected server error; check the server logs |

## Rows skipped by an import

These reasons appear in the import preview and the Import review panel.

| Reason | Cause |
|---|---|
| Card name is empty | The row has no card name |
| Quantity must be a whole number from 1 to 10,000 | Collection row count is not valid |
| Quantity must be a whole number from 1 to 100 | Decklist row count is not valid, or a text line has no count |
| Unrecognized foil value "x" | The Foil column holds something other than the accepted values |
| No card with this name exists in the local catalog | The name does not match any card; check the spelling or update the card database |
| No printing matched set number | No printing has that set and collector number |
| No printing matched the supplied set and collector number | The same, for decklists |
| Theme decks need both a set and collector number | A Theme deck row has no exact printing |
| Zone must be Main, Sideboard, or Commander | The Zone column holds an unknown value |

## Sign-in page

| Message | Cause |
|---|---|
| Something went wrong. | The server refused the request without a reason |
| The server could not be reached. | The browser could not contact the server |
