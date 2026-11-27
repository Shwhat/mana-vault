# Release notes

The installed version is shown at the top of the in-app guide.

## 0.44.0 (2026-11-27): Manual zone movement

- Drag your cards between manual zones or choose a destination, including the top or bottom of your library. Changing zones clears counters; multiplayer boards show public graveyards and exile.

## 0.43.1 (2026-11-27): Native game completion test

- Add an isolated private-engine browser test intended to play a game to completion without conceding. Live validation is pending.

## 0.43.0 (2026-11-27): Manual multiplayer outcomes

- Report your own loss in a manual multiplayer game without conceding. Tables skip eliminated players and show the remaining player when the game closes.

## 0.42.0 (2026-11-27): Manual battlefield copies

- Copy your battlefield cards as tokens in offline solo and manual multiplayer tables. Copies retain face-down status and start untapped without counters or attachments.

## 0.41.0 (2026-11-27): Engine choices and distributions

- Choose between engine-provided piles and respond to searchable list choices, including optional cancellation and special choices with an item selected.
- Distribute amounts across engine-provided options within individual and total limits.

## 0.40.0 (2026-11-27): Manual battlefield attachments

- Attach battlefield cards to other battlefield cards in solo and multiplayer manual games. Attachments clear when either card leaves the battlefield.

## 0.39.2 (2026-11-27): Engine numeric prompts

- Honor the engine's numeric prompt bounds within the workspace limit, reject invalid values and allow the player to cancel.

## 0.39.1 (2026-11-27): Engine prompt clarity

- Clarify that some choices may be missing from engine selection prompts without incorrectly saying the available pass response is unsupported.

## 0.39.0 (2026-11-27): Multiplayer face-down cards

- Play cards face down directly from hand, turn your battlefield cards face down, and reveal them. Opponents and spectators receive a hidden representation without the card's identity or artwork.

## 0.38.0 (2026-11-27): Private multiplayer library search

- Seated players can search their own library by name and move a selected card to hand in a manual multiplayer game. Results are sorted instead of revealing draw order; opponents and spectators cannot access them.
- Update the live engine UI test to pass priority when it starts before a legal land-play opportunity. Real-engine verification remains pending.

## 0.37.0 (2026-11-27): Offline solo library search

- Search a solo game's library by card name, move a selected card to hand and shuffle the remaining library without changing the saved deck.
- Browser coverage exercises an original custom card while offline. Multiplayer library search remains unavailable.

## 0.36.1 (2026-11-27): Native engine startup test

- Let the live browser test answer the engine's marked starting-player prompt before attempting to play a card.
- Record bounded UI diagnostics if the test still cannot find the playable card. Live-engine verification remains pending.

## 0.36.0 (2026-11-27): Native combat choices

- Offer the engine's available attackers and blockers, submit each chosen object to the active prompt, and confirm the declaration without applying rules locally.
- Add a single-step priority pass and label known target players and cards, including target lists supplied in engine options or card pickers.
- Mocked browser coverage exercises the responses. Full combat, targeting and a complete non-concession engine game remain unverified.

## 0.35.0 (2026-11-27): Engine ability choices and solo face-down cards

- Show engine-provided ability choices and submit the selected ability ID against the current prompt.
- Use the engine's labels for yes/no prompts so choices such as Mulligan and Keep retain their intended meaning.
- Fix the offline solo battlefield controls so cards can be turned face down and revealed again.
- Browser regressions cover ability selection and the face-down round trip with an original custom card while offline. Full native engine gameplay and multiplayer face-down controls remain incomplete.

## 0.34.0 (2026-11-27): Native Engine AI mana payment

- Read playable object IDs from the pinned Playmat `canPlayObjects.objects` map and prefer the active prompt's current view over older game state.
- During `GAME_PLAY_MANA`, show Tap for mana actions for battlefield objects the current engine view marks playable. Submit the selected object UUID against the active prompt.
- Extend the UI regression to verify prompt-bound battlefield selection and mana-source responses.
- Keep Phase 2 open: the mocked interaction does not establish a completed real game, all prompt support, targeting or combat.

## 0.33.0 (2026-11-27): Native Engine AI battlefield choices

- Add the initial Choose action for battlefield cards listed in `canPlayObjects` during `GAME_SELECT`, and browser coverage for the prompt-bound UUID response.
- The private-engine check found the ID map is nested under `canPlayObjects.objects`; the 0.34.0 update corrects the lookup before merge.
- Keep Phase 2 open: this does not verify a non-concession win, all prompts, targeting or combat.

## 0.32.2 (2026-11-27): Native Engine AI priority control

- Add a prompt-bound action to pass priority until the next main phase in the Engine AI workspace.
- Extend the private-engine browser flow to submit the priority action and wait for the next prompt.
- Keep Phase 2 open: this does not verify a non-concession win, all prompts, targeting or combat.

## 0.32.1 (2026-11-27): Multiplayer game-end acceptance

- Extend the two-player and four-player browser scenarios through concession, verifying that each game closes and connected players and spectators receive the ended state.
- These manual-table tests do not enforce Magic rules or complete Phase 4 acceptance.

## 0.32.0 (2026-11-27): Native Engine AI card play

- Show Play buttons for hand cards the Playmat engine marks playable during the player's selection prompt. Send the selected card ID as the prompt-bound response.
- Extend the private-engine browser flow to play an engine-approved Mountain before conceding.
- Keep Phase 2 open: this does not verify a non-concession win, all prompts, targeting or combat.

## 0.31.1 (2026-11-27): Multiplayer play acceptance

- Expand the two-player browser flow to reload both seated players and complete a shared turn cycle with hidden-hand assertions. The four-player flow also exercises each seat's turn and hand privacy. Verify original custom-card solo play while the browser is offline.
- Keep the overall Phase 4 gate open until full-game and reconnect acceptance is complete.

## 0.31.0 (2026-11-27): Native Play engine controls

- Add a native concession control to current Playmat prompts and a browser acceptance flow that starts a saved-deck game, answers the opening-hand prompt and observes the engine-reported terminal result.
- Run the browser acceptance flow against the pinned private Playmat service in the Play engine integration workflow.
- This does not complete Phase 2: the acceptance flow ends by concession and does not verify a non-concession win, all prompts, spell casting, targeting or combat.

## 0.30.1 (2026-11-27): Play Table acceptance coverage

- Add browser coverage for moving an original custom card through an offline manual game and completing a four-player turn cycle with viewer-specific hand visibility.
- Keep the Play Table phases 2 through 4 status explicit; this test coverage does not complete their acceptance gates.

## 0.30.0 (2026-11-27): Native Play workspace and manual tables

- Add a top-level Play workspace with optional Engine AI, offline manual solo and private manual Commander table modes, linked from saved decks and phone navigation.
- Add server-stored two- and four-player tables with invitation codes, revision-checked actions, reconnect polling, read-only spectators and player-specific views that omit opponents' hands and libraries.
- Add manual actions for drawing, shuffling, zone movement, taps, counters, tokens, life, poison, commander damage, turn changes and concession. Manual play does not enforce Magic rules.
- Keep the Play mode tabs compact on phones. Add offline custom-card coverage and two- and four-player browser flows for reloads, hidden hands, battlefield actions, turn changes, and phone layout.
- The Play workspace is an initial implementation, not completion of Play Table phases 2 through 4. Engine AI requires a separately configured Playmat service and supports only the prompts shown in the UI. Match history, full manual interactions, production deployment and engine reconnect or outage recovery remain unimplemented or unverified. PR CI validated the private Compose profile, unpublished engine ports, saved-deck hidden-state behavior and trusted-header isolation.

