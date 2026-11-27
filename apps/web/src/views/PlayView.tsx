import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { request } from "../api";
import { Icon } from "../icons";
import {
  addManualToken, changeManualCounter, changeManualTotal, drawManualCards, moveManualCard,
  nextManualTurn, playManualCard, shuffleManualLibrary, startManualGame, toggleManualTap, type ManualCard, type ManualGame, type ManualZone,
} from "../manual-play";
import { useApp } from "../store";
import type { DeckCard } from "../types";

type EngineEvent = {
  id: number;
  event: { method: string; objectId: string | null; messageId: number; data: unknown };
};
type GameType = { name: string };
type EngineOptions = { gameTypes: unknown[]; deckTypes: unknown[] };
type EngineResponse = { tableId: string; gameId: string };
type SharedPlayer = {
  seat: number;
  name: string;
  deckName?: string;
  life: number;
  poison: number;
  libraryCount: number | null;
  handCount: number | null;
  hand?: ManualCard[];
  battlefield: ManualCard[];
  graveyard: ManualCard[];
  exile: ManualCard[];
  command: ManualCard[];
  commanderDamage: Record<string, number>;
  conceded: boolean;
};
type SharedTable = {
  id: string;
  status: "waiting" | "active" | "closed";
  role: "player" | "spectator";
  playerLimit: number;
  revision: number;
  inviteCode?: string;
  turn: number | null;
  activeSeat: number | null;
  players: SharedPlayer[];
};

