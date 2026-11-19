# Accounts and access

Every visit to Mana Vault needs a signed-in account. This page covers sign-in, accounts, passwords, sessions and devices. Signing in the Android app is described in [Android app](/about/android-app).

## Sign-in page

Visitors who are not signed in are sent to the sign-in page. It has two tabs:

| Tab | Fields | Result |
|---|---|---|
| Sign in | User name, Password | Opens Mana Vault |
| Create account | User name, Password, Repeat password | Creates the account and opens Mana Vault |

The Create account tab is hidden when the server owner has turned new accounts off.

## Account rules

| Field | Rule |
|---|---|
| User name | 3 to 32 characters: letters, digits, dots, dashes or underscores, starting with a letter or digit. Names are unique without regard to capital letters, so "Devon" and "devon" are the same account |
| Password | At least 8 characters |

## What accounts share

All accounts on one server share the card database. Each account has its own collections and decks; another account sees them only after you send or share them (see [Sending and sharing](/about/sending-and-sharing)). Each account also keeps its own preferences: theme, Add as foil, target zone, target collection, open collection, ribbon layout, panel layout, saved workspaces and the last open deck.

When Mana Vault is updated from a version before 0.2.0, the collection and decks that everyone shared become the oldest account's, with the collection named Main collection. Every new account starts with an empty Main collection.

## Sessions

- Signing in keeps you signed in on that browser for 30 days.
- **Sign out** (account menu, or Menu on the phone) ends the session on that browser and returns to the sign-in page.
- When a session ends or expires, the next action returns to the sign-in page.

## Changing your password

1. Open the account menu (your user name at the right of the title bar) and choose **Change password...**.
2. Enter the current password and the new one twice, then choose **Change password**.
3. Every other browser and every phone signed in to the account is signed out. This browser (or phone) stays signed in.

## Devices

Each phone signed in with the Android app has its own device sign-in. **Devices...** (account menu, or Menu on the phone) lists them with the time each last reached the server; **This phone** marks the phone in use. **Remove** signs a phone out. Phones do not appear in the list for browser sessions.

## Protection against guessing

- After 5 wrong passwords for one user name within 5 minutes, sign-in for that name pauses until the 5 minutes pass.
- After 30 failed sign-in or account attempts from one address within 15 minutes, further attempts from that address pause until the window passes.

## Messages

| Message | Cause | What to do |
|---|---|---|
| Wrong user name or password. | The name or password does not match | Check both and try again |
| Too many attempts. Try again in a few minutes. | The guessing limit was reached | Wait a few minutes |
| That user name is taken. | Another account has the name | Choose another name |
| User names are 3 to 32 letters, digits, dots, dashes or underscores, starting with a letter or digit. | The name breaks the rule | Choose a valid name |
| Passwords need at least 8 characters. | The password is too short | Use a longer password |
| The passwords do not match. | The two password fields differ | Type them again |
| New accounts are turned off on this server. | The server owner turned off new accounts | Ask the owner for an account |
| The current password is wrong. | Change password was given the wrong current password | Enter the current password again |
| The new passwords do not match | The two new password fields differ | Type them again |
| Password changed. Other devices are signed out. | The password was changed | None |
| You are signed out. Sign in again to continue. | The session ended or expired | Sign in again |
| That device is not signed in. | Remove was used on a phone that was already removed | None |
