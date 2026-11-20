# Accounts and access

Every visit to Mana Vault needs a signed-in account. This page covers sign-in, accounts, passwords, sessions and devices. Signing in the Android app is described in [Android app](/about/android-app).

## Sign-in page

Visitors who are not signed in are sent to the sign-in page. It has two tabs:

| Tab | Fields | Result |
|---|---|---|
| Sign in | User name, Password | Opens Mana Vault |
| Create account | User name, Password, Repeat password, and Invite code when sign-up is by invite | Creates the account and opens Mana Vault |

The Create account tab is hidden when sign-up is closed. An admin sets sign-up to open, invite codes or closed in Administration; the first account on a new server can always be created, and becomes the admin. The hint under the password shows the minimum length the admin set.

## Account rules

| Field | Rule |
|---|---|
| User name | 3 to 32 characters: letters, digits, dots, dashes or underscores, starting with a letter or digit. Names are unique without regard to capital letters, so "Devon" and "devon" are the same account |
| Password | At least 8 characters, or the minimum length set in Administration (8 to 64) |

## What accounts share

All accounts on one server share the card database. Each account has its own collections and decks; another account sees them only after you send or share them (see [Sending and sharing](/about/sending-and-sharing)). Each account also keeps its own preferences: theme, Add as foil, target zone, target collection, open collection, ribbon layout, panel layout, saved workspaces and the last open deck.

When Mana Vault is updated from a version before 0.2.0, the collection and decks that everyone shared become the oldest account's, with the collection named Main collection. Every new account starts with an empty Main collection.

## Sessions

- Signing in keeps you signed in on that browser for 30 days, or the length an admin set in Administration.
- **Sign out** (account menu, or Menu on the phone) ends the session on that browser and returns to the sign-in page.
- When a session ends or expires, the next action returns to the sign-in page.

## Admins and turned-off accounts

Admin accounts open **Administration...** from the account menu (see [Administration](/about/administration)). An admin can create accounts with a temporary password, reset passwords, turn accounts off and on, sign them out everywhere and delete them. An account given a temporary password is asked to choose a new password ("Choose a new password") when it signs in. A turned-off account cannot sign in.

## Changing your password

1. Open the account menu (your user name at the right of the title bar) and choose **Change password...**.
2. Enter the current password and the new one twice, then choose **Change password**.
3. Every other browser and every phone signed in to the account is signed out. This browser (or phone) stays signed in.

## Devices

Each phone signed in with the Android app has its own device sign-in. **Devices...** (account menu, or Menu on the phone) lists them with the time each last reached the server; **This phone** marks the phone in use. **Remove** signs a phone out. Phones do not appear in the list for browser sessions.

## Protection against guessing

- After 5 wrong passwords for one user name within 5 minutes, sign-in for that name pauses until the 5 minutes pass.
- After 30 failed sign-in or account attempts (or the number set in Administration) from one address within 15 minutes, further attempts from that address pause until the window passes.

## Messages

| Message | Cause | What to do |
|---|---|---|
| Wrong user name or password. | The name or password does not match | Check both and try again |
| Too many attempts. Try again in a few minutes. | The guessing limit was reached | Wait a few minutes |
| That user name is taken. | Another account has the name | Choose another name |
| User names are 3 to 32 letters, digits, dots, dashes or underscores, starting with a letter or digit. | The name breaks the rule | Choose a valid name |
| Passwords need at least N characters. | The password is shorter than the minimum length | Use a longer password |
| This server needs an invite code to create an account. | Sign-up is by invite and no code was entered | Enter the invite code from an admin |
| That invite code is not valid or was already used. | The code is unknown or was used | Ask an admin for a new code |
| This account is turned off. Ask the server's admin. | An admin turned the account off | Ask an admin |
| The passwords do not match. | The two password fields differ | Type them again |
| New accounts are turned off on this server. | Sign-up is closed | Ask an admin for an account |
| The current password is wrong. | Change password was given the wrong current password | Enter the current password again |
| The new passwords do not match | The two new password fields differ | Type them again |
| Password changed. Other devices are signed out. | The password was changed | None |
| You are signed out. Sign in again to continue. | The session ended or expired | Sign in again |
| That device is not signed in. | Remove was used on a phone that was already removed | None |