const PROMPTS = new Set([
  "GAME_TARGET", "GAME_CHOOSE_ABILITY", "GAME_CHOOSE_PILE", "GAME_CHOOSE_CHOICE", "GAME_ASK", "GAME_SELECT",
  "GAME_PLAY_MANA", "GAME_PLAY_XMANA", "GAME_GET_AMOUNT", "GAME_GET_MULTI_AMOUNT",
]);
const STATE_EVENTS = new Set(["GAME_INIT", "GAME_UPDATE", "GAME_UPDATE_AND_INFORM", "GAME_INFORM_PERSONAL"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function namedOptions(values: unknown[]): GameType[] {
  return values.flatMap((value) => {
    if (typeof value === "string") return [{ name: value }];
    const item = record(value);
    return typeof item?.name === "string" ? [{ name: item.name }] : [];
  });
}

function cardName(value: unknown): string {
  const card = record(value);
  if (!card) return "Card";
  if (typeof card.displayName === "string") return card.displayName;
  return typeof card.name === "string" ? card.name : "Card";
}

function cardObjectId(value: unknown): string | null {
  const card = record(value);
  const id = card?.id ?? card?.cardId;
  return typeof id === "string" ? id : null;
}

function cardsIn(value: unknown): unknown[] {
  const cards = record(value);
  return cards ? Object.values(cards) : [];
}

function gameView(event: EngineEvent | undefined): Record<string, unknown> | null {
  const data = record(event?.event.data);
  return record(data?.gameView) ?? data;
}

function eventMessage(event: EngineEvent): string {
  const data = record(event.event.data);
  const text = data?.message ?? data?.text ?? data?.prompt ?? data?.question;
  return typeof text === "string" ? text : event.event.method.replaceAll("_", " ").toLowerCase();
}

function cardPicture(card: Pick<ManualCard, "name" | "imageUrl" | "custom" | "token" | "faceDown">) {
  if (card.faceDown) return <span className="playcardname">Face down</span>;
  return card.imageUrl
    ? <img src={card.imageUrl} alt={card.name} draggable={false} />
    : <span className="playcardname">{card.name}{card.custom && <small>Custom</small>}{card.token && <small>Token</small>}</span>;
}

function ManualSolo({ cards }: { cards: readonly DeckCard[] }) {
  const [game, setGame] = useState<ManualGame | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [roll, setRoll] = useState("");

  useEffect(() => {
    setGame(null);
    setShowLibrary(false);
  }, [cards]);

  const newGame = (mulligans = 0) => setGame(startManualGame(cards, mulligans));
  const move = (card: ManualCard, from: ManualZone, to: Exclude<ManualZone, "library">) => {
    setGame((current) => current ? moveManualCard(current, card.id, from, to) : current);
  };
  const play = (card: ManualCard) => setGame((current) => current ? playManualCard(current, card.id) : current);

  if (!game) {
    return (
      <section className="play-panel">
        <h2>Manual solo game</h2>
        <p>Play offline with a saved deck. Rules are resolved by you, and no game action changes the saved deck or collection.</p>
        <button type="button" className="btn primary" disabled={!cards.some((card) => card.zone === "main" && card.quantity > 0)} onClick={() => newGame()}>
          New manual game
        </button>
        {!cards.some((card) => card.zone === "main" && card.quantity > 0) && <p className="note">Add cards to the main deck before starting.</p>}
      </section>
    );
  }

  const zone = (title: string, values: readonly ManualCard[], body: (card: ManualCard) => ReactNode, extra?: ReactNode) => (
    <section className="play-zone">
      <h3>{title} <span className="cnt">{values.length}</span>{extra}</h3>
      <div className="play-card-row">{values.map((card) => <article className={card.tapped ? "play-card tapped" : "play-card"} key={card.id}>
        {cardPicture(card)}
        <div className="play-card-actions">{body(card)}</div>
      </article>)}</div>
    </section>
  );

  return (
    <div className="play-panel">
      <div className="play-toolbar">
        <button type="button" className="btn small primary" onClick={() => newGame()}>New game</button>
        <button type="button" className="btn small" onClick={() => newGame(game.mulligans + 1)}>Mulligan</button>
        <button type="button" className="btn small" disabled={!game.library.length} onClick={() => setGame((current) => current ? drawManualCards(current) : current)}>Draw</button>
        <button type="button" className="btn small" disabled={game.library.length < 2} onClick={() => setGame((current) => current ? shuffleManualLibrary(current) : current)}>Shuffle library</button>
        <button type="button" className="btn small" onClick={() => setGame((current) => current ? nextManualTurn(current) : current)}>Next turn and untap</button>
        <button type="button" className="btn small" onClick={() => setShowLibrary((current) => !current)}>{showLibrary ? "Hide library" : "Show library"}</button>
        <span className="phpos">Turn {game.turn} · {game.library.length} in library · {game.mulligans} mulligans</span>
      </div>
      {game.bottom > 0 && <p className="legalbar warn">Choose {game.bottom} card{game.bottom === 1 ? "" : "s"} from your hand to put on the bottom.</p>}
      <div className="play-totals">
        <span>Life <button type="button" className="btn small" aria-label="Lose one life" onClick={() => setGame((current) => current ? changeManualTotal(current, "life", -1) : current)}>-</button> <b>{game.life}</b> <button type="button" className="btn small" aria-label="Gain one life" onClick={() => setGame((current) => current ? changeManualTotal(current, "life", 1) : current)}>+</button></span>
        <span>Poison <button type="button" className="btn small" aria-label="Remove one poison counter" onClick={() => setGame((current) => current ? changeManualTotal(current, "poison", -1) : current)}>-</button> <b>{game.poison}</b> <button type="button" className="btn small" aria-label="Add one poison counter" onClick={() => setGame((current) => current ? changeManualTotal(current, "poison", 1) : current)}>+</button></span>
        <form className="play-token" onSubmit={(event) => {
          event.preventDefault();
          setGame((current) => current ? addManualToken(current, tokenName) : current);
          setTokenName("");
        }}>
          <label htmlFor="play-token-name">Token</label>
          <input id="play-token-name" value={tokenName} onChange={(event) => setTokenName(event.target.value)} maxLength={100} />
          <button type="submit" className="btn small" disabled={!tokenName.trim()}>Add</button>
        </form>
        <span className="play-random">
          <button type="button" className="btn small" onClick={() => setRoll(`d20: ${1 + Math.floor(Math.random() * 20)}`)}>Roll d20</button>
          <button type="button" className="btn small" onClick={() => setRoll(Math.random() < 0.5 ? "Coin: heads" : "Coin: tails")}>Flip coin</button>
          {roll && <b role="status">{roll}</b>}
        </span>
      </div>
      {game.command.length > 0 && zone("Command zone", game.command, (card) => <button type="button" className="btn small" onClick={() => move(card, "command", "battlefield")}>Play</button>)}
      {zone("Battlefield", game.battlefield, (card) => <>
        <button type="button" className="btn small" onClick={() => setGame((current) => current ? toggleManualTap(current, card.id) : current)}>{card.tapped ? "Untap" : "Tap"}</button>
        <button type="button" className="btn small" onClick={() => setGame((current) => current ? changeManualCounter(current, card.id, "+1/+1", 1) : current)}>+1/+1</button>
        <button type="button" className="btn small" onClick={() => move(card, "battlefield", "graveyard")}>Graveyard</button>
        <button type="button" className="btn small" onClick={() => move(card, "battlefield", "exile")}>Exile</button>
        <button type="button" className="btn small" onClick={() => setGame((current) => current ? moveManualCard(current, card.id, "battlefield", "battlefield", { faceDown: !card.faceDown }) : current)}>{card.faceDown ? "Reveal" : "Face down"}</button>
        {Object.entries(card.counters).map(([name, count]) => <span className="badge" key={name}>{name}: {count}</span>)}
      </>)}
      {zone("Hand", game.hand, (card) => <button type="button" className="btn small primary" onClick={() => play(card)}>{game.bottom > 0 ? "Put on bottom" : "Play"}</button>)}
      {zone("Graveyard", game.graveyard, (card) => <button type="button" className="btn small" onClick={() => move(card, "graveyard", "hand")}>Return to hand</button>)}
      {zone("Exile", game.exile, (card) => <button type="button" className="btn small" onClick={() => move(card, "exile", "hand")}>Return to hand</button>)}
      {showLibrary && <section className="play-zone"><h3>Library <span className="cnt">{game.library.length}</span></h3>
        <label>Search library <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} /></label>
        <div className="play-library-list">{game.library.filter((card) => card.name.toLowerCase().includes(libraryQuery.trim().toLowerCase())).map((card) =>
          <span key={card.id}>{card.name} <button type="button" className="btn small" aria-label={`Put ${card.name} into hand`}
            onClick={() => move(card, "library", "hand")}>To hand</button></span>)}</div>
      </section>}
      <p className="note">Manual mode does not enforce Magic rules. It is local to this browser session; the engine and other players are not involved.</p>
    </div>
  );
}

function ManualTable({ deckId }: { deckId: string }) {
  const [table, setTable] = useState<SharedTable | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [watchCode, setWatchCode] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [library, setLibrary] = useState<{ revision: number; cards: ManualCard[] } | null>(null);
  const [libraryError, setLibraryError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async (id: string) => {
    const result = await request<{ table: SharedTable }>(`/api/play/manual/tables/${encodeURIComponent(id)}`);
    setTable(result.table);
  };

  useEffect(() => {
    let active = true;
    void request<{ tables: SharedTable[] }>("/api/play/manual/tables")
      .then(({ tables }) => { if (active && tables[0]) setTable(tables[0]); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load tables."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!table || table.status === "closed") return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await request<{ table: SharedTable }>(`/api/play/manual/tables/${encodeURIComponent(table.id)}`);
        if (active && result.table.revision !== table.revision) setTable(result.table);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not refresh the table.");
      }
      if (active) timer = window.setTimeout(() => { void poll(); }, 1200);
    };
    timer = window.setTimeout(() => { void poll(); }, 1200);
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [table?.id, table?.revision, table?.status]);

  useEffect(() => {
    setShowLibrary(false);
    setLibraryQuery("");
    setLibrary(null);
  }, [table?.id]);

  useEffect(() => {
    if (!showLibrary || !table || table.status !== "active" || table.role !== "player"
      || table.players.find((player) => player.hand !== undefined)?.conceded) return;
    let active = true;
    setLibraryError("");
    void request<{ revision: number; cards: ManualCard[] }>(`/api/play/manual/tables/${encodeURIComponent(table.id)}/library`)
      .then((result) => { if (active) setLibrary(result); })
      .catch((reason) => { if (active) setLibraryError(reason instanceof Error ? reason.message : "Could not search your library."); });
    return () => { active = false; };
  }, [showLibrary, table?.id, table?.revision, table?.status, table?.role]);

  const create = async (playerLimit: 2 | 4) => {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ table: SharedTable; inviteCode: string }>("/api/play/manual/tables", {
        method: "POST",
        body: JSON.stringify({ deckId, playerLimit }),
      });
      setTable(result.table);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the table.");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!table) return;
    try {
      await request(`/api/play/manual/tables/${encodeURIComponent(table.id)}/leave`, {
        method: "POST",
        body: "{}",
      });
      setTable(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not leave the table.");
    }
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request<{ table: SharedTable }>("/api/play/manual/tables/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: joinCode, deckId }),
      });
      setTable(result.table);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not join the table.");
    } finally {
      setBusy(false);
    }
  };

  const watch = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request<{ table: SharedTable }>("/api/play/manual/tables/watch", {
        method: "POST",
        body: JSON.stringify({ inviteCode: watchCode }),
      });
      setTable(result.table);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not watch the table.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: Record<string, unknown>) => {
    if (!table) return;
    setError("");
    try {
      const result = await request<{ table: SharedTable }>(`/api/play/manual/tables/${encodeURIComponent(table.id)}/actions`, {
        method: "POST",
        body: JSON.stringify({ revision: table.revision, action }),
      });
      setTable(result.table);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The table did not accept that action.";
      try {
        await refresh(table.id);
        setError(message);
      } catch (refreshReason) {
        const refreshMessage = refreshReason instanceof Error ? refreshReason.message : "Could not refresh the table.";
        setError(`${message} ${refreshMessage}`);
      }
    }
  };

  const start = async () => {
    if (!table) return;
    setError("");
    try {
      const result = await request<{ table: SharedTable }>(`/api/play/manual/tables/${encodeURIComponent(table.id)}/start`, {
        method: "POST",
        body: "{}",
      });
      setTable(result.table);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the table.");
    }
  };

  const close = async () => {
    if (!table) return;
    try {
      await request(`/api/play/manual/tables/${encodeURIComponent(table.id)}`, { method: "DELETE" });
      setTable(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not close the table.");
    }
  };

  const own = table?.players.find((player) => player.hand !== undefined);
  const zone = (title: string, cards: readonly ManualCard[], body: (card: ManualCard) => ReactNode) => (
    <section className="play-zone" key={title}>
      <h3>{title} <span className="cnt">{cards.length}</span></h3>
      <div className="play-card-row">{cards.map((card) => <article className={card.tapped ? "play-card tapped" : "play-card"} key={card.id}>
        {cardPicture(card)}
        <div className="play-card-actions">{body(card)}</div>
      </article>)}</div>
    </section>
  );
  const move = (card: ManualCard, from: string, to: string) => void act({ type: "move", cardId: card.id, from, to });

  return (
    <section className="play-panel">
      <h2>Multiplayer Commander table</h2>
      {!table && <>
        <p>Host a private two- or four-player table, join with a Commander deck, or watch with an invitation code. Player hands and libraries stay private.</p>
        <div className="play-toolbar">
          <button type="button" className="btn primary" disabled={!deckId || busy} onClick={() => void create(2)}>Create two-player table</button>
          <button type="button" className="btn" disabled={!deckId || busy} onClick={() => void create(4)}>Create four-player table</button>
        </div>
        <form className="play-toolbar" onSubmit={(event) => void join(event)}>
          <label htmlFor="play-join-code">Invitation code</label>
          <input id="play-join-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} maxLength={32} autoComplete="off" />
          <button type="submit" className="btn" disabled={!deckId || !joinCode.trim() || busy}>Join table</button>
        </form>
        <form className="play-toolbar" onSubmit={(event) => void watch(event)}>
          <label htmlFor="play-watch-code">Watch with code</label>
          <input id="play-watch-code" value={watchCode} onChange={(event) => setWatchCode(event.target.value)} maxLength={32} autoComplete="off" />
          <button type="submit" className="btn" disabled={!watchCode.trim() || busy}>Watch table</button>
        </form>
        {!deckId && <p className="note">Choose a saved Commander deck with a commander to host or join. Watching does not require a deck.</p>}
      </>}
      {table && <>
        <div className="play-toolbar">
          <b>{table.status === "active" ? `Turn ${table.turn}` : table.status === "closed" ? "Game ended" : "Waiting for players"}</b>
          {table.inviteCode && <span className="badge">Invite code: {table.inviteCode}</span>}
          {table.status === "waiting" && table.inviteCode && <button type="button" className="btn small primary" onClick={() => void start()}
            disabled={table.players.length !== table.playerLimit}>Start game</button>}
          {table.inviteCode && <button type="button" className="btn small" onClick={() => void close()}>Close table</button>}
          <button type="button" className="btn small" onClick={() => void leave()}>Leave table</button>
        </div>
        {table.status === "waiting" && <div className="play-player-row">
          {Array.from({ length: table.playerLimit }, (_, seat) => {
            const player = table.players.find((item) => item.seat === seat);
            return <section className="play-player" key={seat}><b>Seat {seat + 1}</b><span>{player ? `${player.name} · ${player.deckName ?? "Ready"}` : "Waiting for player"}</span></section>;
          })}
        </div>}
        {table.status === "active" && <>
          {table.role === "spectator" && <p className="note">You are watching this table. Spectators cannot change the game.</p>}
          <div className="play-player-row">
            {table.players.map((player) => <section className="play-player" key={player.seat}>
              <b>{player.name}{player.seat === table.activeSeat ? " · Active" : ""}{player.conceded ? " · Conceded" : ""}</b>
              <span>Life {player.life} · Poison {player.poison} · Hand {player.handCount} · Library {player.libraryCount}</span>
              {Object.entries(player.commanderDamage).map(([from, amount]) => <span key={from}>Commander damage from seat {Number(from) + 1}: {amount}</span>)}
              {own && player.seat !== own.seat && <div className="play-toolbar">
                <button type="button" className="btn small" onClick={() => void act({ type: "commanderDamage", targetSeat: player.seat, delta: 1 })}>+ Commander damage</button>
              </div>}
              <div className="play-card-row">{player.command.map((card) => <div className="engine-card" key={card.id}>{card.name}</div>)}
                {player.battlefield.map((card) => <div className="engine-card" key={card.id}>{card.tapped ? "Tapped · " : ""}{card.name}</div>)}</div>
            </section>)}
          </div>
          {own && <>
          <div className="play-toolbar">
            <button type="button" className="btn small" disabled={!own.libraryCount} onClick={() => void act({ type: "draw" })}>Draw</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "shuffle" })}>Shuffle</button>
            <button type="button" className="btn small" onClick={() => setShowLibrary((current) => !current)}>{showLibrary ? "Hide library search" : "Search library"}</button>
            <button type="button" className="btn small" disabled={table.activeSeat !== own.seat} onClick={() => void act({ type: "turn" })}>End turn</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "concede" })}>Concede</button>
          </div>
          <div className="play-totals">
            <span>Life <button type="button" className="btn small" onClick={() => void act({ type: "life", delta: -1 })}>-</button> <b>{own.life}</b> <button type="button" className="btn small" onClick={() => void act({ type: "life", delta: 1 })}>+</button></span>
            <span>Poison <button type="button" className="btn small" onClick={() => void act({ type: "poison", delta: -1 })}>-</button> <b>{own.poison}</b> <button type="button" className="btn small" onClick={() => void act({ type: "poison", delta: 1 })}>+</button></span>
            <form className="play-token" onSubmit={(event) => {
              event.preventDefault();
              void act({ type: "token", name: tokenName });
              setTokenName("");
            }}>
              <label htmlFor="play-table-token">Token</label>
              <input id="play-table-token" value={tokenName} onChange={(event) => setTokenName(event.target.value)} maxLength={100} />
              <button type="submit" className="btn small" disabled={!tokenName.trim()}>Add</button>
            </form>
          </div>
          {own.command.length > 0 && zone("Command zone", own.command, (card) => <button type="button" className="btn small" onClick={() => move(card, "command", "battlefield")}>Play</button>)}
          {zone("Battlefield", own.battlefield, (card) => <>
            {card.faceDown && <span className="badge">Your card: {card.name}</span>}
            <button type="button" className="btn small" onClick={() => void act({ type: "tap", cardId: card.id })}>{card.tapped ? "Untap" : "Tap"}</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "faceDown", cardId: card.id })}>{card.faceDown ? "Reveal" : "Face down"}</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "counter", cardId: card.id, counter: "+1/+1", delta: 1 })}>+1/+1</button>
            {Object.entries(card.counters).map(([name, count]) => <span className="badge" key={name}>{name}: {count}</span>)}
            <button type="button" className="btn small" onClick={() => move(card, "battlefield", "graveyard")}>Graveyard</button>
            <button type="button" className="btn small" onClick={() => move(card, "battlefield", "exile")}>Exile</button>
          </>)}
          {zone("Hand", own.hand ?? [], (card) => <>
            <button type="button" className="btn small primary" onClick={() => move(card, "hand", "battlefield")}>Play</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "playFaceDown", cardId: card.id })}>Play face down</button>
          </>)}
          {zone("Graveyard", own.graveyard, (card) => <button type="button" className="btn small" onClick={() => move(card, "graveyard", "hand")}>Return to hand</button>)}
          {zone("Exile", own.exile, (card) => <button type="button" className="btn small" onClick={() => move(card, "exile", "hand")}>Return to hand</button>)}
          {showLibrary && !own.conceded && <section className="play-zone">
            <h3>Library search</h3>
            <label>Filter library <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} /></label>
            {libraryError ? <p className="note warn" role="alert">{libraryError} Close and reopen search to retry.</p> :
              library?.revision !== table.revision ? <p className="note">Loading library search...</p> :
              <div className="play-library-list">{library.cards.filter((card) => card.name.toLowerCase().includes(libraryQuery.trim().toLowerCase())).map((card) =>
                <span key={card.id}>{card.name} <button type="button" className="btn small" aria-label={`Put ${card.name} into hand`}
                  onClick={() => move(card, "library", "hand")}>To hand</button></span>)}</div>}
          </section>}
          </>}
        </>}
        {table.status === "closed" && <p className="note">This table is closed. Your last saved view remains available.</p>}
      </>}
      {error && <p className="note warn" role="alert">{error}</p>}
      <p className="note">Manual tables do not enforce Magic rules. Game state is saved on the server so seated players can reconnect. The server hides each opponent’s hand and library.</p>
    </section>
  );
}