## 0.29.0 (2026-11-26): Server-side Playmat game integration

- Add authenticated per-user Playmat sessions and server routes for engine discovery, exact-printing saved-deck validation, private AI table startup, player game events and fresh prompt responses.
- Close engine sessions on logout, account deletion or disablement, password reset, sign-out everywhere, and removal of the last valid device or session.
- A live integration test completed an AI game from a saved exact-printing deck and verified the saved deck stayed unchanged. The event wait race is fixed.
- This is not a playable user interface. The live test used a session-local engine on loopback; Docker, private-network identity isolation, hidden-state isolation and reconnect behavior remain unverified. Phase 1 is not complete, and later phases remain gated.

## 0.28.0 (2026-11-26): Play engine integration foundations

- Add server-side protocol transport, opaque account identity mapping and exact-printing deck conversion as internal foundations. No play screen, engine deployment or playable game is included.

## 0.27.0 (2026-11-26): Play table deck snapshots

- Add an internal, access-checked snapshot of saved deck data for future play integration. Playable tables and engine integration are not yet available.

## 0.26.0 (2026-11-25): Play table foundations

- Add shared play-table contracts and initial Playmat protocol parsing, with an architecture assessment and roadmap. Gameplay and engine integration have not yet been added.

## 0.25.0 (2026-11-25): Trades and dashboard

- Choose the source collection for cards you give and save your destination before countering an account trade.
- Browse other accounts' marked-for-trade cards and add them to a trade.
- Group multiple deck picture statuses into a compact hover, focus or tap control.
- Show recent collections and decks and trade activity on Home, and fix light-theme menu text contrast.

## 0.24.8 (2026-11-25): GitHub guide

- Publish the in-app About guide to the GitHub wiki, with updates synchronized from the guide on main.

## 0.24.7 (2026-11-25): Sealed product contents

- Preview and add known fixed cards and decklists from matched sealed products to a purchase opening; random contents are not guessed.
- Recognize Foundations Beginner Boxes and Starter Collections, and allow their included pack count to be entered.

## 0.24.6 (2026-11-25): Scryfall rulings

- Fixed rulings downloads for Scryfall's current compressed JSON Lines format. Update the card database to load rulings.

## 0.24.5 (2026-11-25): Commander deck openings

- Select a catalog precon and add its decklist when opening an unmatched Commander deck or to an existing opening.

## 0.24.4 (2026-11-24): Custom cards and purchase fixes

- Custom card fields and saved previews open while their artwork loads.
- Receipt matching recognizes named special foils, prefers ordinary foils for plain foil notes, and warns about mismatches.
- Purchase product selectors and names stay stacked and aligned.

## 0.24.3 (2026-11-24): Library, purchases and scanner improvements

- Custom cards can be linked to an official card and appear among its printings.
- Decks show color identity and possible themes, can be created from a precon, and can create a collection when adding a deck.
- Pack openings can be paused and resumed. The built-in About guide is also available as a movable Wiki page.
- Purchase fields no longer have status text over the input, custom set symbols appear in the set picker, and purchase history scrolls in narrow panes.
- Adding a card to a wishlist offers its printings and finishes. With a set filter, the scanner matches the selected language and warns when it is unavailable.

## 0.24.1 (2026-11-23): Scryfall online search

- Search syntax in the Filters panel can use Scryfall online, with the other Mana Vault filters applied locally. Scryfall's grouping, ordering, printing preferences and display options are supported; see Card search for API and offline limitations.
- Local search supports collector-number comparisons, including `set:neo cn>=294 cn<=303`.
- Unsupported local `is:` categories now report an error instead of silently searching unrelated promo types.

## 0.24.0 (2026-11-23): Card search syntax

- The Filters panel has a Search syntax field, combined with the search box and the other filters for each view.
- Card search supports more Scryfall-style syntax locally: grouped alternatives, negation, exact names, color comparisons and names, rarity shortcuts and odd or even mana values. The supported subset is listed in Card search.
- The phone can apply supported syntax to its downloaded collection and deck cards while offline; filters that need server-only data still require a connection.

## 0.23.1 (2026-11-23): Type group order

- Type groups are shown in the order Moxfield uses: Planeswalkers, Creatures, Sorceries, Instants, Artifacts, Enchantments, Battles, Lands, Other. This applies to decks and to every list grouped by Type.
- Fixed: on a phone, the deck's All, Commander, Main, Sideboard and Maybeboard buttons stretched to fill the screen and pushed the cards out of view.

## 0.23.0 (2026-11-23): Web pages into notes

- Paste part or all of a web page into a notes page: headings, lists, tables, links and pictures come along, simplified, and the pictures are copied to the server (Copying N pictures shows while they are copied).
- New page from web address... (Wiki header From web address..., File menu, and New child page from web address... on a page): the server fetches the page, the main article is kept, its pictures are copied, and the page starts with a Source line.
- Import markdown... is now Import pages... (and Import pages here...) and also takes .html files and pages saved from a browser with their pictures folder, alone or in a zip.
- Colors, fonts, columns and boxes are dropped; embedded videos, maps and sounds become links; pictures that cannot be copied stay as links.
- The server never fetches addresses on its own network (localhost, private and local addresses).
- Android app: pictures pasted offline stay as links and are copied when the connection returns or the page is opened online.

## 0.22.0 (2026-11-22): Notes and the Wiki

