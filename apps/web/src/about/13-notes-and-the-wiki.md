# Notes and the Wiki

Notes are pages of formatted text for yourself and the people you share with: a deck primer, a sideboard guide, a list of cards to buy, plans for a binder. Each deck and each collection has its own tree of pages on its **Notes** tab, and the **Wiki** tab shows every page you can read, including pages not attached to anything.

## Pages

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Title | Text, 1 to 200 characters | Yes | None | Shown in the tree and as the page heading. The top page of a deck or collection always has its name |
| Text | Formatted text, up to 500,000 characters | No | Empty, or the template's text | Saved as markdown |
| Attached to | A deck, a collection, or nothing | No | Where the page was made | A child page always belongs to the same deck or collection as its parent |
| Parent | Another page | No | None | Pages can be nested to any depth |
| Order | Place among the pages beside it | No | At the end | Changed by dragging |
| Pinned | Yes or no | No | No | Your own choice: pinning does not pin the page for others |

The page shows when it was last saved and by whom, and where it is (the deck or collection, or My pages).

### The top page of a deck or collection

The first time a deck's or collection's Notes tab opens, its top page is made, named after the deck or collection. Its child pages hang under it. The top page cannot be deleted or moved, and renaming the deck or collection renames it.

A deck's top page is the deck's description: what was on the Description tab before 0.22.0 became the text of the top page, and saving either one changes the other.

## The Notes tab

Decks and collections (not All collections) have a **Notes** tab. On a deck it also holds the **Cover card** and **Format** that were on the Description tab.

The tab shows the deck's or collection's tree on the left and the open page on the right. On a phone the open page fills the screen and **Pages** shows the tree. The tab keeps the open page while you switch to other tabs and back.

## The Wiki tab

**Wiki** is a mode tab on the desktop (key 7) and a **Wiki** button on the phone's Home screen; **Wiki view** is also in the View menu and the phone's Menu. The header has **New page...**, **From web address...**, **Import pages...**, **Export...** and **Templates...**.

The left side, from top to bottom:

| Part | Shows |
|---|---|
| Search notes | A box that finds pages whose title or text holds every word typed, with the matching text under each result. A title match comes first. Clear the box to see the tree again |
| Pinned | The pages you pinned (shown only when there are some) |
| Recent | The last 10 pages you opened |
| Decks | Each deck whose notes have text or child pages, as a branch with its pages |
| Collections | Each collection whose notes have text or child pages, as a branch with its pages |
| My pages | Pages not attached to anything, with **New page...**. Only you see them |

Click a page to open it; the small arrow before a page hides or shows the pages under it. Each section heading hides or shows the section.

## Editing a page

Pages are shown formatted at all times. On the desktop you can type in a page at once; on a phone tap **Edit** to start and **Done** to finish. Changes are saved 1 second after the last change, when you open another page and when you leave the program. The word beside the title shows **Saved**, **Not saved yet**, **Saving** or **Not saved** (when saving failed; the next change tries again).

| Button | What it does | Typed shortcut |
|---|---|---|
| H1, H2, H3 | Heading 1, Heading 2, Heading 3 | `# `, `## `, `### ` at the start of a line |
| Bold, Italic | Bold and italic text | Ctrl+B, Ctrl+I, `**text**`, `*text*` |
| Strikethrough, Code | Crossed out text and inline code | `~~text~~`, `` `text` `` |
| Bullet list, Numbered list | Lists | `- ` or `1. ` at the start of a line |
| Checklist | A list of tick boxes | `[ ] ` at the start of a line |
| Quote, Code block | A quoted block and a block of code | `> ` and three backticks at the start of a line |
| Divider | A line across the page | `---` on its own line |
| Table | A table of 3 rows and 3 columns with a heading row. While the cursor is in a table, **Add row**, **Add column**, **Delete row**, **Delete column** and **Delete table** show beside it, and its right-click menu has Add row above, Add row below, Add column left, Add column right, Delete row, Delete column and Delete table | |
| Link | Asks for a web address and links the selected text (or adds the address as a link). An empty address removes the link. Ctrl+click opens a link while editing | Ctrl+K |
| Page link | A link to another page (see below) | `[[` |
| Card link | A link to a card (see below) | |
| Picture | Adds a picture from a file | Paste or drop a picture |
| Undo, Redo | Undo and redo typing in the page | Ctrl+Z, Ctrl+Y |