function AutomatedGame({ deckId, options, engineError }: { deckId: string; options: EngineOptions | null; engineError: string }) {
  const [game, setGame] = useState<EngineResponse | null>(null);
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [gameType, setGameType] = useState("");
  const [deckType, setDeckType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(1);
  const gameTypes = useMemo(() => namedOptions(options?.gameTypes ?? []), [options]);
  const deckTypes = useMemo(() => namedOptions(options?.deckTypes ?? []), [options]);
  const lastState = [...events].reverse().find(({ event }) => event.objectId === game?.gameId && STATE_EVENTS.has(event.method));
  const prompt = [...events].reverse().find(({ event }) => event.objectId === game?.gameId && PROMPTS.has(event.method));
  const promptData = record(prompt?.event.data);
  const promptOptions = record(promptData?.options);
  const promptView = gameView(prompt);
  const stateView = gameView(lastState);
  const view = promptView && Array.isArray(promptView.players) && (prompt?.id ?? 0) > (lastState?.id ?? 0)
    ? promptView : stateView;
  const playableObjects = record(record(promptView?.canPlayObjects)?.objects)
    ?? record(record(view?.canPlayObjects)?.objects);

  useEffect(() => {
    if (!game) return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await request<{ events: EngineEvent[] }>(`/api/play/events?after=${cursor}`);
        if (!active) return;
        if (result.events.length) {
          setEvents((current) => [...current, ...result.events].slice(-1000));
          const next = Math.max(cursor, ...result.events.map((entry) => entry.id));
          setCursor(next);
          if (result.events.some(({ event }) => event.objectId === game.gameId && event.method === "GAME_OVER")) setBusy(false);
        }
        setError("");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load game events.");
      }
      if (active) timer = window.setTimeout(() => { void poll(); }, 600);
    };
    void poll();
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [cursor, game]);

  const start = async () => {
    setError("");
    setBusy(true);
    setEvents([]);
    setCursor(0);
    try {
      const started = await request<EngineResponse>("/api/play/games", {
        method: "POST",
        body: JSON.stringify({ deckId, gameType, deckType }),
      });
      setGame(started);
      setBusy(false);
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : "Could not start the engine game.");
    }
  };

  const respond = async (type: string, data?: string | number | boolean) => {
    if (!game || !prompt) return;
    setError("");
    try {
      await request(`/api/play/games/${encodeURIComponent(game.gameId)}/actions`, {
        method: "POST",
        body: JSON.stringify({ expectedMessageId: prompt.event.messageId, type, data }),
      });
      setEvents((current) => current.filter((entry) => entry.id !== prompt.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The engine did not accept the response.");
    }
  };

  const targets = array(promptData?.targets);
  const possibleTargets = array(promptOptions?.possibleTargets);
  const choices = prompt?.event.method === "GAME_TARGET"
    ? targets.length ? targets : possibleTargets.length ? possibleTargets : Object.keys(record(promptData?.cardsView1) ?? {})
    : array(promptData?.choices ?? promptData?.options);
  const abilities = prompt?.event.method === "GAME_CHOOSE_ABILITY" ? record(promptData?.choices) : null;
  const players = array(view?.players).map(record).filter((player): player is Record<string, unknown> => player !== null);
  const playerName = (player: Record<string, unknown>) => typeof player.name === "string" ? player.name : "Player";
  const playerZones = (player: Record<string, unknown>) => cardsIn(player.battlefield);
  const hand = cardsIn(view?.myHand);
  const stack = cardsIn(view?.stack);
  const combatKind = prompt?.event.method === "GAME_SELECT"
    ? Array.isArray(promptOptions?.possibleAttackers) ? "attackers"
      : Array.isArray(promptOptions?.possibleBlockers) ? "blockers" : null
    : null;
  const combatIds = new Set(array(combatKind === "attackers" ? promptOptions?.possibleAttackers : promptOptions?.possibleBlockers)
    .filter((id): id is string => typeof id === "string"));
  if (combatKind) {
    for (const group of array(view?.combat)) {
      for (const [id, card] of Object.entries(record(record(group)?.[combatKind]) ?? {})) {
        const controllerId = record(card)?.controllerId;
        if (typeof controllerId !== "string" || typeof view?.myPlayerId !== "string" || controllerId === view.myPlayerId) combatIds.add(id);
      }
    }
  }
  const targetName = (id: string): string => {
    const player = players.find((item) => item.playerId === id);
    if (player) return playerName(player);
    const cards = [...cardsIn(promptData?.cardsView1), ...hand, ...stack, ...players.flatMap(playerZones)];
    const card = cards.find((item) => cardObjectId(item) === id);
    return card ? cardName(card) : id;
  };
  const over = events.some(({ event }) => event.objectId === game?.gameId && event.method === "GAME_OVER");
  const canChooseObject = (id: string | null): id is string =>
    ((prompt?.event.method === "GAME_SELECT" && !combatKind) || prompt?.event.method === "GAME_PLAY_MANA")
    && id !== null
    && playableObjects !== null
    && Object.prototype.hasOwnProperty.call(playableObjects, id);

  return (
    <section className="play-panel">
      <h2>Automated game</h2>
      {!game && <>
        {engineError && <p className="note warn">Engine not ready: {engineError}. Manual solo play remains available.</p>}
        <div className="play-toolbar">
          <label>Game type <select value={gameType} onChange={(event) => setGameType(event.target.value)}>
            {gameTypes.map(({ name }) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <label>Deck format <select value={deckType} onChange={(event) => setDeckType(event.target.value)}>
            {deckTypes.map(({ name }) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <button type="button" className="btn primary" disabled={!deckId || !gameType || !deckType || busy || !!engineError} onClick={() => void start()}>
            {busy ? "Starting..." : "Start against AI"}
          </button>
        </div>
        <p className="note">Engine play uses a private server session. It does not change the saved deck.</p>
      </>}
      {game && <>
        <div className="play-toolbar">
          <b>{game.gameId}</b>
          <span className="badge">{over ? "Game ended" : "Connected"}</span>
        </div>
        {view && <>
          <div className="play-player-row">
            {players.map((player, index) => <section className="play-player" key={String(player.playerId ?? index)}>
              <b>{playerName(player)}</b>
              <span>Life {String(player.life ?? "?")} · Hand {String(player.handCount ?? "?")} · Library {String(player.libraryCount ?? "?")}</span>
              <div className="play-card-row">{playerZones(player).map((card, cardIndex) => {
                const id = cardObjectId(card);
                const name = cardName(card);
                const payingMana = prompt?.event.method === "GAME_PLAY_MANA";
                return <div className="engine-card" key={id ?? cardIndex}>
                  {name}
                  {canChooseObject(id) && <button type="button" className="btn small"
                    aria-label={payingMana ? `Tap ${name} for mana` : `Choose ${name}`}
                    onClick={() => void respond("sendPlayerUUID", id)}>{payingMana ? "Tap for mana" : "Choose"}</button>}
                  {id && combatKind && combatIds.has(id) && <button type="button" className="btn small"
                    aria-label={`Select ${name} as ${combatKind === "attackers" ? "attacker" : "blocker"}`}
                    onClick={() => void respond("sendPlayerUUID", id)}>Select</button>}
                </div>;
              })}</div>
            </section>)}
          </div>
          <section className="play-zone"><h3>Your hand <span className="cnt">{hand.length}</span></h3>
            <div className="play-card-row">{hand.map((card, index) => {
              const id = cardObjectId(card);
              const name = cardName(card);
              const canPlay = prompt?.event.method === "GAME_SELECT" && canChooseObject(id);
              return <div className="engine-card" key={id ?? index}>
                {name}
                {canPlay && <button type="button" className="btn small primary" aria-label={`Play ${name}`}
                  onClick={() => void respond("sendPlayerUUID", id)}>Play</button>}
              </div>;
            })}</div>
          </section>
          {stack.length > 0 && <section className="play-zone"><h3>Stack</h3><div className="play-card-row">{stack.map((card, index) => <div className="engine-card" key={String(record(card)?.cardId ?? index)}>{cardName(card)}</div>)}</div></section>}
        </>}
        {prompt && !over && <section className="play-prompt" aria-live="polite" data-message-id={prompt.event.messageId}
          data-web-prompt={typeof promptOptions?.webPrompt === "string" ? promptOptions.webPrompt : undefined}>
          <h3>{eventMessage(prompt)}</h3>
          {prompt.event.method === "GAME_ASK" && <>
            <button type="button" className="btn primary" onClick={() => void respond("sendPlayerBoolean", true)}>{typeof promptOptions?.["UI.left.btn.text"] === "string" ? promptOptions["UI.left.btn.text"] : "Yes"}</button>
            <button type="button" className="btn" onClick={() => void respond("sendPlayerBoolean", false)}>{typeof promptOptions?.["UI.right.btn.text"] === "string" ? promptOptions["UI.right.btn.text"] : "No"}</button>
          </>}
          {prompt.event.method === "GAME_SELECT" && combatKind && <button type="button" className="btn primary"
            onClick={() => void respond("sendPlayerBoolean", true)}>Finish {combatKind}</button>}
          {prompt.event.method === "GAME_SELECT" && !combatKind && <button type="button" className="btn"
            onClick={() => void respond("sendPlayerBoolean", false)}>Pass priority</button>}
          {prompt.event.method === "GAME_SELECT" && !combatKind && <button type="button" className="btn"
            onClick={() => void respond("sendPlayerAction", "PASS_PRIORITY_UNTIL_NEXT_MAIN_PHASE")}>
            Pass priority until next main phase
          </button>}
          <button type="button" className="btn" onClick={() => void respond("sendPlayerAction", "CONCEDE")}>Concede</button>
          {prompt.event.method === "GAME_GET_AMOUNT" && <>
            <input type="number" min={0} max={10000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} aria-label="Amount" />
            <button type="button" className="btn primary" onClick={() => void respond("sendPlayerInteger", amount)}>Submit</button>
          </>}
          {abilities && Object.entries(abilities).map(([id, label]) => typeof label === "string" &&
            <button type="button" className="btn" key={id} onClick={() => void respond("sendPlayerUUID", id)}>{label}</button>)}
          {choices.map((choice, index) => {
            const value = typeof choice === "string" ? choice : record(choice)?.id;
            const label = typeof choice === "string"
              ? prompt.event.method === "GAME_TARGET" ? targetName(choice) : choice
              : record(choice)?.name;
            if (typeof value !== "string") return null;
            const type = prompt.event.method === "GAME_TARGET" ? "sendPlayerUUID" : /^[0-9a-f-]{36}$/i.test(value) ? "sendPlayerUUID" : "sendPlayerString";
            return <button type="button" className="btn" key={`${value}:${index}`} onClick={() => void respond(type, value)}>{typeof label === "string" ? label : prompt.event.method === "GAME_TARGET" ? targetName(value) : value}</button>;
          })}
          {prompt.event.method !== "GAME_ASK" && prompt.event.method !== "GAME_GET_AMOUNT" && choices.length === 0
            && !combatKind
            && (!abilities || Object.values(abilities).every((label) => typeof label !== "string"))
            && <p className="note">This prompt requires an engine response format not available in the workspace yet.</p>}
        </section>}
      </>}
      {error && <p className="note warn" role="alert">{error}</p>}
      {events.length > 0 && <details className="play-log"><summary>Game log</summary>
        <ol>{events.filter(({ event }) => event.objectId === game?.gameId).slice(-30).map(({ id, event }) =>
          <li key={id}>{eventMessage({ id, event })}</li>)}</ol>
      </details>}
    </section>
  );
}

export function PlayView() {
  const store = useApp();
  const [mode, setMode] = useState<"automated" | "solo" | "table">("automated");
  const [selectedDeckId, setSelectedDeckId] = useState(store.deck?.id ?? "");
  const [options, setOptions] = useState<EngineOptions | null>(null);
  const [engineError, setEngineError] = useState("");

  useEffect(() => {
    if (!selectedDeckId && store.decks[0]) setSelectedDeckId(store.decks[0].id);
  }, [selectedDeckId, store.decks]);

  useEffect(() => {
    if (selectedDeckId && store.deck?.id !== selectedDeckId) void store.openDeck(selectedDeckId);
  }, [selectedDeckId, store.deck?.id, store.openDeck]);

  useEffect(() => {
    let active = true;
    void request<{ enabled: boolean }>("/api/play/status")
      .then(() => request<EngineOptions>("/api/play/options"))
      .then((result) => { if (active) { setOptions(result); setEngineError(""); } })
      .catch((reason) => { if (active) setEngineError(reason instanceof Error ? reason.message : "The play engine is unavailable."); });
    return () => { active = false; };
  }, []);

  const deck = store.deck?.id === selectedDeckId ? store.deck : null;
  const selectDeck = (id: string) => {
    setSelectedDeckId(id);
    if (id) void store.openDeck(id);
  };

  return (
    <div className="view" id="view-play">
      <div className="play-heading">
        <div><h1><Icon name="playtest" /> Play</h1><p>Play saved decks without changing your collection or deck list.</p></div>
        <label>Saved deck <select value={selectedDeckId} onChange={(event) => selectDeck(event.target.value)}>
          <option value="">Choose a deck</option>
          {store.decks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
      </div>
      <div className="seg play-tabs" role="tablist" aria-label="Play mode">
        <button type="button" role="tab" aria-selected={mode === "automated"} className={mode === "automated" ? "on" : ""} onClick={() => setMode("automated")}>Engine AI</button>
        <button type="button" role="tab" aria-selected={mode === "solo"} className={mode === "solo" ? "on" : ""} onClick={() => setMode("solo")}>Manual solo</button>
        <button type="button" role="tab" aria-selected={mode === "table"} className={mode === "table" ? "on" : ""} onClick={() => setMode("table")}>Multiplayer table</button>
      </div>
      {!deck && <div className="empty"><Icon name="deck" /><b>Choose a saved deck to play</b>
        <button type="button" className="btn" onClick={() => store.setView("deck")}>Open Decks</button>
      </div>}
      {deck && mode === "automated" && <AutomatedGame deckId={deck.id} options={options} engineError={engineError} />}
      {deck && mode === "solo" && <ManualSolo cards={deck.cards} />}
      {mode === "table" && <ManualTable deckId={selectedDeckId} />}
    </div>
  );
}
