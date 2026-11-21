# Release notes

The installed version is shown at the top of this guide.

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