Checklist boxes tick with a click while reading a page on a phone too, and the change is saved.

### Page links

**Page link** (or typing `[[`) opens a list of page titles with a find box. Choose a page, or type a new title and choose **New page: title**. The link shows the title on a blue background. A link to a page that does not exist is red with a dashed line; clicking it makes the page (beside the page the link is on) and opens it.

Clicking a link opens the page with that title: one in the same deck or collection first, then any page you can read with that title. Titles are matched without regard to capital letters. Renaming a page changes the links to it in every page you can read, and the message names how many pages changed. Each page lists the pages that link to it under **Linked from** at the bottom.

### Card links

**Card link** opens a find box for card names (type at least two letters). The link shows the card name in green. Pointing at it on the desktop shows the card's picture (the newest printing); clicking or tapping it opens the card page.

### Pictures

Pictures (PNG, JPEG, GIF, WebP, AVIF or SVG, up to 20 MB) are kept on the server with the page. Pictures larger than 2,000 pixels on a side are made smaller before they are sent. A picture opens full size in a new tab with a click while reading, or a double click while editing. A picture's address is a long random code, so it can be shown in the Android app and in exported pages; anyone who has the address can open the picture.

## Child pages, moving and deleting

| Command | Where | What it does |
|---|---|---|
| New child page... | The page header, and the right-click menu of a page (long press on a phone) | Makes a page under this one |
| Rename... | Right-click menu | Changes the title (also done by typing in the title at the top of the page) |
| Pin, Unpin | The page header and the right-click menu | Adds the page to Pinned, or takes it off |
| Save as template... | Right-click menu | Saves the page's text as one of your templates |
| Move to... | Right-click menu | Moves the page and its child pages under another page, to the top of a deck's or collection's notes, or to My pages (top level) |
| Export... | Right-click menu | See Import and export below |
| New child page from web address... | Right-click menu | Makes a child page from a web page (see Web pages below) |
| Import pages here... | Right-click menu | Imports markdown and HTML files as child pages of this page |
| History... | The page header and the right-click menu | See History below |
| Delete... | Right-click menu | Deletes the page. A page with child pages asks: **Delete with child pages** or **Move child pages up** (they take the deleted page's place) |
| More... | The page header | Opens the right-click menu of the page |

Drag a page in the tree onto another page to put it under that page, or onto the top or bottom edge of a page to put it before or after that page. A blue line or box shows where it lands. Dropping onto a deck's or collection's top page puts the page under it. Pages are dragged on the desktop; on a phone use **Move to...**.

New pages, moves, deletes and template deletes can be undone (Ctrl+Z or the Undo button). Deleted pages can be put back for a day.

## Templates

**New page...** asks for a title and **Start from**: Blank, a built-in template or one of yours.

| Template | Holds |
|---|---|
| Deck primer | Overview, Game plan, Key cards, Mulligans, Combos, Matchups (a table) and Changes |
| Combo | Pieces, Steps and Results |
| Sideboard guide | A table of matchups with what comes in and what goes out |
| Collection plan | Goals, Wanted cards (a checklist) and Notes |

**Save as template...** saves any page's text under a name. **Templates...** (Wiki header, and **Notes templates...** in the File menu) lists the built-in templates and yours, with **Rename** and **Delete** for yours.

## History

Every save keeps a version of the page. Saves from the same browser page or phone within 10 minutes join one version, so typing does not make a new version each second. The newest 50 versions are kept, and older than those, the last version of each day for 90 days.

**History...** lists the versions with their time and who saved them (the newest is marked Current). Choose one to see it, and **Restore** to make it the page's text again. A restore is a version of its own, so it can be reversed by restoring the version before it.

## Two people editing at once

When someone else (or you, on another device) saved the page after you opened it, your next save shows both texts side by side and asks which to keep:

| Choice | Result |
|---|---|
| Keep mine | Your text replaces theirs. Theirs stays in History |
| Keep theirs | Their text is shown and yours is dropped |
| Keep both | Their text stays on the page, and yours becomes a new page beside it named "title (my copy)" |
| Decide later | Nothing is saved yet; the page shows **Not saved** and asks again at the next save |

A page that is open but not being changed shows the newest text as soon as someone else saves it.

## Sharing

The notes of a deck or collection follow its sharing: everyone it is shared with can read and change its notes, see its pages in the Wiki and search them. Pages in My pages are private. Moving a page into a shared deck or collection shows it to its members; moving it to My pages makes it private to the person who moved it. Deleting a deck or collection deletes its notes. Sending a copy of a deck or collection does not copy its notes.

## Import and export

**Export...** offers **This page and its child pages**, **The whole deck or collection tree** (for a page in a deck or collection) and **The whole Wiki**. The download is a zip of .md files in folders that follow the tree: a page with child pages is a .md file with a folder of the same name beside it. Pictures are in an `attachments` folder and the pages point to them there. Page and card links stay as `[[Page title]]` and `[[card:Card name]]`.

**Import pages...** (Import markdown... before 0.23.0) takes .md, .markdown, .txt, .html and .htm files and pictures, or a zip of them (such as an Obsidian vault or a saved web page). Each folder becomes a page with the files in it as its child pages, and a file named like a folder becomes that folder's page. Settings at the top of a markdown file between `---` lines are left out. Pictures among the files are added when a page names them as `![text](path/name.png)`, `![[name.png]]` or (in an HTML file) `<img src="path/name.png">`; they are found by their path or their file name. HTML files are read as described in Web pages below. From the Wiki header and the File menu the imported pages go into My pages; Import pages here... puts them under the page chosen. Import can be undone, which deletes the imported pages.

## Web pages

Web pages come into notes in three ways:

| Way | How | What is kept |
|---|---|---|
| Paste | Copy part or all of a web page in a browser and paste it into a notes page | What was selected |
| Import pages... | Choose .html files, or a page saved from a browser: its .html file with the pictures from its folder (Page_files), chosen together or in a zip | The page's main article |
| From web address... | Type a web address (https:// is added when it is left out). The server fetches the page; the new page is titled from the article | The page's main article |

- **Main article:** for whole pages, menus, navigation, ads, sidebars, comments, footers, scripts and forms are dropped. When no article is found, the whole page is kept. A page title that adds the site's name to the article's heading ("Primer - Site") is shortened to the heading, and a first heading that repeats the title is dropped.
- **Source line:** an imported or fetched page starts with "Source: address, copied date". For a saved page the address is the one the browser noted when saving it; without one it is the file name.
- **Simplified:** headings, bold, italic, strikethrough, lists, tables, links, quotes, code blocks, dividers and pictures stay, in reading order. Colors, fonts, columns, boxes and backgrounds are dropped. An embedded video, map or sound becomes a link: **Watch the video**, **Open the map**, **Listen to the audio** or **Open the embedded content**. Links to places on the same page become plain text, and links on the page become full web addresses.
- **Pictures:** each picture from the web is copied to the server and kept as a note picture (the same kinds and 20 MB limit as other pictures). While pasted pictures are copied, the page shows **Copying N pictures**. A picture that cannot be copied stays as a link to its web address, and a message names how many.
- **Limits:** the server fetches http and https addresses only, up to 10 MB in 20 seconds, following up to 5 redirects. Addresses on the server's own network (localhost, private, local and link-local addresses, and names that lead to them) are refused. Pages behind a sign-in cannot be fetched by the server; copy and paste them instead.

Deck exports in **Plain text list** end with the deck's description (its top notes page) as lines starting with `//` under `// Notes`. Deck imports skip lines that start with `//`.

## Android app

Pages you can read are kept on the phone and can be read, searched, changed, made, moved, pinned and deleted without a connection. Pictures added offline are kept on the phone and sent with the changes. When the connection returns, the changes are sent; when a page was changed on the server meanwhile, the app asks which text to keep (see Two people editing at once). Templates, History, import, export and New page from web address... need a connection. Pictures pasted from the web while offline stay as links; they are copied when the connection returns while the page is open, or the next time the page is opened online.

## Backups

Account backups hold your pages (on your own decks and collections and in My pages), their versions and pictures, your pins and your templates. Restoring a backup replaces your pages in My pages and your templates, and puts back the pages of the restored decks and collections. Server backups hold everything.
