# Administration

Administration holds the settings that apply to the whole server: accounts, sign-up, the card database, card pictures, backups, devices, security and the server itself. Only admin accounts can open it.

## Admins

- The first account created on a new server is its admin. On a server updated from 0.11.0 or earlier, the oldest account becomes the admin.
- An admin can make other accounts admins, and remove the admin role from them, in **Accounts**. The server always keeps at least one admin that is turned on.
- Updating the card database (**Update card database**) is for admins only.

## Opening Administration

Choose **Administration...** in the account menu (your user name at the right of the title bar). It is listed only for admins. Administration opens in the work area with its pages listed on the left (a list above the page on a narrow screen) and the version at the top. **Close** or Esc goes back to where it was opened from.

## Setup

Setup opens once, the first time an admin signs in to a new server (or to a server updated from 0.11.0 or earlier). It has three steps, each of which can be skipped:

1. **Card database**: **Download the card database now** starts the first update (card data, rulings, Art and Oracle tags and prices, about 400 MB to download).
2. **Pictures to keep on the server**: tick the picture sizes to download, each with its estimated download size and what is saved now; the free space on the picture drive is shown under the list. **Measure sizes** checks a sample of pictures at Scryfall for a closer estimate.
3. **Picture folder**: where the pictures are kept. **Choose folder...** opens a folder chooser on the server.

**Finish** saves the choices; **Skip for now** saves nothing but marks Setup as done. Both open the Pictures page. Setup is listed in Administration until it is finished or skipped.

## Accounts

A table of every account: name with You, Admin, Turned off and New password needed badges, when it was created, the last sign-in, and its devices, collections, decks and card count.

| Button | What it does |
|---|---|
| **New account...** | Creates an account with a user name and, optionally, the admin role. A temporary password is shown once; the person chooses their own password when they first sign in. The account starts with a Main collection |
| **Reset password** | Gives the account a new temporary password, shown once, and signs it out everywhere |
| **Turn off**, **Turn on** | A turned-off account cannot sign in, and its browsers and phones are signed out. Its collections and decks are kept |
| **Make admin**, **Remove admin** | Gives or takes the admin role |
| **Sign out everywhere** | Ends every browser session and phone sign-in of the account |
| **Delete...** | Deletes the account. **Move them, then delete** first moves its collections, decks and custom sets to another account you choose; **Delete everything** deletes them with the account after a second question. You cannot delete your own account here |

An account with a temporary password is asked for a new password ("Choose a new password") as soon as it signs in.

## Sign-up

Who can create an account on the sign-in page:

| Choice | Effect |
|---|---|
| Open | Anyone who can reach the server can create an account |
| Invite codes | Create account asks for an invite code. Each code works once |
| Closed | Create account is hidden. Admins create accounts in Accounts |

The first account on a new server can always be created. **New invite code...** makes a code (such as ABCDE-FGHJK), with an optional note of who it is for, and shows it once. The list shows each code, its note, who made it and when, and who used it. **Remove** deletes a code. Codes are not case sensitive.

## Card database

Shows the number of printings, the last update and its error, skipped cards, the number of Art and Role tags, the printings per language and how many days of price history are saved. **Update now** starts an update.

