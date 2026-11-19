# Decks

A deck has a name, a format, a mode and cards in up to three zones. Decks belong to the account that made them; they can be shared or sent as described in [Sending and sharing](/about/sending-and-sharing). One deck is open at a time; Add to deck puts cards into it.

## Deck fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Deck name | Text, 1 to 100 characters | Yes | None | Shown in the menu bar, Deck list and Decks panel |
| Format | Commander, Standard, Pioneer, Modern, Legacy, Pauper, Vintage or Casual | Yes | Commander | A label for the deck. Mana Vault does not enforce format rules |
| Deck mode | Normal or Theme | Yes | Normal | Set when the deck is created and cannot be changed |

## Deck modes

| Mode | How cards are kept | Use it for |
|---|---|---|
| Normal | By card name. Any printing counts, and the deck shows "Any printing". Adding a second printing of the same card raises the count of the existing row | Playable decks where the artwork does not matter |
| Theme | By exact printing. Each printing is its own row with its set and collector number | Decks built around specific artwork or sets |

Exports and imports follow the mode: Theme decks write and need a set code and collector number for each card.

## Zones

| Zone | Meaning |
|---|---|
| Main deck | The cards you play |
| Sideboard | Extra cards kept with the deck |
| Commander | The commander or commanders of a Commander deck |

The **target zone** decides where Add to deck puts a card. It starts at Main deck and is kept for your account. Change it with the Deck ribbon tab, the Deck menu, the Deck list panel switch, the ZONE item in the status bar, or **Z** (Main deck, then Sideboard, then Commander).

## Creating and opening decks

1. **New deck...** (Ctrl+N) asks for the name, format and mode. **Create deck** creates it and opens it.
2. **Open deck...** (Ctrl+O) lists every deck with its format, mode and card count, and opens the chosen deck in the deck view.
3. Clicking a deck in the Decks panel opens it; double-clicking also shows it in the work area.

The last deck you opened opens again the next time you sign in.

## Renaming and deleting decks

- **Rename deck...** (Deck menu or Decks ribbon tab) changes the open deck's name, 1 to 100 characters. Renaming a shared deck changes it for both people.
- **Delete deck...** asks "Delete name and its N cards?" and removes the deck. A deck you share warns that the other people will lose it too. Deleting cannot be undone, and it clears the undo history.
- For a deck shared with you, the command is **Leave shared deck...**: the deck stays with its owner and leaves your list.

## Building a deck

1. Select a card in the card search.
2. Press Shift+Enter or choose **+ Deck** (or **Add to deck**). One copy goes into the target zone.
3. Change counts with the minus and plus buttons in the deck view or the Deck list panel. Each row holds 1 to 100 copies. Minus at 1, or the remove button, removes the row.
4. In the deck view, the zone list on each row moves all its copies to another zone. When the same card is already in that zone, the counts are added together.

## The deck view

Press **3** (or **Deck**) to open it. The header shows the deck name, format, mode and total cards. Cards are grouped under Commander, Main deck and Sideboard headings with a count for each zone, and sorted by name. Each row shows the image, name, mana cost, type line, the printing (Theme) or "Any printing" (Normal), the count controls, the zone list and a remove button.

## Undo

Adding cards, changing counts, moving between zones and removing cards can be undone and redone. Creating, renaming and deleting decks cannot be undone.
