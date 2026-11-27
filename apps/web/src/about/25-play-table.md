# Play table

The **Play** mode is a workspace for testing saved decks. Open it from the desktop or phone mode tabs, or choose **Open Play workspace** in a deck's Playtest tab.

## Modes

| Mode | What it does |
|---|---|
| Engine AI | Starts an optional Playmat game from a saved deck after checking exact card printings. During the player's selection prompt, cards marked playable by the engine can be played from hand, or priority can be passed until the next main phase. Supported prompts are answered in the native workspace, including concession. The server must have a Playmat engine configured. |
| Manual solo | Starts an offline game in this browser with a shuffled main deck, a seven-card hand, mulligans, draws, zones, taps, counters, tokens, life, poison, dice and coin flips. |
| Multiplayer table | Hosts a private manual Commander table for two or four signed-in players, joins a waiting table, or watches with an invitation code. |

Manual play is a tabletop helper, not a rules engine. Players resolve spells, priority, combat, triggers and other Magic rules themselves. Playing cards never changes the saved deck or collection.

## Manual solo

Choose a saved deck and select **Manual solo**. **New manual game** shuffles the main deck and draws seven. **Mulligan** draws a new hand and asks you to put one card per mulligan on the bottom. Cards from the saved deck, including original custom cards, can be moved through the manual zones. Use the zone buttons to play or move cards, track totals and counters, and add tokens. The game is local to the current browser session and is lost when the page is refreshed or closed.

## Multiplayer Commander

Choose a saved deck that has at least one card in its Commander zone. Select **Multiplayer table**, then create a two- or four-player table. Share the invitation code with the players you want to invite. A signed-in player needs a Commander deck to join. The host can start when every seat is filled.

Each player sees their own hand, public battlefield and graveyard zones, and the number of cards in each player's hand and library. Opponents' hand and library contents are not returned by the server. Players can draw and shuffle their libraries, play and move their cards, tap cards, track life, poison, counters, commander damage and tokens, change turns, and concede.

The server stores active table state so a seated player can reload the page or reconnect with the same account. A signed-in spectator with the invitation code can watch public table state, but cannot see any hand or library contents or change the game. The Play workspace lists the most recently created waiting or active table. Recovery after a server process restart has not been verified. A player who leaves an active table concedes.

## Limits

- Manual games do not enforce Magic rules. They do not resolve spells, targets, combat, priority or Commander-specific rules.
- Manual tables currently have no match history, attachments, face-down card controls or general undo.
- Engine AI is optional and is unavailable unless an administrator separately configures the Playmat service. The workspace supports only the engine prompts it currently displays, including card play when the engine marks a hand card playable, passing priority until the next main phase and concession. A real-engine browser test exercises starting from a saved deck, keeping the opening hand, playing an engine-approved land, passing priority and ending by concession; it does not verify a non-concession win or all gameplay prompts.
- The private Compose profile, unpublished engine port and trusted-header boundary passed the Play engine integration workflow. Production deployment and engine reconnect or outage behavior remain unverified. Do not publish the engine port or configure an untrusted engine endpoint.
- Engine AI and Android-specific table behavior have not been independently validated against a production deployment.