- **Update every** sets the hours between automatic updates (0 turns them off). The default is 168 hours (one week).
- **Card languages**: English and unofficial languages (the default), All languages, or Chosen languages with a checkbox for each, with the number of printings, the download and the database growth shown before **Save languages**. **Pictures of other languages** (off by default) also downloads their pictures. See [Card languages](/about/card-database#card-languages).
- **Parts** lists each part of the card database with its count and when it was last updated: card printings, sets, set symbols, symbols, rulings, art tags, oracle tags, printing changes, name and keyword lists, the card back and the price history, then the printing changes of the last update and how many removed printings are still held.

- **MTGJSON** lists each MTGJSON part with its count, size on disk, the date it was last updated and the result of its last run (Updated, Kept previous copy, Failed, Skipped, or Not run yet), and how many MTGJSON printings match no card. **Update MTGJSON data now** downloads the weekly parts and today's prices; **Update prices now** downloads today's prices. While one runs the buttons wait and the list refreshes.
- **90-day price history**: until it is downloaded or skipped, the section shows the download size of MTGJSON's last 90 days of prices, with **Download price history** and **Skip**. Skipping keeps each day's prices from then on. After the choice, **Download it now** is still offered.

See [Card database](/about/card-database) for what an update downloads.

## Pictures

Card pictures can be kept on the server so they show without the internet. Every picture address in Mana Vault points at the server: it sends the saved picture, or Scryfall's when none is saved.

| Picture size | Used for |
|---|---|
| Small | Lists and the Deck list panel |
| Normal | Grid, binder and search |
| Large | Card page and hover previews |
| Full-size PNG | Printing proxies |
| Art crop | Card maker and picture search |
| Border crop | Proxies without the black border |

- Tick a size to download it. Each size shows its estimated download (the number of pictures times the average picture size, "About" until measured) and what is saved now. **Measure sizes** checks 40 sample pictures at Scryfall to measure the average size.
- Downloads run in the background after each card database update, one size at a time, and fetch only pictures that are new or that Scryfall changed. The status bar shows "Downloading pictures: N of N"; clicking it opens this page.
- **Pause** and **Resume** stop and continue the downloads.
- **Minimum free space** (default 10 GB): downloads stop when less space is free on the picture drive, with "Stopped: less than N GB free on the picture drive".
- Unticking a size that has saved pictures asks "Delete the N pictures already saved?" with **Delete them** and **Keep them**.
- **Picture folder**: where the pictures are kept. By default it is the pictures folder in the data folder. **Choose folder...** moves them: Mana Vault copies the saved pictures to the new folder, checks them, and then uses the new folder. The old folder is left for you to delete.
- A picture folder that cannot be found (such as a drive that is not plugged in) shows "Picture folder not available". Nothing is deleted or downloaded again; pictures come from Scryfall until the folder is back.
- When the picture folder is set by MANAVAULT_PICTURES_DIR (as in the Docker install), it shows "Set by MANAVAULT_PICTURES_DIR on the server and cannot be changed here", and the folder is changed in the server's setup instead.

The Android app shows the server's pictures.

## Storage and backups

Shows the data folder, the size of the database, the size of the saved pictures and the free space.

**Whole-server backups** hold every account, collection, deck, trade, setting and the card database in one file (mana-vault-YYYYMMDD-HHMMSS.sqlite). Pictures are not included; they can be downloaded again.

| Setting or button | What it does |
|---|---|
| **Back up every** | Hours between automatic backups. 0 (the default) turns them off |
| **Backups to keep** | How many of the newest backups are kept (default 7); older ones are deleted when a new one is written |
| **Backup folder** | Where backups are written. By default the backups folder in the data folder. **Choose folder...** changes it |
| **Back up now** | Writes a backup at once |
| **Download** | Downloads a listed backup |
| **Restore...** | Restores a listed backup |
| **Delete** | Deletes a listed backup |
| **Restore from a file...** | Restores a backup file from your computer |

Restoring asks first: every account, collection and deck goes back to the backup and the server restarts. The current database is kept beside it, named with "before-restore" and the time. Reload the page after a minute. The account's own JSON backup in the File menu is separate; see [Storage and backups](/about/storage-and-backups).

## Devices

Every phone signed in with the Android app, on every account, with its account, when it signed in and when it was last seen. **Remove** signs the phone out.

## Security

| Setting | Default | Range |
|---|---|---|
| Sign-ins last | 30 days | 1 to 365 days |
| Sign-in attempts | 30 per address in 15 minutes | 3 to 1000 |
| Minimum password length | 8 characters | 8 to 64 |

The secure cookie setting is shown as automatic, or as set by MANAVAULT_SECURE_COOKIE.

## Server

Shows the version, whether a newer version is published on GitHub ("Version N is available. Update the stack in Dockhand.", "Up to date" or "Could not reach GitHub"), how long the server has been running and whether Scryfall can be reached.

- **Server name**: up to 60 characters, shown in the title bar beside Mana Vault and in the sign-in page's title.
- **Recent server log**: the newest server log lines. **Refresh** reads them again.

## Activity

The newest 300 events, newest first: sign-ins, failed sign-ins (highlighted), accounts created, changed or deleted, settings changes, invite codes, backups and restores. Each shows when, the account, what happened, details and the address it came from. The server keeps the newest 5000 events.

## Settings set by the server

A setting given as an environment variable in the server's setup is locked in Administration and shows "Set by" and the variable's name. Remove the variable from the server's setup to manage the setting here.

| Variable | Locks |
|---|---|
| MANAVAULT_SIGNUP | Sign-up |
| MANAVAULT_CARD_UPDATE_INTERVAL_HOURS | Update every |
| MANAVAULT_PICTURES_DIR | Picture folder |
| MANAVAULT_BACKUP_DIR | Backup folder |
| MANAVAULT_SECURE_COOKIE | Secure cookie |

## Messages

| Message | Cause | What to do |
|---|---|---|
| Only an admin can do this. | A non-admin account reached an Administration action | Ask an admin |
| The server needs at least one admin. Make another account an admin first. | The last admin was about to lose the role or be turned off | Make another account an admin first |
| You cannot delete your own account here. | Delete was used on your own account | Ask another admin |
| Choose another account to receive the collections and decks. | Move them, then delete was given the account being deleted | Choose another account |
| This setting is set by VARIABLE and cannot be changed here | The setting is locked by an environment variable | Change it in the server's setup |
| Setting must be a whole number from N to N | A number setting is out of range | Enter a number in the range |
| That invite code is not valid or was already used. | Create account was given an unknown or used code | Ask an admin for a new code |
| This server needs an invite code to create an account. | Create account was used without a code | Enter the invite code |
| Download the card database first. | Measure sizes ran with an empty card database | Update the card database |
| Scryfall could not be reached to measure the pictures. | No sample picture could be checked | Check the server's internet connection |
| Pictures are already being moved. | A move was started while another ran | Wait for it to finish |
| The pictures are already in that folder. | The chosen folder is the current one | Choose another folder |
| That folder cannot be opened. | The folder chooser was given a folder that does not exist or cannot be read | Choose another folder |
| That file is not a Mana Vault server backup. | Restore was given a file without Mana Vault accounts | Choose a server backup file |
| Backup not found | The listed backup was deleted | Refresh the page |
| This account is turned off. Ask the server's admin. | A turned-off account tried to sign in | Ask an admin to turn it on |