- Notes: decks and collections have a Notes tab with a tree of pages. A deck's Description tab is now its Notes tab: the description is the text of the deck's top page, and the Cover card and Format are at the top of the tab.
- Editor: pages are edited as formatted text with a toolbar (headings, bold, italic, strikethrough, code, lists, checklists, quotes, code blocks, dividers, tables, links, page links, card links and pictures) and typed shortcuts, saved by themselves 1 second after the last change, and stored as markdown.
- Page links (`[[Page title]]`, or typing `[[`) open the page, or make it when it does not exist; renaming a page changes the links to it; each page lists the pages that link to it. Card links (`[[card:Card name]]`) show the card's picture when pointed at and open the card page.
- Pictures are pasted, dropped or chosen and kept on the server; large pictures are made smaller first.
- Wiki tab (key 7, the Wiki button on the phone's Home screen, Wiki view in the View menu): search every page, Pinned and Recent pages, the Decks and Collections with notes, and My pages for pages not attached to anything. Drag a page to reorder it or put it under another page; Move to... does the same from the right-click menu.
- Templates: Deck primer, Combo, Sideboard guide and Collection plan are built in; Save as template... adds your own, and Templates... renames and deletes them.
- History... lists each page's versions with Restore. When someone saved a page while you were editing it, you choose Keep mine, Keep theirs or Keep both.
- Notes follow the sharing of their deck or collection. Deleting a deck or collection deletes its notes.
- Import markdown... (Import pages... since 0.23.0; and Import markdown here... on a page) reads .md files or a zip (such as an Obsidian vault) with pictures; Export notes... saves a page with its child pages, a deck's or collection's tree, or the whole Wiki as a zip of .md files with pictures. A deck exported as a Plain text list ends with its notes as `//` lines.
- Android app: notes are kept on the phone and can be read, searched and changed without a connection; pictures added offline are sent with the changes.
- Backups include notes pages, their versions and pictures, pins and templates.
- Each deck's existing description becomes its top notes page when the server starts with this version.

## 0.21.0 (2026-11-22): MTGJSON data, store prices, precons, booster values and tabs that keep their place

- MTGJSON: each card database update also keeps MTGJSON's data on the server: every printing's record (matched by Scryfall id), booster contents, sealed product contents and barcodes, TCGplayer SKUs and the keyword and card type lists weekly, and every store's prices daily. Administration, Card database has an MTGJSON section with each part's count, size, date and last result, Update MTGJSON data now and Update prices now.
- Prices from TCGplayer, Card Kingdom, CardSphere, Cardmarket and Cardhoarder, retail and buylist, for each finish. Main price source... in the View menu chooses, for your account, the store every price and value uses (TCGplayer by default), falling back to TCGplayer, Scryfall, Card Kingdom and CardSphere.
- Price history: 90 days of every store's prices can be downloaded once (Administration shows its size first, or Skip); each day's prices are added from then on. The card page's Price history has one line per store, with a store picker, a legend and a table.
- Card page: a Prices table with every store's retail and buylist prices, an Oracle and Printed switch for text changed since printing, the formats a card can lead, and Found in (the products and precons a printing comes from).
- Buylist: the trade view shows each line's buylist and each side's buylist total; Buylist prices in lists (View menu) adds it to collection and deck lists.
- Precons: Add precon as deck... and Add precon to collection... in the File menu.
- Purchases: Scan barcode... starts a purchase with the product found by its barcode; Expected value of booster packs on product lines and openings; Open virtual packs...; a card a pack cannot hold is marked ("Not found in Play booster, Foundations").
- Purchases: Change collection... on a pack (entry page, right-click, status bar and scanner), moving the cards already pulled or leaving them, for this pack or the packs not yet reached, as one undo step.
- New collection... at the end of every list that chooses where cards go.
- Search: `is:reprint`, `is:starter`, `can:commander`, `can:oathbreaker`, `can:brawl`, `store:`, `buylist` and `in:`; all but `in:` also work offline on the phone.
- Decks: the commander check uses MTGJSON's list of which formats a card can lead.
- Imports match the exact printing by a TCGplayer, Card Kingdom or CardSphere id, or a TCGplayer SKU (with its condition and language).
- Every tab opens where it was left, with its card page, filters and scroll position; pressing the tab already shown goes back to its first screen. A deleted purchase entry opens History.
- Custom sets: a PNG or WebP main symbol with a transparent background gets rarity colors too; Common symbol can be White. Changing them draws the set's card pictures again.
- Card maker: the Custom sets... button under the find box is gone; custom sets are in the Custom sets tab.
- MTGJSON's data appears after the first card database update with this version (or Update MTGJSON data now in Administration).

## 0.20.0 (2026-11-22): Named products and the Custom sets tab

- Purchases: every product line has a Product name, such as "Landing Party" for a Commander deck or "Beam Me Up Bundle". The list under the field holds the named products of the line's set and product, downloaded from MTGJSON with each card database update; any other name can be typed. The separate name of Other lines is now this field.
- Read receipt: the product name is read from the product line ("Magic the Gathering: Star Trek: Commander Deck: Landing Party" gives Landing Party) and matched to the set's named products.
- Purchases: Open... on a named Commander deck with a decklist adds the deck's cards to the collection, in the decklist's printings and finishes, and ties every card to the opening in one step. Undo takes them out again.
- Purchases: opening names, the product table, the opening list and the history use the product name ("Landing Party, Star Trek Commander (Purchase of Nov 20)").
- Custom sets: a Custom sets tab beside Print and Card maker, laid out like the card maker, with the set list, the set's fields, a sample card and the set's cards. The Custom sets window and the Edit set window are replaced by it.
- Custom sets: a symbol for each rarity (Common, Uncommon, Rare, Mythic rare, Special) besides the main symbol; a card uses its rarity's symbol when there is one. Backups include them.
- Named products appear after the first card database update with this version.

## 0.19.1 (2026-11-22): Receipts with names that wrap

- Fixed: a product name that wraps over several rows of a receipt (such as "Magic the Gathering: Star Trek: Commander Deck: Landing Party") was cut to its first row, so the Commander deck became an Other line with no set; the rows are now joined into one line.
- Fixed: "Subtotal · 3 items" read as "Subtotal3 items" became a product line; Subtotal is now always skipped.
- Fixed: Bought from took a product name (and the text on the product's picture) from a cropped screenshot; it now comes only from rows above the first price that are not product names, and stays empty otherwise.

## 0.19.0 (2026-11-22): Printing chooser views, packs one at a time, Match cards and picking in purchases

- Printing chooser: Grid (the default), List or Binder with a card size, through Options in the window and kept for your account. Grid and Binder show each printing's picture with its set, number, year and language, and a finish button with its price for each finish.
- Fixed: the set symbol beside a printing's set name in the printing chooser was drawn at full size.
- Card layout: Finish lines (REGULAR 1, FOIL 1 under a picture) is an item that can be placed or hidden. Hidden, a click on a picture of more than one kind of copy asks which one. Saved layouts show Finish lines where they were.
- Undo and Redo arrow buttons in the top bar after the Help menu, and in the phone's top bar, with the change in the tooltip.
- Purchases: check boxes, Ctrl+click and Shift+click pick several rows. History has Delete picked...; an entry's cards have Remove picked from pack... and Move to pack..., each one undo step.
- Purchases: Add existing copies... chooses a collection (the opening's to start with) and lists its free copies in List, Grid or Binder, with Show all, Select all and a count per copy, tied as one undo step.
- Read receipt: lines that are single cards go to a Match cards step with the printing guessed from the set, version (Showcase, Borderless, Extended Art), finish and condition, to confirm, choose another printing, find the card or keep as a product.
- Read receipt: the order date instead of today or a pickup date, Taxes and Pickup into Tax and Shipping, order page buttons (Buy again, Track all your orders) ignored, the order number in the Note, and sets found in product names (Star Trek, The Hobbit, Commander decks).
- Purchases: Open... on a product with packs asks how many packs. Each pack is its own opening (Pack 1 of 36); Next pack moves on, from the entry page, the status bar, the Purchases header and the scanner. Move to pack... fixes a card scanned into the wrong pack. Each pack and each product shows Pack cost, Value when pulled, Pulled value, Value now and Gain or loss.
- Openings of products with packs from before 0.19.0 are counted in packs; a box counts as opened from its first pack and its packs not yet opened keep their share of its value.

## 0.18.0 (2026-11-22): Card layout, live updates, scanning into an opening and pulls that stay on their pack

- Card layout (View menu): drag the count, printings, finish, status marks, price and buttons to the corners of a card picture, the row under it, a second line or the bottom, or hide them. One layout for every section, or one per section (Card search, Collections, Decks, Trade, Proxies). By default the pips sit in one row with the price at its right and the buttons line up at the bottom of every card.
- Card search pictures show one OWNED pip with every copy you own; the separate FOIL and ETCHED counts are gone (the tooltip still splits them by finish).
- Live updates: changes made in the app, on another device or by someone sharing a collection or deck show on open pages within a second or two, without reloading. Theme, card layout, groupings, sorts, scanner settings, the proxy sheet and saved workspaces follow the account at once.
- Opening a pack on the web page and scanning on the phone: the phone's scanner shows Scanning into: name and fills in the opening's collection; the open app asks to start scanning; the background check shows Opening started with Start scanning.
- Purchases: a card added to a pack stays on it until **Remove from pack...** on the entry page, which keeps or deletes the card. A copy deleted from its collection stays listed as Gone, and the remove question says which pack it came from. Only an undo of adding a card takes it off the pack.
- Purchases: each pack shows Value when pulled (the price on the day each card was added, fixed), Pulled value (every pull at today's price) and Value now (the pulls still held). Single cards show their price when added. Ties from before 0.18.0 take their Value when pulled from the price history.
- Purchases: the entry tables and the history are grids with bordered cells, a heading row that stays in view, numbers right aligned and Finish, Value when pulled and State columns.
- Clicks: in the Collection and Decks tabs one click in the switcher or the panels opens a collection or deck. In Search and the other tabs one click picks it as where cards go and only a true double click (or a double tap) opens it. Coming back to Search keeps the search, the results and the scroll position.
- A card with one printing skips the printing chooser: one finish adds it at once, more ask only for the finish.
- Workspaces moved from the View menu to the account menu.
- Fixed: Administration's account rows ran under the right side panel; the page now scrolls inside its own area and the buttons wrap.
- Fixed: a single card bought in a purchase showed In collection after it was deleted; its State now says where it is.

## 0.17.1 (2026-11-22): Backups marked with the app version

- Account backups are marked with the Mana Vault version that made them, instead of a separate backup number. A server restores backups from its own version and earlier, and refuses a backup from a newer version with "This backup was made by Mana Vault X. Update this server (Y) to X or later to restore it."
- Backups made before 0.17.1 (numbered 1 to 7) restore as before.

## 0.17.0 (2026-11-21): Purchases, list views and the card maker

- Purchases: single cards are chosen with **Find cards** (card search with pictures and every printing), **Scan** (the scanner with This purchase as the target) or **From scanned list...**, never typed.
- Purchases: the set of a product line is chosen from a searchable list with symbols and codes in capitals.
- Purchases: **Read receipt...** reads a photo, PDF or screenshot into a new purchase. The receipt is kept with the entry and can be viewed, replaced or removed.
- Purchases: places are shared by every account on the server in **Places...**. Any account adds and edits places; admins merge (with undo) and delete them. Renaming a place changes every entry that uses it.
- Purchases: each sale says who paid the shipping. Buyer paid shipping (the default) leaves the shipping out of the money in; I paid shipping takes it off. Fees always lower the gain.
- Purchases: trade entries show Gave, Got, Net and Original cost, with a From column for the cards given.
- Purchases: an opening has **Add cards**, **Scan**, **Add existing copies...** and **Done opening**. The opening chip and OPENING in the status bar open its entry, and ADDING TO names the opening.
- Purchases: tied cards follow their copies when they move to another collection or change printing.
- List views in decks, collections, All collections, card search and the print list: Group by Type, SubType, Type and Tag, Rarity, Color, Color Identity, Mana Value, Set, Artist or No grouping; Sort by Name, Mana Value, Price, Rarity or Color; mana symbols as pictures; groups in columns on wide screens; folding headings; and a menu button on each row.
- Decks: **Send to print list...** in the deck menu asks for the whole deck, the missing cards only or chosen zones.
- Decks: a missing card whose copies fill other decks shows **In Deck name**, with **Move to this deck**.
- Change printing: how many to change is its own first step, starting at 1.
- Wishlists: when an added card is on more than one wishlist, a window asks which wishlist to lower, with None. A batch asks once.
- Undo of removing deck cards links the same copies again, for 60 minutes after the remove.
- Prices are in US dollars only. The currency switch, the PRICES status bar item and the `eur` filter are removed, and stored euro prices are deleted when the server starts.
- Card maker: the Showcase Nickname style, hybrids in every style, a Legendary crown and Power and toughness box (Automatic, On or Off), a Vehicle frame, a Split card kind, the saga layout, **Choose frame...** with pictures of every style and frame, and bundled open-licensed card fonts.
- Card maker: the card list is grouped under custom set headings with the set's right-click menu, and the card maker opens on the card opened last.
- Card maker on phones: one page that scrolls, with buttons spaced for fingers.
- Art library: one library for the server. Each picture shows who added it; that account or an admin can rename or delete it. **Upload art...** takes several files at once. The first start joins every account's library, keeping one copy of each picture.
- Set completion: child sets are listed under their parent set.
- Phones: rows of tabs and buttons wrap instead of scrolling sideways, and the pips under card pictures are laid out on tidy lines with the price on its own line.
- Android app: sharing a CSV or text file into the app opens the Import window; a picture or PDF offers **Read receipt...**.
- Android app: changes waiting to be sent are synced in the background as soon as the phone is online, even when the app is closed.
- Android app: card search offline supports the full search syntax, except art and Oracle tags.
- Android app: connects over https only.
- Android app: the update check asks your own server, and the download comes from your server.

## 0.16.1 (2026-11-21): Symbols and suggestions keep the field you chose

- Fixed: after a symbol or a suggestion was put in a field, choosing another field right away could move the cursor back, so the next symbol went into the mana cost instead of the rules text. The field chosen last keeps the cursor.
- The Symbols window also follows a field reached with the keyboard.

## 0.16.0 (2026-11-21): Purchase history

- Purchases mode tab (key 6; on phones a Home button and Purchases view in the Menu) with Summary, History and entry pages.
- Purchases with one line per product (boosters, boxes, bundles, decks, kits, Secret Lairs, single cards, other), set, quantity, cost each or total, packs in it; tax and shipping spread over the lines by cost.
- Single cards bought go into a chosen collection with their purchase price, tied to the purchase.
- Open... turns part of a line into an opening: cards added to its collection from search, Quick add, the scanner, pasted lists and imports are tied to it until Done opening. OPENING shows in the status bar. Openings show the value pulled and per pack.
- Set current value... keeps a dated value for sealed product.
- Card sales (Sell... on a collection card, Sell selected cards..., or a find box) remove the copies sold; product sales take sealed product. Deleting a sale puts them back.
- Completed trades are recorded as Trade entries for each account; undo of a trade removes the entry.
- Imports with purchase prices ask One purchase for this import, One purchase per date added or Do not record a purchase; Make purchases from imported prices... does the same for copies already imported.
- Spent, Received, Value now and Gain or loss for a period, and a chart of money spent against the value of what it bought, using the saved price history.
- History with find, kind, product, set, date range and sort; CSV export of entries or lines (Export purchase history... in the File menu).
- Every change to the purchase history can be undone. Account backups are version 7 and include it.

## 0.15.0 (2026-11-21): Pip bar, custom set editing, art library, Scryfall extras and card languages

- Pip bar: every card picture has a bar under it (above each picture in deck Stacks) holding the count, finish, condition, language, Proxy, trade, Missing, owned marks and price pips, so pips no longer cover the card.
- Android app: one tap opens a collection or deck from the panels and switchers; the open one is where new cards go. Browsers are unchanged.
- Fixed: a custom card saved again in the card maker now shows the new picture in the print list, card search and printed pictures without reloading.
- Custom sets: right-click menu with Edit set..., Show its cards, New card in this set and Delete.... Edit set changes the name, code (the cards move to the new code), release date and symbol, and can be undone.
- Set symbols can be uploaded as SVG (cleaned of scripts and links), chosen from Scryfall's set symbols, or removed. SVG symbols are drawn in rarity colors (on by default, per set).
- Card maker: one Symbols button on the face heading line opens a floating Symbols window (a sheet on phones) that puts the symbol at the cursor of the mana cost or rules text used last. Fixed: symbols chosen for the rules text went into the mana cost.
- Art library: each account keeps art for the card maker; upload, use, rename and delete. Art used on custom cards is added, including the art of every custom card made before.
- The card database update also saves set symbols and set details (parent set, block, digital, foil only), Scryfall's symbol list, printing changes, name and keyword lists and the card back. Administration, Card database lists each part with its count and date.
- Set symbols show in the Filters panel, set pickers, set completion (grouped by block), the card page and the printing chooser. Rules text and mana costs on the card page show symbols as pictures.
- Printing changes: merged printings move copies, deck cards, links, upgrade choices, trade lines, print list lines and price history; removed printings show Printing removed with Change printing. The update reports "N printings merged, N removed" and writes each change to Activity.
- Suggestions while typing: card names, t: types, kw: keywords and a: artists in card search; names in Quick add and the scanner's Add a card; names, types and keywords in the card maker; types, keywords and artists in the Filters panel. They work offline in the Android app.
- Card backs (print list sheet settings): None, Standard back or an uploaded back. The PDF adds a mirrored back page after each page; the MakePlayingCards zip includes back.jpg.
- Card languages (Administration, Card database): English and unofficial languages (default), All languages or Chosen languages, with the download and database growth shown first; Pictures of other languages is off by default. The printing chooser shows a language pip.
- Account backups are version 6 and include the art library and the uploaded card back.

## 0.14.0 (2026-11-20): Menu bar and mode tabs, card maker styles, reliable proxy pictures

- The ribbon is replaced by the File, Edit, View and Help menus in the title bar. Customize ribbon and the button size setting are gone. Commands for one collection, deck, card or trade are in its right-click menu, header or view; collection and deck right-click menus gain Sharing....
- Mode tabs Home, Search, Collection, Decks, Trade and Proxies under the title bar switch the program to that part. On a phone the bottom bar stays and the Menu has File, Edit, View and Help sections.
- Prices on pictures (View menu, off by default) shows a price pip on card pictures in every picture view.
- The print list has Sort (Order added, Name, Set, Mana value, Rarity, Color, Price, Count) and Options (List, Grid or Binder, card size). The preview, PDF and pictures follow its order.
- Card pictures for proxies are fetched three at a time and tried twice, and the server uses the large or normal picture when the full-size one cannot be had. Cards still without a picture are listed before the file is made, with Try again and Make it anyway.
- The card maker has a mana symbol picker for the mana cost and the rules text, and the Style choice: Classic, Borderless, Full art, Showcase and Nickname (with a Nickname field).
- Fixed: on a phone the card maker's preview was cut off. The whole card now shows small at the top, and a tap shows it full size.
- Fixed: deleting an account with Delete everything, or Move them, then delete, closed the second question at once and deleted nothing. Any window that asks a second question right after the first now stays open.
- Fixed: a card picture that failed once in the print preview stayed missing and printed as a white card in the PDF.

## 0.13.1 (2026-11-20): Faster card search

- Fixed: card search loaded slowly. A search that shows one result per card now reads the card database once instead of twice and sorts only the columns it needs, so results come back in about half the time.
- Fixed: the Owned first sort counted your copies again for every matching card; it now counts them once per search.

## 0.13.0 (2026-11-20): Select with one click, search sorting, zone views and Add deck to collection

- One click (or tap) on a collection or deck in the Collections panel, the Decks panel or a switcher makes it where new cards go without opening it, so a card search stays open. A double click (or double tap) opens it. The switcher list stays open after one click and marks the chosen one Adding here.
- Sort in card search, the deck's Add tab and both trade searches: Best match (the default, exact names first, so sol ring puts Sol Ring at the top), Name, Newest, Oldest, Price high to low or low to high, Mana value, Rarity, Color, Set and Owned first. Each search keeps its own sort. The Android app sorts offline searches the same way.
- The You give and You get buttons, the Add to trade menu items and the T and G keys are gone; cards are added to trades in the Trade view. Mark for trade and the trade binder stay.
- Card pictures show no prices. Collection Grid and Binder, All collections, deck Grid and Stacks and search pictures show pips on the picture for the count, FOIL, ETCHED, Missing, Proxy, condition, language and copies for trade. Lines under a picture appear only when it stands for more than one kind of copy, with pips and counts. The Total line is gone. List views keep their prices.
- Zone buttons All, Commander, Main, Sideboard and Maybe above the deck's cards and in the Deck list panel: each shows only its zone and makes it where Add puts cards; All shows every zone and adds to Main. Z and the Target zone list on the Decks ribbon tab cycle the same choices.
- Add deck to collection... (Decks ribbon tab, the deck's Add tab, deck right-click menus): adds the deck's missing cards, or every card as new copies, to a chosen collection in the deck's printings and finishes, links the missing cards to them, and is one undo step.
- Ctrl+N no longer opens New deck....

## 0.12.0 (2026-11-20): Administration, full card data offline and card pictures on the server

Before updating a Docker install: create the pictures folder on the Docker host (`sudo mkdir -p /opt/mana-vault/pictures` and `sudo chown -R 65532:65532 /opt/mana-vault/pictures`). Remove MANAVAULT_SIGNUP and MANAVAULT_CARD_UPDATE_INTERVAL_HOURS from the stack's environment to manage them in Administration. After updating, run Update card database once.

- Admin role: the first account on a new server is the admin; on an updated server the oldest account is. Update card database is for admins.
- Administration (account menu, admins only) with Accounts, Sign-up, Card database, Pictures, Storage and backups, Devices, Security, Server and Activity pages. Settings set by an environment variable are locked and show which one.
- First-run Setup for the admin: the card database, picture sizes with estimated download sizes and free space, and the picture folder. Every step can be skipped.
- Accounts: create accounts with a temporary password that must be changed at first sign-in, reset passwords, turn accounts off, make admins, sign out everywhere, and delete an account or move its collections and decks to another.
- Sign-up is open, by one-time invite code, or closed. The sign-in page asks for the invite code and shows the minimum password length.
- Whole-server backups on a schedule or at once, kept to the newest N, with download, delete and restore (from the list or a file).
- Security settings: sign-in length, sign-in attempts and minimum password length. Server page: version and update check, uptime, Scryfall check, server name (shown in the title bar) and the server log. Activity lists sign-ins, failed sign-ins and admin changes.
- Card pictures kept on the server: choose small, normal, large, PNG, art crop and border crop separately, each with an estimated size (Measure sizes checks a sample). Downloads run in the background after each update and fetch only new or changed pictures, with pause, resume, a minimum free space (10 GB by default) and progress in the status bar. The picture folder can be moved (copied, checked, then used). A missing folder never deletes or downloads anything again. The Android app uses the server's pictures. Docker gets a second volume for pictures.
- Card search shows one result per card name with the newest regular printing, an N printings badge and owned counts by finish; Show every printing in Options brings back one result per printing.
- One add button, Add to name, follows the collection or deck selected last and opens the printing chooser with the shown printing selected, so Enter takes it. A card with one printing and one finish is added at once. The Foil and Etched add buttons, Add as on the deck's Add tab and the Target mark are gone; Adding here is the only mark.
- Collection Grid and Binder, All collections, and deck Grid show one picture per printing with a line per finish (and per condition or language) giving count and price, and a Total line. Deck Stacks show one picture per printing. Search results show owned counts by finish under the picture.
- Special foils such as SURGE FOIL are named on finish marks and in the printing chooser, with a Foil type filter and `is:surgefoil` style search words.
- New filters wherever the Filters panel works: Name, Card text, Creature type, Keyword, Artist, Art shows (Art Tags), Role (Oracle Tags), Power, Toughness, Price, Made in, Foil type, Frame, Released and Owned. New search words: `is:owned`, `is:foil`, `is:etched`, `is:fullart`, `is:borderless`, `is:showcase`, `is:extendedart`, `is:promo`, `art:`, `role:`, `pow`, `tou`, `year`, `a:`, `kw:`, `frame:`, `border:` and `lang:`.
- Full Scryfall data kept offline: Art Tags and Oracle Tags, the full record of every card, treatments, and printings in unofficial languages such as Phyrexian, downloaded with each card database update.
- Price history: each update saves the prices that changed, shown on the card page's Price history tab as a chart and a table.
- Fixed: the About guide was squished on the desktop by its page list for narrow screens.

## 0.11.0 (2026-11-20): Card tracking between decks and collections

- Edit as text and decklist imports link lines that name a set and collector number to free copies of exactly that printing and finish, the deck's own collection first. Lines without a set and number stay missing until a copy is linked. Add to deck links only copies of the exact printing and finish.
- Link owned copies (Decks ribbon tab, Ownership tab, right-click menu) links exact copies to every missing card.
- A missing deck card shows **Owned, link** when you own free copies of its version, or **Other version owned** with **Switch** when you own another printing or finish, in every deck view.
- The deck follows the copy: linking a copy of another printing or finish moves those cards to the copy's printing and finish. A regular and a foil card of the same printing are separate deck cards.
- Changing the printing or finish of collection copies that fill a deck asks whether the deck changes too. No keeps the deck's version, and those cards show as missing with Other version owned.
- Change printing asks **How many to change** for a card with more than one copy, so part of a stack can switch, such as one of two copies to foil, without removing anything. This works for collection entries and deck cards.
- Upgrade wanted: mark a deck card with the version you want instead. The card stays owned, shows an Upgrade wanted badge, is listed in the Ownership tab, and loses the mark when a copy of the wanted version is linked. Backups keep it.
- FOIL and ETCHED show in every deck view (List, Text, Stacks, Grid), the Deck list panel, the Card panel and trade lines, from one shared badge.
- Remove on a card with more than one copy asks how many to remove, with **Reduce to 1** and **Remove all**. Reduce to 1 is also in the right-click menus, the Collection ribbon tab and the picked bar, and Remove selected... offers it.
- Add buttons name where the card goes (+ collection name, + deck name) and have a button for each other finish the printing is made in, in card search, the Card panel, the card page and right-click menus. The deck's Add tab has **Add as** (Regular, Foil, Etched).
- The Collections and Decks panels mark the target collection and the open deck with **Target**, and the one Enter uses with **Adding here**. The status bar reads ADDING TO; with a deck open, clicking it switches between the deck and the target collection.
- Messages and the guide say cards and entries instead of rows; import messages count lines.

## 0.10.0 (2026-11-19): Foil versions in Change printing, and a finish for deck cards

- The printing chooser has a button for each finish a printing is made in (Regular, Foil, Etched) with its price. Choosing one switches to that printing in that finish, so a card can switch to its foil version.
- Collection copies switched to another finish keep their count, condition, language, trade marks, details and deck links; they merge with a row that already has that printing and finish.
- Deck cards keep their own finish: regular, foil or etched. Foil and etched cards show FOIL or ETCHED, and their price, the deck's value and statistics use that finish.
- `*F*` and `*E*` in Quick add, Edit as text and decklist imports set the deck card's finish, and Edit as text writes the marks back. Add as foil sets it when cards go to the selected deck.
- Changing a deck card to another finish links free copies in that finish.

## 0.9.0 (2026-11-19): Proxies, the card maker, change printing and menus for collections and decks

- Proxies: a new Proxies view (key 5, the Proxies ribbon tab and a Proxies tab on phones) with a print list kept on the server. Add a deck, its missing cards, a collection, picked rows, a pasted list, the tokens of the listed cards or any card from a search; choose each line's printing, count and faces.
- Sheet settings for the paper (Letter, A4, Legal or a custom size), margins, card size, scale, gap, bleed, cutting guides and background, with a live preview of every page.
- Exports: a PDF at 300 DPI, MakePlayingCards pictures with bleed in a zip, and a card list for MPC Autofill with custom cards as pictures. Mana Vault makes every export itself. After exporting, the printed cards can be added as proxies to a collection or deck.
- The card maker makes custom cards with a live preview: every card field, mana symbol buttons, Mana Vault's own frames in every color, the ten hybrids, gold, artifact, colorless and land, legendary versions, creature, planeswalker, saga, token and double-faced cards, uploaded art or a card's art with move and zoom, and PNG export.
- Custom cards are saved to the card database for every account, in custom sets with their own codes (such as XXX), names, release dates and symbols, with colors, color identity, finishes, prices, legality and tokens. They work like every other card, show a Custom badge and are found with `is:custom`. Only their maker can change or delete them, and backups include them.
- Change printing... in the right-click menu of deck cards and collection rows. A deck card links free copies of the new printing, from the collection you choose when several have them; collection copies keep their count, details and deck links.
- New cards go to the collection or deck selected last in the Collections panel, the Decks panel or a switcher, and only that one is highlighted. With a deck selected, Add to collection, double-click and the scanner add to the deck. The Add here buttons are gone; the status bar shows ADD TO: DECK name for a deck.
- The Decks panel groups decks by format, with each deck's card count and value under its name.
- Right-click menus (long press on phones) on collections and decks in the panels and switchers: Open, Rename..., settings or format, Send..., Export..., Delete or Leave. Rows of the Deck list panel have the deck card menu, and card menus have Add to print list.
- Deck import, Edit as text and Quick add read `*F*` (foil) and `*E*` (etched) after a card's set and number, and find a card by its set and number when the name does not match.
- A card whose record from Scryfall fails a check is skipped instead of stopping the whole card database update; the status bar shows how many were skipped, with their names. Two-faced cards keep their back face picture for printing after the next update.
- Backups are version 5 and can be up to 250 MB.
- Fixed: deck lines ending in `*F*`, such as `1 Island (HOB) 195 *F*`, were not found in the card database.

## 0.8.0 (2026-11-19): Saved trades, search views, filters per view and All collections

- Card search shows results as a Grid (the default), Binder pages or a List, chosen with **Options** with the card size; the desktop and phones each remember their choice. Pictures show the price and how many copies you own; click selects, double-click adds, right-click or long press opens the menu.
- Card search shows every result instead of the first 40: more load while scrolling or turning binder pages, and the count line shows the total.
- The Filters panel filters the open view: card search, the open collection, the deck's cards or the deck's Add tab results, and the trade searches, without switching to card search. A Filtering line names the view. Each view keeps its own filters; collection filters, tags and the filter box stay when another collection opens, and deck filters stay when another deck opens. Clear filters clears the open view only. Legal in works in collections and decks.
- All collections is the first entry of the collection switcher: every row of every collection, with its collection, wishlists only with Include wishlists in Options. Every action acts on each row's own collection.
- The deck header is laid out like the collection header: the switcher, the tabs Cards, Add, Ownership, Statistics, Playtest, Description and History (scrolling sideways on phones), a filter box, Options (view, group, sort, Edit as text, with a count of active filters) and the count line with the format badge. The Cards tab shows only the cards.
- The deck's new Add tab holds Quick add with its zone, Edit as text, and a card search with pictures and the buttons + Main, + Side, + Maybe and + Commander, each showing how many are already in the deck.
- Trading: saved trades with a name and a status (Open, Done or Cancelled), with New, Rename, Cancel and Delete. Two columns, You give (your cards for trade, or every card) and You get (the card database), each with its own search. Each line has its own count, finish, condition and a price that can be changed by hand (marked EDITED), and a balance bar compares the sides.
- Complete trade moves the cards in one step that can be undone, warns about cards used in decks and lowers wishlist wants for the cards you get.
- Trades can be sent to another account on the server; changes go back as counter-offers until one side accepts, which completes the trade for both. Waiting trades show in the Inbox and on the phone's top bar.
- Wishlist matches both ways, Copy list, Export (CSV), and a public link to your trade binder (only cards marked for trade; it can be replaced or turned off). It is the only page that opens without signing in.
- The phone's bottom bar adds Trade, with slightly smaller labels. Collection, deck and trade views have a Filters button in the top bar.
- Every choice list is the app's own list, the same on every screen: the import and export windows, every dialog, the scanner's Add to, settings and strip, and the sort, group, zone and filter lists. Long lists have a Find box; on phones the list is a sheet.
- The Home ribbon tab no longer has the Add group (Add to collection, Target, Wishlist, Add as foil); those commands remain on result buttons, menus, the status bar and their keys. The Trade ribbon tab has New trade, Complete, Send, Copy list and Share binder in place of You give and You get.
- Fixed: the scanner's card outline ran under the buttons on the right side of the camera.
- Fixed: the scanner's light did not come on. The scanner now opens a back camera that has a light, and in the Android app falls back to the phone's own light control; a camera without a light says "This camera has no light".

## 0.7.0 (2026-11-19): Deck builder, switchers and card grid

- Deck builder: Quick add (type "2 Sol Ring", with names suggested), Edit as text with Check and Apply as one undo step, and the views List, Text, Stacks and Grid, grouped by type, mana value, color, rarity or tag and sorted by name, mana value or price.
- Maybeboard: a fourth deck zone for cards being considered, left out of the deck's size, value, statistics, ownership and legality.
- Format and legality: 21 formats. Decks are checked for size, sideboard size, copies, banned and not legal cards and the commander's color identity; problems are listed above the cards and cards that break a rule are marked Not legal.
- Tags on deck cards, used as groups.
- Deck tabs Playtest (opening hand, mulligan, draw, play, tap), Description (with a cover card) and History (every change with date and person).
- Deck statistics start with Mana symbols and sources. The deck lists the tokens its cards make, and pointing at a card name on the desktop shows a large picture.
- Switchers: collections and decks open from the same searchable list, with sorting (Recently opened, Name, Date created, Card count, Value, Format, Commander), card counts, values, commanders and formats, and keyboard use. On a phone the list is a full sheet. The phone's Decks button is replaced by the switcher.
- Collections show as a Grid of card pictures that loads more while scrolling (Small, Medium or Large), Binder pages as large as the work area with First, Last and a page box, or a List. Grid is the default for new accounts; the desktop and phone each remember their layout.
- The collection header has Options (sort, layout, card size, deck and trade filters, Select several cards) with a count of active filters, + Add, and one count line such as "1,122 cards (314 unique), $390.32".
- One click on a deck or collection in a panel opens it. Opening a collection, deck, card or view closes the About guide.
- Floating panels dock onto other panels, panel edges and window edges when dragged by their grip, and snap to each other's edges. Panel tabs wrap onto more rows instead of being cut off.
- The Trade ribbon tab always has the Trade button. The Workspace list uses the program's own menu.
- The card database update also stores the mana each card makes and the tokens it creates. Run an update after installing.
- Backups keep each deck's description, cover card and tags.
- Fixed: the right-click menu was hard to read in the dark theme.
- Fixed: on phones, icons in the Home buttons and the scanner's edit button were drawn far too large, and an empty bar showed at the top of Home.
- Fixed: a link in a deck description could run script; only web addresses become links.

## 0.6.0 (2026-11-19): Linked deck cards, import formats, ManaBox-style scanner and a new ribbon

- Deck cards are linked to the copies in your collections that fill them. A copy fills one deck at a time; a second deck that needs the card shows it as missing. Collection rows show their decks, deck cards show their collection, and Link copies changes the copy. Links follow copies that move, and removing a copy makes the deck card missing.
- Normal decks are gone: every deck keeps the printing of each card. Decks that kept cards by name keep the newest printing they showed. Decklists without a printing take the newest printing.
- Proxies: a proxy is its own row, marked PROXY everywhere, with no value, out of set completion and the trade list. It can fill a deck card. Add as proxy, the scanner's Mark as proxy, Copy details and imports set it.
- Copy details also hold the purchase price and currency, date added, and misprint, altered and signed marks.
- Completion rule None, the default for new collections; it hides the Completion and Missing tabs. Existing collections keep their rule.
- Wishlist wants go down as copies of the card are added to collections, the oldest want first; undo puts them back.
- Import and Export windows: one Import and one Export button. Imports read Mana Vault, Moxfield, ManaBox, Archidekt, Deckbox and TCGplayer CSV files and plain text lists, detect the format and let you change it, and can import into a new collection. Exports write the same formats, for the whole collection, the filtered rows, the picked rows, the missing cards or the deck.
- The scanner works like ManaBox: a settings sheet (Quick mode, Play sounds, Vibrate, Mark as proxy, Camera, a set filter with any number of sets, Ignore promos, Prefer foil if possible, Display total value, Display copies in collection), set chips on the camera, a "Not in set" warning, a printing picker when more than one printing fits, and a strip for the finish, condition and language of the next cards.
- Add to in the scanner offers New collection... and New deck...; cards added to a deck go into a collection for that deck, remembered per deck, and are linked.
- The ribbon is the only menu: the menu bar is replaced by a title bar with the account menu. Related commands share one button with a list, commands that do not apply are hidden, and an open deck adds its groups to the Decks tab. Button size: Large buttons, Compact buttons or Icons only.
- Right-click menus on cards and rows, and a long press on a phone.
- Card page with art, rules text, power and toughness, every version with market prices, rulings and where you own the card. Rulings are kept on the phone too.
- Phone layout: Home, Search, Collection, Decks and Scan tabs, a Home view with totals, recent scans and the Inbox, and the menu at the top right with one section per ribbon tab.
- Explanatory notes were removed from the interface.
- Android app: it goes offline only when the server cannot be reached, checks again every 10 seconds, and downloads only the collections and decks that changed. The sync button always shows Synced and the time, Waiting, Offline or Syncing, and syncs now when tapped. Collections and decks can be created offline.
- The card database update also downloads rulings, power and toughness, and the rules text of both faces of two-faced cards. Run an update after installing.
- Backups are version 4, with proxies, copy details, the collection remembered for each deck, and deck links. Older backups still restore.
- Fixed: preference changes made just before reloading the page were lost.

## 0.5.0 (2026-11-18): Android app

- Android app (Android 8.0 or newer), installed from the APK attached to each GitHub release. It has every feature of the phone layout.
- First run: enter the server address, then sign in or create an account. Plain http addresses are allowed only on a home network, with a warning.
- Phones sign in with their own device sign-in. Devices... lists the phones signed in to your account and removes them. Changing your password also signs out your other phones.
- Offline use: the phone keeps a copy of your collections, decks, Inbox, trade list, preferences and the card list. Browsing, card search by name, card details, editing copies and deck cards, renaming and scanning work without a connection.
- Sync: changes made offline wait on the phone and are sent when the connection returns, when the app opens, every minute, or with Sync now. Count changes are applied as differences, each change is applied once, and changes the server refuses are listed in Changes not applied.
- Scanning in the app uses the phone's own text recognition, and matches cards on the phone when offline with the same rules as the server.
- Notifications for new Inbox offers, checked in the background about every 15 minutes, optionally only on Wi-Fi. Tapping one opens the Inbox.
- The Back button closes windows and sheets, then returns to the Cards tab. Exports and backups open the Android share sheet.
- The app checks GitHub once a day for a newer release; Check for updates... checks at once.
- The server's health check reports its version.
- Fixed: a backup listed two collections created in the same second in a random order, so they could swap places after a restore.

## 0.4.0 (2026-11-18): Live card scanner

- Scanner rebuilt: it scans continuously, with no capture button. Each card held in the outline is recognized and added to a scanned list, with a short vibration on phones; a card that stays in view is counted once.
- Exact printings from the set code and collector number on cards printed since 2019; otherwise the card name with tolerance for reading mistakes and the newest printing.
- Reads only the card's name and information lines, enlarged and with the contrast raised, instead of the whole camera picture. Light text on dark title bars is read, and cards held larger, smaller or off center are found.
- Continuous autofocus, tap to focus and a torch button.
- Last card strip with Normal or Foil, another printing and +1.
- Scanned list with edit (quantity, finish, printing), remove, Clear and Add a card by name. It is kept on the device until it is added or cleared.
- Add to... puts the whole scanned list into any collection or deck as one undo step.
- Scanner settings: vibrate when a card is added, new scans are foil, and back or front camera.
- Phone: a Scan tab in the bottom tab bar. Desktop: a large scanner window with the camera and the scanned list side by side.
- Text recognition files are served by Mana Vault, so scanning works without an internet connection.
- Choosing a photo is no longer offered; Add a card by name replaces it for cards the camera cannot read.
- Fixed: the scanner read the whole camera picture and took its first line of text, so it rarely found the card name, and an exact name match was needed to find a card.

## 0.3.0 (2026-11-18): Prices, statistics, deck ownership, wishlists and trading

- Prices: every card database update stores each printing's US dollar (regular, foil, etched) and euro (regular, foil) prices. Prices show in search results, the Card panel, collection rows, the binder, the trade view and the Collections panel, in US dollars or euros (PRICES in the status bar).
- Collection and deck values, sorting a collection by price, quantity or set, and the `usd` and `eur` search filters.
- Statistics tabs for collections and decks: stat tiles and charts for mana curve, color, type, rarity, finish and top sets. Clicking a collection chart bar lists those cards.
- Deck ownership: an Ownership tab and owned badges show which deck cards you own, where they are and what the missing cards cost. Missing cards export as text or go to the wishlist.
- Wishlists: any collection can be a wishlist. Its cards are wanted, not owned. Add a card (W), a set's missing cards or a deck's missing cards in one step.
- Trading: mark copies for trade, see them in the trade list, and compare both sides in the trade calculator (key 4), with a copyable summary.
- Copy details (E): each row now has a finish (regular, foil or etched), condition and language, and a number for trade. Collection imports and the Moxfield export carry condition, language, etched and tradelist counts.
- Filter tags: click a set code or rarity on a collection row to list only matching cards; click a set code or rarity in search to filter by it.
- Binder layout (B): a collection as pages of nine cards, turned with Page Up and Page Down.
- Search and imports match flavor names (such as Godzilla series names) and the front face of two-faced cards.
- Backups are version 3 and keep copy details and wishlists. Older backups still restore.
- After updating, run Update card database once to load prices and flavor names. Existing copies become regular, near mint, English, or foil when they were foil.

## 0.2.0 (2026-11-18): Collections, set completion and sending

- Collections: any number per account, each with a name, description, linked sets, completion rule and finish rule. Every new account starts with a Main collection.
- Target collection for Add to collection, shown as ADD TO in the status bar and cycled with C.
- Set completion per collection: Main set, Every printing or Each card name once (linked sets only), with Any finish, Regular only, Foil only or One of each.
- Completion tab with overall and per-set progress, and Missing tab with filters, + Collection and text or CSV export.
- Collections panel with completion bars, and owned counts per collection in the Card panel.
- Bulk editing: pick rows with Ctrl+click, Shift+click, Ctrl+A or Select mode, then remove or move them in one step that undoes as one.
- Move copies between collections.
- Collection CSV imports go into a chosen collection; exports cover the open collection.
- Collections and decks belong to their account. Data from earlier versions moves to the oldest account, with the collection named Main collection.
- Send collections and decks to other accounts as a copy, a share or a transfer; accept into a new item or merge into a collection; decline or cancel offers; Inbox with a waiting count.
- Rename and delete decks; leave or stop sharing shared items.
- Backups hold the signed-in account's own collections and decks; backups from earlier versions restore into a Main collection.
- Card database updates also download Scryfall's set list and each printing's finishes. Run Update card database once after updating so Main set and the finish rules have complete data.

## 0.1.0 (2026-11-18): New interface, sign-in and About guide

- New desktop interface: menu bar, ribbon with a contextual Deck tab, dockable Filters, Decks, Card, Deck list and Import review panels, saved workspaces and a status bar with confirmations.
- Light, dark and system themes, saved per account.
- New phone layout with bottom tabs and full-screen sheets.
- Sign-in with accounts, password changes and protection against password guessing. New accounts can be turned off with MANAVAULT_SIGNUP.
- Preferences saved per account on the server.
- Undo and redo for collection and deck edits.
- Keyboard shortcuts for search, adding cards, zones, decks and undo.
- Card panel with full card details and owned counts.
- Import previews in a window, with every skipped row in the Import review panel.
- Customize ribbon, to add, remove and reorder tabs, groups and buttons.
- Built-in About guide.
- Fixed: backups that contain colorless cards, such as artifacts and lands, could not be restored.
- Docker deployment for Dockhand: published image, docker-compose.yml with an absolute data folder, .env.example and a built-in health check. Before updating an existing install: the container now runs as user 65532, so run `sudo chown -R 65532:65532` on the data folder, and the setting CARD_UPDATE_INTERVAL_HOURS is now MANAVAULT_CARD_UPDATE_INTERVAL_HOURS (the old name still works). Installs that used the old mana-vault-data Docker volume move the database into /opt/mana-vault/data; the README gives the copy command.
