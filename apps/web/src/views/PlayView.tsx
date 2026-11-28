import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { request } from "../api";
import { Icon } from "../icons";
import {
  addManualToken, attachManualCard, canAttachManualCard, changeManualCounter, changeManualTotal, copyManualCard, drawManualCards, moveManualCard,
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
  lost: boolean;
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

const MANUAL_COUNTERS = ["+1/+1", "-1/-1", "loyalty", "charge", "custom"] as const;
type ManualCounter = typeof MANUAL_COUNTERS[number];

function ManualCounterControls({ card, change }: { card: ManualCard; change: (name: ManualCounter, delta: 1 | -1) => void }) {
  const [counter, setCounter] = useState<ManualCounter>("+1/+1");
  const count = card.counters[counter] ?? 0;
  return <>
    <label>Counter <select aria-label={`Counter type for ${card.name}`} value={counter}
      onChange={(event) => {
        const selected = MANUAL_COUNTERS.find((name) => name === event.target.value);
        if (selected) setCounter(selected);
      }}>
      {MANUAL_COUNTERS.map((name) => <option key={name} value={name}>{name}</option>)}
    </select></label>
    <button type="button" className="btn small" aria-label={`Add counter to ${card.name}`} disabled={count >= 999} onClick={() => change(counter, 1)}>+</button>
    <button type="button" className="btn small" aria-label={`Remove counter from ${card.name}`} disabled={count <= 0} onClick={() => change(counter, -1)}>-</button>
    {Object.entries(card.counters).map(([name, value]) => <span className="badge" key={name}>{name}: {value}</span>)}
  </>;
}

type ManualDestination = ManualZone | "library-top";
const MANUAL_ZONES: readonly { id: ManualDestination; label: string }[] = [
  { id: "library-top", label: "Library top" },
  { id: "library", label: "Library bottom" },
  { id: "hand", label: "Hand" },
  { id: "battlefield", label: "Battlefield" },
  { id: "graveyard", label: "Graveyard" },
  { id: "exile", label: "Exile" },
  { id: "command", label: "Command zone" },
];

function ManualMoveSelect({ card, from, move, disabled }: {
  card: ManualCard; from: ManualZone; move: (card: ManualCard, from: ManualZone, to: ManualDestination) => void; disabled?: boolean;
}) {
  return <label>Move to <select aria-label={`Move ${card.name} from ${from}`} value="" disabled={disabled}
    onChange={(event) => {
      const target = MANUAL_ZONES.find(({ id }) => id === event.target.value);
      if (target && target.id !== from) move(card, from, target.id);
    }}>
    <option value="">Choose zone</option>
    {MANUAL_ZONES.filter(({ id }) => id !== from && !(from === "library" && id === "library-top")).map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
  </select></label>;
}

function useManualZoneDrag(move: (card: ManualCard, from: ManualZone, to: ManualDestination) => void) {
  const [dragging, setDragging] = useState<{ card: ManualCard; from: ManualZone } | null>(null);
  const start = (event: DragEvent, card: ManualCard, from: ManualZone) => {
    event.dataTransfer.setData("text/plain", card.id);
    event.dataTransfer.effectAllowed = "move";
    setDragging({ card, from });
  };
  const target = (to: ManualZone) => ({
    onDragOver: (event: DragEvent) => { if (dragging && dragging.from !== to) event.preventDefault(); },
    onDrop: (event: DragEvent) => {
      if (!dragging || dragging.from === to) return;
      event.preventDefault();
      move(dragging.card, dragging.from, to);
      setDragging(null);
    },
  });
  return { start, target, end: () => setDragging(null) };
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
  const move = (card: ManualCard, from: ManualZone, to: ManualDestination) => {
    setGame((current) => current ? moveManualCard(current, card.id, from, to === "library-top" ? "library" : to,
      to === "library-top" ? { libraryPosition: "top" } : {}) : current);
  };
  const drag = useManualZoneDrag(move);
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

  const zone = (title: string, from: ManualZone, values: readonly ManualCard[], body: (card: ManualCard) => ReactNode, extra?: ReactNode) => (
    <section className="play-zone" data-zone={from} {...drag.target(from)}>
      <h3>{title} <span className="cnt">{values.length}</span>{extra}</h3>
      <div className="play-card-row">{values.map((card) => <article className={card.tapped ? "play-card tapped" : "play-card"} key={card.id}
        draggable={from !== "hand" || game.bottom === 0} onDragStart={(event) => drag.start(event, card, from)} onDragEnd={drag.end}>
        {(from !== "hand" || game.bottom === 0) && <span className="play-drag-handle" aria-hidden="true">Drag</span>}
        {cardPicture(card)}
        <div className="play-card-actions">{body(card)}<ManualMoveSelect card={card} from={from} move={move} disabled={from === "hand" && game.bottom > 0} /></div>
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
      {zone("Command zone", "command", game.command, (card) => <button type="button" className="btn small" onClick={() => move(card, "command", "battlefield")}>Play</button>)}
      {zone("Battlefield", "battlefield", game.battlefield, (card) => <>
        <button type="button" className="btn small" onClick={() => setGame((current) => current ? toggleManualTap(current, card.id) : current)}>{card.tapped ? "Untap" : "Tap"}</button>
        <ManualCounterControls card={card} change={(name, delta) => setGame((current) => current ? changeManualCounter(current, card.id, name, delta) : current)} />
        <button type="button" className="btn small" onClick={() => setGame((current) => current ? copyManualCard(current, card.id) : current)}>Copy</button>
        <button type="button" className="btn small" onClick={() => move(card, "battlefield", "graveyard")}>Graveyard</button>
        <button type="button" className="btn small" onClick={() => move(card, "battlefield", "exile")}>Exile</button>
        <button type="button" className="btn small" onClick={() => setGame((current) => current ? moveManualCard(current, card.id, "battlefield", "battlefield", { faceDown: !card.faceDown }) : current)}>{card.faceDown ? "Reveal" : "Face down"}</button>
        <label>Attached to <select aria-label={`Attach ${card.name}`} value={card.attachedTo ?? ""}
          onChange={(event) => setGame((current) => current ? attachManualCard(current, card.id, event.target.value || null) : current)}>
          <option value="">Nothing</option>
          {game.battlefield.filter((target) => target.id !== card.id).map((target) =>
            <option value={target.id} key={target.id} disabled={!canAttachManualCard(game, card.id, target.id)}>{target.name}</option>)}
        </select></label>
      </>)}
      {zone("Hand", "hand", game.hand, (card) => <button type="button" className="btn small primary" onClick={() => play(card)}>{game.bottom > 0 ? "Put on bottom" : "Play"}</button>)}
      {zone("Graveyard", "graveyard", game.graveyard, (card) => <button type="button" className="btn small" onClick={() => move(card, "graveyard", "hand")}>Return to hand</button>)}
      {zone("Exile", "exile", game.exile, (card) => <button type="button" className="btn small" onClick={() => move(card, "exile", "hand")}>Return to hand</button>)}
      <section className="play-zone" data-zone="library" {...drag.target("library")}><h3>Library <span className="cnt">{game.library.length}</span></h3>
        {showLibrary && <>
        <label>Search library <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} /></label>
        <div className="play-library-list">{game.library.filter((card) => card.name.toLowerCase().includes(libraryQuery.trim().toLowerCase())).map((card) =>
          <span key={card.id} draggable onDragStart={(event) => drag.start(event, card, "library")} onDragEnd={drag.end}>{card.name} <button type="button" className="btn small" aria-label={`Put ${card.name} into hand`}
            onClick={() => move(card, "library", "hand")}>To hand</button><ManualMoveSelect card={card} from="library" move={move} /></span>)}</div>
        </>}
      </section>
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
      || table.players.some((player) => player.hand !== undefined && (player.conceded || player.lost))) return;
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
  const battlefield = table?.players.flatMap((player) => player.battlefield.map((card) => ({ card, player }))) ?? [];
  const attachmentName = (id: string) => {
    const target = battlefield.find((item) => item.card.id === id);
    return target ? `${target.card.name} (${target.player.name})` : "Unavailable card";
  };
  const move = (card: ManualCard, from: ManualZone, to: ManualDestination) => void act({
    type: "move", cardId: card.id, from, to: to === "library-top" ? "library" : to,
    ...(to === "library-top" ? { position: "top" } : {}),
  });
  const drag = useManualZoneDrag(move);
  const zone = (title: string, from: ManualZone, cards: readonly ManualCard[], body: (card: ManualCard) => ReactNode) => (
    <section className="play-zone" data-zone={from} key={title} {...drag.target(from)}>
      <h3>{title} <span className="cnt">{cards.length}</span></h3>
      <div className="play-card-row">{cards.map((card) => <article className={card.tapped ? "play-card tapped" : "play-card"} key={card.id}
        draggable onDragStart={(event) => drag.start(event, card, from)} onDragEnd={drag.end}>
        <span className="play-drag-handle" aria-hidden="true">Drag</span>
        {cardPicture(card)}
        <div className="play-card-actions">{body(card)}<ManualMoveSelect card={card} from={from} move={move} /></div>
      </article>)}</div>
    </section>
  );

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
        {table.status === "closed" && <div className="play-player-row">
          {table.players.map((player) => <section className="play-player" key={player.seat}>
            <b>{player.name}</b>
            <span>{player.conceded ? "Conceded" : player.lost ? "Reported loss"
              : table.turn !== null && table.players.filter((item) => !item.conceded && !item.lost).length === 1 ? "Remaining player" : "Game closed"}</span>
          </section>)}
        </div>}
        {table.status === "active" && <>
          {table.role === "spectator" && <p className="note">You are watching this table. Spectators cannot change the game.</p>}
          <div className="play-player-row">
            {table.players.map((player) => <section className="play-player" key={player.seat}>
              <b>{player.name}{player.seat === table.activeSeat ? " · Active" : ""}{player.conceded ? " · Conceded" : player.lost ? " · Reported loss" : ""}</b>
              <span>Life {player.life} · Poison {player.poison} · Hand {player.handCount} · Library {player.libraryCount}</span>
              {Object.entries(player.commanderDamage).map(([from, amount]) => <span key={from}>Commander damage from seat {Number(from) + 1}: {amount}</span>)}
              {own && !own.conceded && !own.lost && player.seat !== own.seat && <div className="play-toolbar">
                <button type="button" className="btn small" disabled={(player.commanderDamage[String(own.seat)] ?? 0) >= 999}
                  onClick={() => void act({ type: "commanderDamage", targetSeat: player.seat, delta: 1 })}>+ Commander damage</button>
                <button type="button" className="btn small" aria-label={`Remove commander damage from ${player.name}`}
                  disabled={(player.commanderDamage[String(own.seat)] ?? 0) <= 0}
                  onClick={() => void act({ type: "commanderDamage", targetSeat: player.seat, delta: -1 })}>- Commander damage</button>
              </div>}
              <div className="play-card-row">{player.command.map((card) => <div className="engine-card" key={card.id}>{card.name}</div>)}
                {player.battlefield.map((card) => <div className="engine-card" key={card.id}>{card.tapped ? "Tapped · " : ""}{card.name}
                  {Object.entries(card.counters).map(([name, count]) => ` · ${name}: ${count}`)}{card.attachedTo && ` · Attached to ${attachmentName(card.attachedTo)}`}</div>)}</div>
              <span>Graveyard: {player.graveyard.length ? player.graveyard.map((card) => card.name).join(", ") : "Empty"}</span>
              <span>Exile: {player.exile.length ? player.exile.map((card) => card.name).join(", ") : "Empty"}</span>
            </section>)}
          </div>
          {own && !own.conceded && !own.lost && <>
          <div className="play-toolbar">
            <button type="button" className="btn small" disabled={!own.libraryCount} onClick={() => void act({ type: "draw" })}>Draw</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "shuffle" })}>Shuffle</button>
            <button type="button" className="btn small" onClick={() => setShowLibrary((current) => !current)}>{showLibrary ? "Hide library search" : "Search library"}</button>
            <button type="button" className="btn small" disabled={table.activeSeat !== own.seat} onClick={() => void act({ type: "turn" })}>End turn</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "concede" })}>Concede</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "loss" })}>Report loss</button>
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
          {zone("Command zone", "command", own.command, (card) => <button type="button" className="btn small" onClick={() => move(card, "command", "battlefield")}>Play</button>)}
          {zone("Battlefield", "battlefield", own.battlefield, (card) => <>
            {card.faceDown && <span className="badge">Your card: {card.name}</span>}
            <button type="button" className="btn small" onClick={() => void act({ type: "tap", cardId: card.id })}>{card.tapped ? "Untap" : "Tap"}</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "faceDown", cardId: card.id })}>{card.faceDown ? "Reveal" : "Face down"}</button>
            <ManualCounterControls card={card} change={(counter, delta) => void act({ type: "counter", cardId: card.id, counter, delta })} />
            <button type="button" className="btn small" onClick={() => void act({ type: "copy", cardId: card.id })}>Copy</button>
            <label>Attached to <select aria-label={`Attach ${card.name}`} value={card.attachedTo ?? ""}
              onChange={(event) => void act({ type: "attach", cardId: card.id, targetId: event.target.value || null })}>
              <option value="">Nothing</option>
              {battlefield.filter((target) => target.card.id !== card.id).map((target) =>
                <option key={target.card.id} value={target.card.id}>{target.card.name} ({target.player.name})</option>)}
            </select></label>
            <button type="button" className="btn small" onClick={() => move(card, "battlefield", "graveyard")}>Graveyard</button>
            <button type="button" className="btn small" onClick={() => move(card, "battlefield", "exile")}>Exile</button>
          </>)}
          {zone("Hand", "hand", own.hand ?? [], (card) => <>
            <button type="button" className="btn small primary" onClick={() => move(card, "hand", "battlefield")}>Play</button>
            <button type="button" className="btn small" onClick={() => void act({ type: "playFaceDown", cardId: card.id })}>Play face down</button>
          </>)}
          {zone("Graveyard", "graveyard", own.graveyard, (card) => <button type="button" className="btn small" onClick={() => move(card, "graveyard", "hand")}>Return to hand</button>)}
          {zone("Exile", "exile", own.exile, (card) => <button type="button" className="btn small" onClick={() => move(card, "exile", "hand")}>Return to hand</button>)}
          <section className="play-zone" data-zone="library" {...drag.target("library")}>
            <h3>Library <span className="cnt">{own.libraryCount}</span></h3>
            {showLibrary && <>
            <label>Filter library <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} /></label>
            {libraryError ? <p className="note warn" role="alert">{libraryError} Close and reopen search to retry.</p> :
              library?.revision !== table.revision ? <p className="note">Loading library search...</p> :
              <div className="play-library-list">{library.cards.filter((card) => card.name.toLowerCase().includes(libraryQuery.trim().toLowerCase())).map((card) =>
                <span key={card.id} draggable onDragStart={(event) => drag.start(event, card, "library")} onDragEnd={drag.end}>{card.name} <button type="button" className="btn small" aria-label={`Put ${card.name} into hand`}
                  onClick={() => move(card, "library", "hand")}>To hand</button><ManualMoveSelect card={card} from="library" move={move} /></span>)}</div>}
            </>}
          </section>
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
  const [pollError, setPollError] = useState("");
  const [hasPolled, setHasPolled] = useState(false);
  const [amountInput, setAmountInput] = useState<{ promptId: number; value: string } | null>(null);
  const [specialChoice, setSpecialChoice] = useState<number | null>(null);
  const [choiceSearch, setChoiceSearch] = useState<{ promptId: number; value: string } | null>(null);
  const [multiInput, setMultiInput] = useState<{ promptId: number; values: string[] } | null>(null);
  const gameTypes = useMemo(() => namedOptions(options?.gameTypes ?? []), [options]);
  const deckTypes = useMemo(() => namedOptions(options?.deckTypes ?? []), [options]);
  const lastState = [...events].reverse().find(({ event }) => event.objectId === game?.gameId && STATE_EVENTS.has(event.method));
  const prompt = [...events].reverse().find(({ event }) => event.objectId === game?.gameId && PROMPTS.has(event.method));
  const promptData = record(prompt?.event.data);
  const amountMin = typeof promptData?.min === "number" && Number.isSafeInteger(promptData.min) ? promptData.min : null;
  const amountMax = typeof promptData?.max === "number" && Number.isSafeInteger(promptData.max) ? promptData.max : null;
  const supportedMin = amountMin === null ? null : Math.max(amountMin, -10_000);
  const supportedMax = amountMax === null ? null : Math.min(amountMax, 10_000);
  const amountRangeValid = supportedMin !== null && supportedMax !== null && supportedMin <= supportedMax;
  const amountValue = amountInput && amountInput.promptId === prompt?.id ? amountInput.value : amountRangeValid ? String(supportedMin) : "";
  const amount = amountValue.trim() === "" ? NaN : Number(amountValue);
  const amountValid = amountRangeValid && Number.isSafeInteger(amount) && amount >= supportedMin && amount <= supportedMax;
  const promptOptions = record(promptData?.options);
  const multiMessages = array(promptData?.messages).map(record);
  const int32 = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647;
  const multiValidRange = prompt?.event.method === "GAME_GET_MULTI_AMOUNT" && multiMessages.length <= 500
    && Array.isArray(promptData?.messages) && int32(promptData?.min) && int32(promptData?.max)
    && promptData.min <= promptData.max
    && multiMessages.every((item) => item !== null && typeof item.message === "string"
      && int32(item.min) && int32(item.max) && item.min <= item.max && int32(item.defaultValue)
      && item.defaultValue >= item.min && item.defaultValue <= item.max);
  const multiValues = multiInput && multiInput.promptId === prompt?.id
    ? multiInput.values : multiMessages.map((item) => String(item?.defaultValue ?? ""));
  const multiNumbers = multiValues.map((value) => value.trim() ? Number(value) : NaN);
  const multiTotal = multiNumbers.reduce((sum, value) => sum + value, 0);
  const multiResponse = multiNumbers.join(" ");
  const multiValid = multiValidRange && multiNumbers.every((value, index) => {
    const item = multiMessages[index];
    return int32(value) && int32(item?.min) && int32(item?.max) && value >= item.min && value <= item.max;
  }) && int32(multiTotal) && int32(promptData?.min) && int32(promptData?.max)
    && multiTotal >= promptData.min && multiTotal <= promptData.max && multiResponse.length <= 1000;
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
        setPollError("");
        setHasPolled(true);
      } catch (reason) {
        if (active) setPollError(reason instanceof Error ? reason.message : "Could not load game events.");
      }
      if (active) timer = window.setTimeout(() => { void poll(); }, 600);
    };
    void poll();
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [cursor, game]);

  const start = async () => {
    setError("");
    setPollError("");
    setHasPolled(false);
    setBusy(true);
    setEvents([]);
    setCursor(0);
    setAmountInput(null);
    setSpecialChoice(null);
    setChoiceSearch(null);
    setMultiInput(null);
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
  const engineChoice = prompt?.event.method === "GAME_CHOOSE_CHOICE" ? record(promptData?.choice) : null;
  const keyedChoices = record(engineChoice?.keyChoices);
  const engineChoices = keyedChoices && Object.keys(keyedChoices).length
    ? Object.entries(keyedChoices).flatMap(([value, label]) => typeof label === "string" ? [{ value, label }] : [])
    : array(engineChoice?.choices).flatMap((value) => typeof value === "string" ? [{ value, label: value }] : []);
  const choiceSupported = !!engineChoice && (engineChoices.length > 0 || engineChoice.required === false);
  const choiceQuery = choiceSearch && choiceSearch.promptId === prompt?.id ? choiceSearch.value
    : engineChoice?.searchEnabled !== false && typeof engineChoice?.searchText === "string" ? engineChoice.searchText : "";
  const filteredChoices = engineChoices.filter(({ label }) => label.toLowerCase().includes(choiceQuery.toLowerCase()));
  const piles = prompt?.event.method === "GAME_CHOOSE_PILE"
    && record(promptData?.cardsView1) && record(promptData?.cardsView2)
    ? [cardsIn(promptData?.cardsView1), cardsIn(promptData?.cardsView2)] : null;
  const players = array(view?.players).map(record).filter((player): player is Record<string, unknown> => player !== null);
  const playerName = (player: Record<string, unknown>) => typeof player.name === "string" ? player.name : "Player";
  const playerZones = (player: Record<string, unknown>) => cardsIn(player.battlefield);
  const hand = cardsIn(view?.myHand);
  const stack = cardsIn(view?.stack);
  const turn = typeof view?.turn === "number" && Number.isSafeInteger(view.turn) && view.turn >= 0 ? view.turn : null;
  const phase = typeof view?.phase === "string" ? view.phase.toLowerCase().replace(/_/g, " ") : "";
  const step = typeof view?.step === "string" ? view.step.toLowerCase().replace(/_/g, " ") : "";
  const activePlayer = typeof view?.activePlayerName === "string" ? view.activePlayerName : "";
  const priorityPlayer = typeof view?.priorityPlayerName === "string" ? view.priorityPlayerName : "";
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
          <span className="badge">{over ? "Game ended" : pollError ? "Connection unavailable" : hasPolled ? "Connected" : "Connecting"}</span>
        </div>
        {(turn !== null || phase || step || activePlayer || priorityPlayer) && <div className="play-toolbar" aria-label="Game progress">
          {turn !== null && <span>Turn {turn}</span>}
          {phase && <span>Phase: {phase}</span>}
          {step && <span>Step: {step}</span>}
          {activePlayer && <span>Active: {activePlayer}</span>}
          {priorityPlayer && <span>Priority: {priorityPlayer}</span>}
        </div>}
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
            {amountRangeValid ? <>
              <label>Amount <input type="number" min={supportedMin} max={supportedMax} step={1} value={amountValue}
                onChange={(event) => setAmountInput({ promptId: prompt.id, value: event.target.value })} /></label>
              {(amountMin !== supportedMin || amountMax !== supportedMax) && <p className="note">The workspace supports amounts from -10000 to 10000.</p>}
              <button type="button" className="btn primary" disabled={!amountValid} onClick={() => void respond("sendPlayerInteger", amount)}>Submit</button>
            </> : <p className="note warn">This engine amount range is invalid or outside the workspace limit of -10000 to 10000.</p>}
            <button type="button" className="btn" onClick={() => void respond("sendPlayerBoolean", false)}>Cancel</button>
          </>}
          {prompt.event.method === "GAME_GET_MULTI_AMOUNT" && <>
            {typeof promptOptions?.header === "string" && <p>{promptOptions.header}</p>}
            {multiValidRange ? <>
              {multiMessages.map((item, index) => <label key={index}>{String(item?.message)}
                <input type="number" step={1} min={Number(item?.min)} max={Number(item?.max)} value={multiValues[index] ?? ""}
                  onChange={(event) => {
                    const values = [...multiValues];
                    values[index] = event.target.value;
                    setMultiInput({ promptId: prompt.id, values });
                  }} />
              </label>)}
              <p>Total: {Number.isFinite(multiTotal) ? multiTotal : "invalid"} (allowed {String(promptData?.min)} to {String(promptData?.max)})</p>
              {multiResponse.length > 1000 && <p className="note warn">The amount response exceeds the workspace limit of 1000 characters.</p>}
              <button type="button" className="btn primary" disabled={!multiValid}
                onClick={() => void respond("sendPlayerString", multiResponse)}>Submit amounts</button>
            </> : <p className="note warn">This engine amount distribution is invalid or exceeds workspace limits.</p>}
            {promptOptions?.canCancel === true && <button type="button" className="btn"
              onClick={() => void respond("sendPlayerBoolean", false)}>Cancel</button>}
          </>}
          {piles && piles.map((pile, index) => <section className="play-zone" key={index}>
            <h4>Pile {index + 1}</h4>
            {pile.length ? <ul>{pile.map((card, cardIndex) => <li key={cardObjectId(card) ?? cardIndex}>{cardName(card)}</li>)}</ul> : <p>Empty pile</p>}
            <button type="button" className="btn" onClick={() => void respond("sendPlayerBoolean", index === 0)}>Choose pile {index + 1}</button>
          </section>)}
          {engineChoice && <>
            {typeof engineChoice.message === "string" && <p>{engineChoice.message}</p>}
            {typeof engineChoice.subMessage === "string" && <p>{engineChoice.subMessage}</p>}
            {engineChoice.specialEnabled === true && <label><input type="checkbox" checked={specialChoice === prompt.id}
              onChange={(event) => setSpecialChoice(event.target.checked ? prompt.id : null)} />{typeof engineChoice.specialText === "string" && engineChoice.specialText || "Special choice"}</label>}
            {(engineChoice.searchEnabled !== false || engineChoices.length > 100) && <label>Search choices <input value={choiceQuery}
              onChange={(event) => setChoiceSearch({ promptId: prompt.id, value: event.target.value })} /></label>}
            {filteredChoices.slice(0, 100).map(({ value, label }, index) => <button type="button" className="btn" key={`${value}:${index}`}
              disabled={value.length + (specialChoice === prompt.id ? 1 : 0) > 1000}
              onClick={() => void respond("sendPlayerString", `${specialChoice === prompt.id ? "#" : ""}${value}`)}>{label}</button>)}
            {filteredChoices.length > 100 && <p className="note">Showing the first 100 choices. Search to narrow the list.</p>}
            {engineChoices.some(({ value }) => value.length + (specialChoice === prompt.id ? 1 : 0) > 1000)
              && <p className="note warn">Choices longer than 1000 characters are not supported.</p>}
            {engineChoice.specialEnabled === true && engineChoice.specialCanBeEmpty === true
              && <p className="note warn">A special choice with no selected item is not available in the workspace.</p>}
            {engineChoice.required === false && <button type="button" className="btn" onClick={() => void respond("sendPlayerString", "")}>Cancel</button>}
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
          {prompt.event.method !== "GAME_ASK" && prompt.event.method !== "GAME_GET_AMOUNT" && prompt.event.method !== "GAME_GET_MULTI_AMOUNT"
            && !piles && !choiceSupported && choices.length === 0
            && !combatKind
            && (!abilities || Object.values(abilities).every((label) => typeof label !== "string"))
            && <p className="note">{prompt.event.method === "GAME_SELECT"
              ? "Some choices for this prompt may not be available in the workspace yet."
              : "This prompt requires an engine response format not available in the workspace yet."}</p>}
        </section>}
      </>}
      {error && <p className="note warn" role="alert">{error}</p>}
      {pollError && !over && <p className="note warn" role="alert">{pollError} Retrying game updates.</p>}
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
