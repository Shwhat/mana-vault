# Android app

The Mana Vault app for Android phones works with your Mana Vault server. It has everything the phone layout has, plus scanning with the phone's own text recognition, use without a connection to the server, and notifications for new offers in your Inbox.

## Installing

1. On the phone, open the releases page of the Mana Vault repository (github.com/Shwhat/mana-vault/releases) and download `mana-vault-<version>.apk` from the newest release.
2. Open the downloaded file. Android asks once to allow installing apps from the browser or file manager; allow it, then choose **Install**.
3. Open **Mana Vault** from the app list.

The app needs Android 8.0 or newer. Updates install over the old app and keep its sign-in and its copy of your library.

## First run

1. Enter the **Server address**, the address you use for Mana Vault in a browser (for example https://vault.example.com or http://192.168.1.20:3417), and choose **Continue**. The app checks that a Mana Vault server answers there and shows its address and version.
2. Choose **Sign in** with an existing account, or **Create account** when the server allows new accounts.
3. The app downloads your collections, decks and the card list. The card list is several megabytes, so the first sync takes longer than later ones.

**Change server** goes back to the address step.

| Address | Allowed |
|---|---|
| https:// address | Always |
| http:// address on a home network (192.168.x.x, 10.x.x.x, 172.16.x.x to 172.31.x.x, 100.64.x.x to 100.127.x.x, names ending in .local, .lan or .home.arpa) | Yes, with the warning "This address is not encrypted. Use it only on your home network." |
| http:// address anywhere else | No |

## Signing in on a phone

The phone signs in once. The server gives it its own device sign-in, which the phone keeps in encrypted app storage; the password is not stored. The device sign-in has no expiry. It ends when:

- you choose **Sign out** on the phone (Menu, Account),
- you remove the phone in **Devices...**,
- you change your password on another device (every phone except the one making the change is signed out).

A phone that is signed out shows the first-run screen again.

### Devices

**Devices...** (Menu, Account on the phone, or the account menu on the desktop) lists every phone signed in to your account, with the time it last reached the server. **This phone** marks the phone you are using. **Remove** signs that phone out at its next connection; removing this phone signs it out at once.

## Using the app

The app always uses the phone layout described in [Screen layout](/about/screen-layout): the Home, Search, Collection, Decks, Trade and Scan tabs, the Menu at the top right, card pages, sheets and large touch targets. A long press on a card opens its menu.

| Phone feature | What it does |
|---|---|
| Back button | Closes the open window, then the open sheet, menu, printing picker or scanner settings, then the card page, then leaves the scanner or the About guide, then returns to Home. On Home it puts the app in the background |
| Exports and backups | Open the Android share sheet, to save the file to the phone or send it to another app |
| Imports and restores | Use the Android file picker |
| Trades | Work online only: trades are saved on the server |
| Card images | Load from the server (its saved pictures, or Scryfall's through it) and are kept by the phone as they are viewed |

## Without a connection

The phone keeps a copy of your library: every collection and deck you own or share, with their cards, set completion, the Inbox, the trade list and your preferences, plus the card list (every printing's name, set, collector number, type, mana cost, rules text, power and toughness, rarity, colors, finishes and image address) and every card's rulings.

The app goes **Offline** only when the server cannot be reached: when a request fails, a quick check of the server follows, and only when that also fails does the app go offline. A slow answer or another error keeps it online. While offline, the app checks again every 10 seconds, and whenever it is used.

| Works offline | Needs a connection |
|---|---|
| Browsing and filtering collections and decks | Importing, backups and restores |
| Card search by name and flavor name, with the color, type, set, rarity and mana value filters | Card search in rules text and the search syntax (such as `o:` or `usd>`) |
| Card details and card pages, with rules text and rulings | Prices of cards not opened before |
| Adding, removing, editing and moving copies | Deleting collections and decks |
| Adding and changing deck cards | Collection settings other than the name and description |
| Renaming collections and decks, creating collections and decks (New collection... and New deck... in Add to, and the Import window's new collection) | Sending, accepting and declining offers |
| Scanning cards and adding the scanned list | Updating the card database |
| Undo and redo | Devices, Change password and statistics not opened before |

A command that needs a connection while offline shows "You are offline. This needs a connection to the server."

### Sync

The top bar always shows the sync button:

| Shows | Meaning |
|---|---|
| Synced and the time since the last sync (now, 5m, 2h) | Everything is sent and current |
| Waiting, with the number of waiting changes | Changes are waiting to be sent |
| Offline, with the number of waiting changes | The server cannot be reached |
| Syncing | Changes are being sent and the copy updated |

Tapping it syncs now and downloads a fresh copy of everything. When the last sync stopped for a reason other than the connection, the button's text is amber and pointing at it shows the reason; the next sync tries again.

Every change made offline waits on the phone in order. Changes are sent:

- when the connection returns,
- when the app opens,
- every minute while the app is open,
- when you tap the sync button in the top bar, or choose **Sync now** (Menu, Account).

After sending, the phone downloads the lists of collections and decks, then only the collections and decks that changed on the server since the last sync, a newer card list when the server's card database was updated or a custom card changed, and newer rulings.

How the server applies offline changes:

| Change | Rule |
|---|---|
| Setting a copy count (quantity, remove) | Applied as a difference: the server adds the change you made to its current count. If you set 3 copies to 5 while someone else raised them to 4, the result is 6 |
| Adding copies, moving copies, deck cards added, collections and decks created | Applied as sent. Copies linked to a deck card are linked only while they are still free |
| A change to a collection or deck that was deleted, or that you no longer share | Not applied |
| A change sent twice (for example after a dropped connection) | Applied once |

When the server does not apply a change, the window **Changes not applied** lists each one with the server's reason, and the phone shows the server's version.

**Sign out** removes the copy and any changes still waiting, so sync first.

## Scanning in the app

The scanner works as described in [Scanning cards](/about/scanning-cards), with these differences:

- The phone's own text recognition reads the card, instead of the recognition files the browser loads. It reads English text and needs no download.
- Without a connection, cards are matched against the card list on the phone with the same rules as the server: set code and collector number first, then the card name.
- The camera asks for permission the first time the scanner opens.
- **Torch** uses the camera's own light when it can switch it; otherwise the app switches the phone's light directly. When the phone has no light, the scanner says "This camera has no light", and when the light cannot be switched while the camera is in use, "The light could not be turned on while the camera is in use".

## Notifications

**Notifications...** (Menu, Account) has two settings, kept on the phone:

| Setting | Default | Meaning |
|---|---|---|
| Notify me about new offers in the Inbox | Off | The phone checks the server for new offers in the background |
| Check only on Wi-Fi | Off | The check waits for a Wi-Fi or other unmetered connection |

The check runs about every 15 minutes; Android decides the exact time and may wait longer to save battery. Each new offer shows a notification: "<name> sent you a collection" or "a deck", with the item's name and how it was sent. Tapping it opens Mana Vault with the Inbox.

Android asks for notification permission the first time the setting is turned on. If permission is refused, the message "Notifications are not allowed for Mana Vault in the Android settings." appears and the setting stays off.

## Updates

Once a day, when the app opens, it checks GitHub for a newer release. When there is one, the window **Update available** shows both versions and **Open the download page**. **Check for updates...** (Menu, Account) checks at once and also links to the releases page.

The app's version always matches the server version it was released with. An app and a server of different versions work together as long as both are 0.5.0 or newer.
