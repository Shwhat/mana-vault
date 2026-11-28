# Play table

The **Play** mode is a workspace for testing saved decks. Open it from the desktop or phone mode tabs, or choose **Open Play workspace** in a deck's Playtest tab.

## Modes

| Mode | What it does |
|---|---|
| Engine AI | Starts an optional Playmat game from a saved deck after checking exact card printings. The workspace shows the engine-provided turn, phase, step, active player and priority when available. Cards marked playable by the engine can be chosen from hand or the battlefield, offered abilities and combatants can be selected, mana can be paid with approved battlefield sources, and priority can be passed. Supported prompts are answered in the native workspace, including concession. The server must have a Playmat engine configured. |
| Manual solo | Starts an offline game in this browser with a shuffled main deck, a seven-card hand, mulligans, draws, library search and shuffle, zones, taps, face-down cards, counters, tokens, life, poison, dice and coin flips. |
| Multiplayer table | Hosts a private manual Commander table for two or four signed-in players, joins a waiting table, or watches with an invitation code. |

Engine AI shows when game updates are unavailable and retries them. Action errors remain visible until another action is attempted. A restored connection must rejoin its tracked games before it can serve updates; real-engine recovery is not yet verified.

Manual play is a tabletop helper, not a rules engine. Players resolve spells, priority, combat, triggers and other Magic rules themselves. Playing cards never changes the saved deck or collection.

In manual solo and multiplayer games, use the **Drag** area on your own cards to drag them between zones, or use each card's **Move to** selector, including on touch devices. The selector offers the top or bottom of the library; the Library drop target places cards on the bottom. Open library search to move cards out of your library. Changing zones clears counters, and leaving the battlefield clears attachments. During a solo mulligan, choose the required cards to put on the bottom before moving other cards from hand.

On your battlefield cards, choose +1/+1, -1/-1, loyalty, charge or custom counters and add or remove them. Multiplayer boards show counters to players and spectators, including on face-down cards without revealing their identities. Counter totals can range from 0 to 999.

## Manual solo

Choose a saved deck and select **Manual solo**. **New manual game** shuffles the main deck and draws seven. **Mulligan** draws a new hand and asks you to put one card per mulligan on the bottom. Cards from the saved deck, including original custom cards, can be moved through the manual zones. Use the zone buttons to play or move cards, copy battlefield cards, track totals and counters, and add tokens. The game is local to the current browser session and is lost when the page is refreshed or closed.

## Multiplayer Commander

Choose a saved deck that has at least one card in its Commander zone. Select **Multiplayer table**, then create a two- or four-player table. Share the invitation code with the players you want to invite. A signed-in player needs a Commander deck to join. The host can start when every seat is filled.

At a new table, choose **Mulligan** to shuffle your hand into your library and draw up to seven cards. The first multiplayer Commander mulligan is free. After each later mulligan, choose one card to put on the library bottom for each mulligan after the first; once the required cards are chosen, the hand is kept. You can mulligan again instead of choosing those cards, up to eight times. **Keep hand** accepts a hand with no cards pending. Other game actions close your own mulligan option, and ending the first turn closes it for everyone; dice and coin flips do not. A turn cannot end while any player still has cards to put on the bottom. The choice is private and survives reconnecting. Existing games started before this feature do not have mulligan controls.

Each player sees their own hand, public battlefield and graveyard zones, and the number of cards in each player's hand and library. Opponents' hand and library contents are not returned by the server. Players can privately search their own library by name and move a selected card to hand; results are sorted rather than showing draw order. Shuffle separately after searching when appropriate. Players can play cards directly from hand face down, turn battlefield cards face down, and reveal their own cards. Opponents and spectators receive no card identity or artwork for a face-down card; the owner can still see its name. Players can also draw and shuffle their libraries, move cards, tap cards, track life, poison, counters, commander damage and tokens, change turns, and concede.

Add or remove commander damage attributed to your seat on an opponent's board to correct the tracked total. The table does not calculate commander damage or losses automatically.

Use **Roll d6**, **Roll d20**, or **Flip coin** for a server-generated result. Players and spectators see the latest numbered result and the seat that generated it; a new roll replaces the previous result. The number distinguishes repeated identical outcomes. Spectators cannot roll.

The server stores active table state so a seated player can reload the page or reconnect with the same account. A signed-in spectator with the invitation code can watch public table state, but cannot see any hand or library contents or change the game. The Play workspace lists the most recently created waiting or active table. Recovery after a server process restart has not been verified. A player who leaves an active table concedes.

When a player loses under the rules the group is using, they can select **Report loss**. This removes that player from the game without marking it as a concession; only the player can report their own loss. The table skips players who have lost or conceded and closes when one player remains. Players and spectators see the reported results. Losses are not detected automatically.

Select **Show manual game history** to see your finished or closed manual games, 50 at a time. A game closed before only one player remains is marked as closed before a result. Results reflect player reports, not enforced rules. You can view the snapshot of your own deck captured when you created or joined the table while you still have access to that deck. Other players' snapshots and spectators' history are not available. Hide and reopen history to refresh it.

## Limits

- Manual games do not enforce Magic rules. They do not resolve spells, targets, combat, priority or Commander-specific rules.
- Manual attachments connect battlefield cards, not players or other zones; players resolve attachment rules themselves. Attachments are cleared when either card leaves the battlefield.
- Copy creates a token from one of your battlefield cards. It preserves face-down status but starts untapped and without counters or attachments. Players resolve copy rules themselves; copying opponents' cards is not available.
- Manual game history records table creation, game start and table closure times in UTC when available. Start and closure times for older games are not reconstructed. History does not include win-rate analytics or general undo.
- Engine AI is optional and is unavailable unless an administrator separately configures the Playmat service. The workspace supports only the engine prompts it currently displays, including hand or battlefield choices, offered abilities, available attackers and blockers, target, pile and list choices, amount distributions, passing priority and concession. List choices support search, optional cancellation and special choices with an item selected; responses longer than 1000 characters and special choices without an item are unavailable. Single numeric prompts honor engine bounds within the workspace limit of -10000 to 10000 and can be cancelled. Amount distributions allow up to 500 entries and a response of up to 1000 characters; cancellation is available only when the engine offers it. Selection prompts can offer passing even when other choices are unavailable. Combat, target, pile, list and amount distribution interactions have mocked browser coverage but have not yet been verified in a complete real game. An isolated CI test completed an all-land engine game through the native workspace without the player conceding. This narrow test does not verify combat, targeting or all gameplay prompts.
- The private Compose profile, unpublished engine port and trusted-header boundary passed the Play engine integration workflow. Production deployment and engine reconnect or outage behavior remain unverified. Do not publish the engine port or configure an untrusted engine endpoint.
- Engine AI and Android-specific table behavior have not been independently validated against a production deployment.
