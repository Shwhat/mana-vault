import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import CardScanner from "./CardScanner";

type Card = {
  id: string;
  name: string;
  mana_cost: string | null;
  mana_value: number | null;
  type_line: string;
  oracle_text: string | null;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  colors: string;
  image_url: string | null;
};

type CollectionEntry = Pick<Card, "id" | "name" | "set_code" | "set_name" | "collector_number" | "rarity" | "image_url"> & {
  quantity: number;
  foil: number;
};

type Deck = {
  id: string;
  name: string;
  format: string;
  mode: "normal" | "theme";
  card_count?: number;
};

type DeckCard = Pick<Card, "name" | "mana_cost" | "type_line" | "set_code" | "set_name" | "collector_number" | "image_url"> & {
  entry_id: number;
  oracle_id: string;
  printing_id: string | null;
  quantity: number;
  zone: "main" | "sideboard" | "commander";
};

type DeckDetail = Deck & { cards: DeckCard[] };
type CollectionImportReport = {
  matchedRows: number;
  importedQuantity: number;
  unmatched: Array<{ row: number; name: string; reason: string }>;
};
type CatalogStatus = { printingCount: number; updatedAt: string | null };
type Page = "cards" | "collection" | "decks";

function isDeckZone(value: string): value is DeckCard["zone"] {
  return value === "main" || value === "sideboard" || value === "commander";
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadFile(filename: string, content: string, type: string) {
  downloadBlob(filename, new Blob([content], { type }));
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export default function App() {
  const [page, setPage] = useState<Page>("cards");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [setCode, setSetCode] = useState("");
  const [color, setColor] = useState("");
  const [rarity, setRarity] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [mvMin, setMvMin] = useState("");
  const [mvMax, setMvMax] = useState("");
  const [foil, setFoil] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [collection, setCollection] = useState<CollectionEntry[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckDetail | null>(null);
  const [deckName, setDeckName] = useState("");
  const [deckFormat, setDeckFormat] = useState("commander");
  const [deckMode, setDeckMode] = useState<"normal" | "theme">("normal");
  const [deckZone, setDeckZone] = useState<DeckCard["zone"]>("main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importReport, setImportReport] = useState<CollectionImportReport | null>(null);
  const [deckImportReport, setDeckImportReport] = useState<CollectionImportReport | null>(null);
  const [catalog, setCatalog] = useState<CatalogStatus | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const deckImportInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (page !== "cards") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ q: query });
      if (type.trim()) params.set("type", type.trim());
      if (setCode.trim()) params.set("set", setCode.trim());
      if (color) params.set("color", color);
      if (rarity) params.set("rarity", rarity);
      if (formatFilter) params.set("format", formatFilter);
      if (mvMin) params.set("mvMin", mvMin);
      if (mvMax) params.set("mvMax", mvMax);
      try {
        setCards(await request<Card[]>(`/api/cards?${params}`, { signal: controller.signal }));
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Search failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, query, type, setCode, color, rarity, formatFilter, mvMin, mvMax]);

  useEffect(() => {
    request<CatalogStatus>("/api/catalog/status")
      .then(setCatalog)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load card catalog status"));
  }, []);

  useEffect(() => {
    if (page === "collection") {
      request<CollectionEntry[]>("/api/collection")
        .then(setCollection)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load collection"));
    } else if (page === "decks") {
      request<Deck[]>("/api/decks")
        .then(setDecks)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load decks"));
    }
  }, [page]);

  function navigate(nextPage: Page) {
    setPage(nextPage);
    setError("");
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  }

  async function addCard(card: Card) {
    try {
      await request("/api/collection", {
        method: "POST",
        body: JSON.stringify({ cardId: card.id, quantity: 1, foil }),
      });
      showNotice(`${card.name} added to collection`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add card");
    }
  }

  async function changeCollection(entry: CollectionEntry, quantity: number) {
    try {
      const url = `/api/collection/${encodeURIComponent(entry.id)}`;
      if (quantity < 1) {
        await request(`${url}?foil=${entry.foil ? "true" : "false"}`, { method: "DELETE" });
      } else {
        await request(url, {
          method: "PATCH",
          body: JSON.stringify({ quantity, foil: Boolean(entry.foil) }),
        });
      }
      setCollection(await request<CollectionEntry[]>("/api/collection"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update collection");
    }
  }

  async function importCollection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("CSV file must be no larger than 5 MB");
      return;
    }
    try {
      const report = await request<CollectionImportReport>("/api/collection/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: await file.text(),
      });
      setImportReport(report);
      setCollection(await request<CollectionEntry[]>("/api/collection"));
      setError("");
      showNotice(`Imported ${report.importedQuantity} cards from ${report.matchedRows} rows`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import collection CSV");
    }
  }

  async function exportBackup() {
    try {
      const response = await fetch("/api/backup");
      if (!response.ok) throw new Error(`Backup failed (${response.status})`);
      downloadBlob("mana-vault-backup.json", await response.blob());
      showNotice("Backup downloaded");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not download backup");
    }
  }

  async function restoreBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("Backup file must be no larger than 25 MB");
      return;
    }
    if (!window.confirm("Restore this backup? It will replace your current collection and decks.")) return;
    try {
      await request("/api/backup/restore", {
        method: "POST",
        headers: { "content-type": "application/vnd.mana-vault.backup+json" },
        body: await file.text(),
      });
      setCollection(await request<CollectionEntry[]>("/api/collection"));
      setDecks(await request<Deck[]>("/api/decks"));
      setCatalog(await request<CatalogStatus>("/api/catalog/status"));
      setSelectedDeck(null);
      setImportReport(null);
      setDeckImportReport(null);
      setError("");
      showNotice("Backup restored");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not restore backup");
    }
  }

  async function importDeckFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !selectedDeck) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Decklist file must be no larger than 5 MB");
      return;
    }
    try {
      const contentType = file.name.toLowerCase().endsWith(".csv") ? "text/csv" : "text/plain";
      const report = await request<CollectionImportReport>(`/api/decks/${selectedDeck.id}/import`, {
        method: "POST",
        headers: { "content-type": contentType },
        body: await file.text(),
      });
      setDeckImportReport(report);
      setSelectedDeck(await request<DeckDetail>(`/api/decks/${selectedDeck.id}`));
      setDecks(await request<Deck[]>("/api/decks"));
      setError("");
      showNotice(`Imported ${report.importedQuantity} cards from ${report.matchedRows} rows`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import decklist");
    }
  }

  async function createDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const deck = await request<Deck>("/api/decks", {
        method: "POST",
        body: JSON.stringify({ name: deckName, format: deckFormat, mode: deckMode }),
      });
      const detail = await request<DeckDetail>(`/api/decks/${deck.id}`);
      setSelectedDeck(detail);
      setDeckImportReport(null);
      setDeckName("");
      setDecks(await request<Deck[]>("/api/decks"));
      showNotice(`${deck.name} created`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create deck");
    }
  }

  async function openDeck(deck: Deck) {
    try {
      setSelectedDeck(await request<DeckDetail>(`/api/decks/${deck.id}`));
      setDeckImportReport(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open deck");
    }
  }

  async function addToDeck(card: Card) {
    if (!selectedDeck) return;
    try {
      await request(`/api/decks/${selectedDeck.id}/cards`, {
        method: "POST",
        body: JSON.stringify({ cardId: card.id, quantity: 1, zone: deckZone }),
      });
      setSelectedDeck(await request<DeckDetail>(`/api/decks/${selectedDeck.id}`));
      setDecks(await request<Deck[]>("/api/decks"));
      showNotice(`${card.name} added to ${selectedDeck.name}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add card to deck");
    }
  }

  async function updateDeckCard(card: DeckCard, quantity: number, zone: DeckCard["zone"]) {
    if (!selectedDeck) return;
    try {
      await request(
        `/api/decks/${selectedDeck.id}/cards/${encodeURIComponent(card.oracle_id)}?zone=${card.zone}&entryId=${card.entry_id}`,
        { method: "PATCH", body: JSON.stringify({ quantity, zone }) },
      );
      setSelectedDeck(await request<DeckDetail>(`/api/decks/${selectedDeck.id}`));
      setDecks(await request<Deck[]>("/api/decks"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update deck card");
    }
  }

  async function removeDeckCard(card: DeckCard) {
    if (!selectedDeck) return;
    try {
      await request(
        `/api/decks/${selectedDeck.id}/cards/${encodeURIComponent(card.oracle_id)}?zone=${card.zone}&entryId=${card.entry_id}`,
        { method: "DELETE" },
      );
      setSelectedDeck(await request<DeckDetail>(`/api/decks/${selectedDeck.id}`));
      setDecks(await request<Deck[]>("/api/decks"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove deck card");
    }
  }

  function exportCollection() {
    const rows = [
      ["Count", "Tradelist Count", "Name", "Edition", "Condition", "Language", "Foil", "Tags", "Last Modified", "Collector Number", "Alter", "Proxy", "Purchase Price"],
      ...collection.map((entry) => [
        entry.quantity, 0, entry.name, entry.set_name, "", "", Boolean(entry.foil), "", "",
        entry.collector_number, "", "", "",
      ]),
    ];
    downloadFile("mana-vault-collection.csv", rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }

  function exportDeckCsv(deck: DeckDetail) {
    const rows = [
      ["Name", "Quantity", "Set Code", "Collector Number", "Zone", "Mode"],
      ...deck.cards.map((card) => [
        card.name,
        card.quantity,
        deck.mode === "theme" ? card.set_code : "",
        deck.mode === "theme" ? card.collector_number : "",
        card.zone,
        deck.mode,
      ]),
    ];
    downloadFile(`${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }

  function exportDeckText(deck: DeckDetail) {
    const lines = [`# ${deck.name}`, ""];
    for (const [zone, label] of [["commander", "Commander"], ["main", "Mainboard"], ["sideboard", "Sideboard"]] as const) {
      const cardsInZone = deck.cards.filter((card) => card.zone === zone);
      if (cardsInZone.length === 0) continue;
      lines.push(`// ${label}`);
      for (const card of cardsInZone) {
        const printing = deck.mode === "theme" ? ` (${card.set_code.toUpperCase()}) ${card.collector_number}` : "";
        lines.push(`${card.quantity} ${card.name}${printing}`);
      }
      lines.push("");
    }
    downloadFile(`${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`, lines.join("\r\n"), "text/plain;charset=utf-8");
  }

  const heading = page === "cards" ? "Search cards" : page === "collection" ? "My collection" : "Decks";

  return (
    <main className={dark ? "app dark" : "app"}>
      <header className="topbar">
        <a className="brand" href="#" onClick={() => navigate("cards")} aria-label="Mana Vault home">
          <span className="brand-mark">M</span>
          <span>mana vault<small>COLLECTION WORKSPACE</small></span>
        </a>
        <nav aria-label="Main navigation">
          <button className={page === "cards" ? "nav-link active" : "nav-link"} onClick={() => navigate("cards")}>Cards</button>
          <button className={page === "collection" ? "nav-link active" : "nav-link"} onClick={() => navigate("collection")}>Collection</button>
          <button className={page === "decks" ? "nav-link active" : "nav-link"} onClick={() => navigate("decks")}>Decks</button>
        </nav>
        <button className="theme-toggle" onClick={() => setDark(!dark)} aria-label={dark ? "Use light theme" : "Use dark theme"}>
          {dark ? "Light theme" : "Dark theme"}
        </button>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="side-label">WORKSPACE</div>
          <button className={page === "cards" ? "side-link selected" : "side-link"} onClick={() => navigate("cards")}><span>⌕</span> Card search</button>
          <button className={page === "collection" ? "side-link selected" : "side-link"} onClick={() => navigate("collection")}><span>▤</span> My collection</button>
          <button className={page === "decks" ? "side-link selected" : "side-link"} onClick={() => navigate("decks")}><span>▧</span> Decks</button>
          <div className="side-divider" />
          <div className="side-label">DATABASE</div>
          <p className="side-note">
            {catalog
              ? `${catalog.printingCount.toLocaleString()} printings${catalog.updatedAt ? ` · updated ${new Date(catalog.updatedAt).toLocaleDateString()}` : ""}.`
              : "Loading local card catalog…"}
          </p>
          <p className="side-note catalog-hint">Refresh from the latest Scryfall bulk data with the update command in the README.</p>
        </aside>

        <section className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{page === "cards" ? "CARD CATALOG" : page === "collection" ? "PERSONAL LIBRARY" : "DECK WORKSPACE"}</div>
              <h1>{heading}</h1>
              <p>{page === "cards" ? "Find a printing, then add it to your collection or deck." : page === "collection" ? "Your owned cards, grouped by printing." : "Create and manage decks in either mode."}</p>
            </div>
            {page === "cards" && <span className="result-count">{loading ? "Searching..." : `${cards.length} ${cards.length === 1 ? "result" : "results"}`}</span>}
            {page === "collection" && (
              <div className="collection-actions">
                <input ref={importInput} className="file-input" type="file" accept=".csv,text/csv" onChange={importCollection} aria-label="Import collection CSV" />
                <input ref={backupInput} className="file-input" type="file" accept=".json,application/json" onChange={restoreBackupFile} aria-label="Restore Mana Vault backup" />
                <button className="export-button" onClick={() => importInput.current?.click()}>Import CSV</button>
                <button className="export-button" onClick={exportCollection} disabled={collection.length === 0}>Moxfield CSV</button>
                <button className="export-button" onClick={exportBackup}>Backup</button>
                <button className="export-button" onClick={() => backupInput.current?.click()}>Restore</button>
              </div>
            )}
          </div>

          {error && <div className="error-banner" role="alert">{error}</div>}
          {notice && <div className="notice-banner" role="status">{notice}</div>}
          {page === "collection" && importReport && importReport.unmatched.length > 0 && (
            <details className="import-report">
              <summary>{importReport.unmatched.length} CSV rows need review</summary>
              {importReport.unmatched.slice(0, 20).map((item) => (
                <p key={`${item.row}-${item.name}`}><strong>Row {item.row}{item.name ? ` · ${item.name}` : ""}:</strong> {item.reason}</p>
              ))}
              {importReport.unmatched.length > 20 && <p>Showing the first 20 unmatched rows.</p>}
            </details>
          )}
          {page === "decks" && deckImportReport && (
            <details className="import-report" open={deckImportReport.unmatched.length > 0}>
              <summary>{deckImportReport.importedQuantity} cards imported from {deckImportReport.matchedRows} rows; {deckImportReport.unmatched.length} need review</summary>
              {deckImportReport.unmatched.slice(0, 20).map((item) => (
                <p key={`${item.row}-${item.name}`}><strong>Row {item.row}{item.name ? ` · ${item.name}` : ""}:</strong> {item.reason}</p>
              ))}
              {deckImportReport.unmatched.length > 20 && <p>Showing the first 20 unmatched rows.</p>}
            </details>
          )}

          {page === "cards" && (
            <>
              {selectedDeck && <div className="deck-context">Building <strong>{selectedDeck.name}</strong> · {selectedDeck.mode === "theme" ? "Theme mode — selected printing is kept" : "Normal mode — any printing is acceptable"} <label>Add to <select value={deckZone} onChange={(event) => { if (isDeckZone(event.currentTarget.value)) setDeckZone(event.currentTarget.value); }}><option value="main">Main deck</option><option value="sideboard">Sideboard</option><option value="commander">Commander</option></select></label><button onClick={() => navigate("decks")}>Deck details</button></div>}
              <div className="search-panel">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder='Search or use Scryfall filters (e.g. t:dragon c:red mv>=4)' aria-label="Search cards" />
                  <kbd>/</kbd>
                </label>
                <div className="filters">
                  <label>Type <input value={type} onChange={(event) => setType(event.target.value)} placeholder="Creature" /></label>
                  <label>Set <input value={setCode} onChange={(event) => setSetCode(event.target.value)} placeholder="Set code" /></label>
                  <label>Color
                    <select value={color} onChange={(event) => setColor(event.target.value)}>
                      <option value="">Any color</option><option value="W">White</option><option value="U">Blue</option><option value="B">Black</option><option value="R">Red</option><option value="G">Green</option>
                    </select>
                  </label>
                  <label>Rarity
                    <select value={rarity} onChange={(event) => setRarity(event.target.value)}>
                      <option value="">Any rarity</option><option value="common">Common</option><option value="uncommon">Uncommon</option><option value="rare">Rare</option><option value="mythic">Mythic</option>
                    </select>
                  </label>
                  <label>Format
                    <select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)}>
                      <option value="">Any legality</option><option value="commander">Commander</option><option value="standard">Standard</option><option value="pioneer">Pioneer</option><option value="modern">Modern</option><option value="legacy">Legacy</option><option value="pauper">Pauper</option><option value="vintage">Vintage</option>
                    </select>
                  </label>
                  <label>MV <input className="number-filter" type="number" min="0" max="100" step="0.5" value={mvMin} onChange={(event) => setMvMin(event.target.value)} placeholder="Min" /></label>
                  <label>to <input className="number-filter" type="number" min="0" max="100" step="0.5" value={mvMax} onChange={(event) => setMvMax(event.target.value)} placeholder="Max" /></label>
                  <label className="foil-filter"><input type="checkbox" checked={foil} onChange={(event) => setFoil(event.target.checked)} /> Add as foil</label>
                  <button className="export-button scan-button" onClick={() => setScannerOpen(true)}>Scan card</button>
                </div>
              </div>
              {!error && cards.length === 0 && !loading ? (
                <div className="empty-state">
                  <div className="empty-icon">⌕</div>
                  <h2>{query || type || setCode || color || rarity || formatFilter || mvMin || mvMax ? "No matching cards" : "Your card catalog is empty"}</h2>
                  <p>{query || type || setCode || color || rarity || formatFilter || mvMin || mvMax ? "Try a different search or remove a filter." : "Run the card import command in the README to load the local catalog."}</p>
                </div>
              ) : (
                <div className="card-list">
                  {cards.map((card) => (
                    <article className="card-row" key={card.id}>
                      {card.image_url ? <img className="card-thumb" src={card.image_url} alt="" loading="lazy" /> : <div className="card-thumb placeholder">MV</div>}
                      <div className="card-info">
                        <div className="card-title">{card.name}<span className="mana">{card.mana_cost}</span></div>
                        <div className="card-type">{card.type_line}</div>
                        <div className="printing">{card.set_name} <span>·</span> {card.collector_number} <span>·</span> {card.rarity}</div>
                      </div>
                      <div className="row-actions">
                        <button className="add-button" onClick={() => addCard(card)}>Collection</button>
                        {selectedDeck && <button className="add-button" onClick={() => addToDeck(card)}>Deck</button>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {page === "collection" && (
            collection.length === 0 && !error ? (
              <div className="empty-state"><div className="empty-icon">▤</div><h2>Nothing in your collection yet</h2><p>Search the card catalog and add the printings you own.</p><button className="primary-button" onClick={() => navigate("cards")}>Search cards</button></div>
            ) : (
              <div className="card-list">
                {collection.map((entry) => (
                  <article className="card-row" key={`${entry.id}-${entry.foil}`}>
                    {entry.image_url ? <img className="card-thumb" src={entry.image_url} alt="" loading="lazy" /> : <div className="card-thumb placeholder">MV</div>}
                    <div className="card-info">
                      <div className="card-title">{entry.name}{entry.foil ? <span className="foil-tag">FOIL</span> : null}</div>
                      <div className="printing">{entry.set_name} <span>·</span> {entry.collector_number} <span>·</span> {entry.rarity}</div>
                    </div>
                    <div className="quantity-controls">
                      <button aria-label={`Remove one ${entry.name}`} onClick={() => changeCollection(entry, entry.quantity - 1)}>−</button>
                      <span className="quantity">{entry.quantity}</span>
                      <button aria-label={`Add one ${entry.name}`} onClick={() => changeCollection(entry, entry.quantity + 1)}>+</button>
                    </div>
                    <button className="remove-button" aria-label={`Remove ${entry.name} from collection`} onClick={() => changeCollection(entry, 0)}>Remove</button>
                  </article>
                ))}
              </div>
            )
          )}

          {page === "decks" && (
            <div className="deck-layout">
              <section className="deck-panel">
                <h2>Create a deck</h2>
                <form className="deck-form" onSubmit={createDeck}>
                  <label>Deck name<input value={deckName} onChange={(event) => setDeckName(event.target.value)} placeholder="e.g. Dragons" required maxLength={100} /></label>
                  <label>Format
                    <select value={deckFormat} onChange={(event) => setDeckFormat(event.target.value)}>
                      <option value="commander">Commander</option><option value="standard">Standard</option><option value="pioneer">Pioneer</option><option value="modern">Modern</option><option value="legacy">Legacy</option><option value="pauper">Pauper</option><option value="vintage">Vintage</option><option value="casual">Casual</option>
                    </select>
                  </label>
                  <fieldset>
                    <legend>Deck mode</legend>
                    <label className="mode-choice"><input type="radio" name="deck-mode" checked={deckMode === "normal"} onChange={() => setDeckMode("normal")} /> Normal <small>Any printing works</small></label>
                    <label className="mode-choice"><input type="radio" name="deck-mode" checked={deckMode === "theme"} onChange={() => setDeckMode("theme")} /> Theme <small>Keeps each selected printing</small></label>
                  </fieldset>
                  <button className="primary-button" type="submit">Create deck</button>
                </form>
                <h2 className="deck-list-heading">Your decks <span>{decks.length}</span></h2>
                {decks.length === 0 ? <p className="side-note">No decks yet. Create one to start building.</p> : (
                  <div className="deck-list">
                    {decks.map((deck) => (
                      <button className={selectedDeck?.id === deck.id ? "deck-list-item selected" : "deck-list-item"} key={deck.id} onClick={() => openDeck(deck)}>
                        <strong>{deck.name}</strong><span>{deck.format} · {deck.mode === "theme" ? "Theme" : "Normal"} · {deck.card_count ?? 0} {(deck.card_count ?? 0) === 1 ? "card" : "cards"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <section className="deck-panel deck-detail">
                {!selectedDeck ? (
                  <div className="empty-state compact"><div className="empty-icon">▧</div><h2>Select a deck</h2><p>Choose a deck to see its list, or create a new one.</p></div>
                ) : (
                  <>
                    <div className="deck-detail-heading">
                      <div><div className="eyebrow">{selectedDeck.format.toUpperCase()} · {selectedDeck.mode.toUpperCase()} MODE</div><h2>{selectedDeck.name}</h2></div>
                      <div className="deck-export-actions">
                        <input ref={deckImportInput} className="file-input" type="file" accept=".txt,.csv,text/plain,text/csv" onChange={importDeckFile} aria-label="Import decklist" />
                        <button className="export-button" onClick={() => deckImportInput.current?.click()}>Import list</button>
                        <button className="export-button" onClick={() => exportDeckText(selectedDeck)} disabled={selectedDeck.cards.length === 0}>Text</button>
                        <button className="export-button" onClick={() => exportDeckCsv(selectedDeck)} disabled={selectedDeck.cards.length === 0}>CSV</button>
                        <button className="add-button" onClick={() => navigate("cards")}>Add cards</button>
                      </div>
                    </div>
                    <p className="deck-mode-note">{selectedDeck.mode === "theme" ? "Each card keeps the exact printing and artwork you selected." : "Cards are tracked by identity; their printing can vary."}</p>
                    {selectedDeck.cards.length === 0 ? <div className="empty-state compact"><p>This deck is empty. Search cards to add some.</p></div> : (
                      <div className="deck-card-list">
                        {selectedDeck.cards.map((card) => (
                          <article className="deck-card-row" key={card.entry_id}>
                            {card.image_url ? <img className="card-thumb" src={card.image_url} alt="" loading="lazy" /> : null}
                            <span className="deck-quantity">{card.quantity}×</span>
                            <div><strong>{card.name} <span className="mana">{card.mana_cost}</span></strong><small>{card.type_line}</small>
                              <small>{card.printing_id ? `${card.set_name} · ${card.collector_number}` : "Any printing"}</small></div>
                            <span className="zone-tag">{card.zone}</span>
                            <div className="quantity-controls">
                              <button aria-label={`Remove one ${card.name} from deck`} onClick={() => updateDeckCard(card, card.quantity - 1, card.zone)}>−</button>
                              <button aria-label={`Add one ${card.name} to deck`} disabled={card.quantity >= 100} onClick={() => updateDeckCard(card, card.quantity + 1, card.zone)}>+</button>
                            </div>
                            <select className="zone-select" aria-label={`Move ${card.name} to zone`} value={card.zone} onChange={(event) => { if (isDeckZone(event.currentTarget.value)) updateDeckCard(card, card.quantity, event.currentTarget.value); }}>
                              <option value="main">Main</option><option value="sideboard">Sideboard</option><option value="commander">Commander</option>
                            </select>
                            <button className="remove-button" onClick={() => removeDeckCard(card)}>Remove</button>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}

          <footer>Mana Vault <span>·</span> Local-first collection manager</footer>
        </section>
      </section>
      {scannerOpen && <CardScanner onClose={() => setScannerOpen(false)} onRecognized={(name) => {
        setScannerOpen(false);
        setPage("cards");
        setQuery(`name:"${name.replaceAll('"', "")}"`);
        searchInput.current?.focus();
      }} />}
    </main>
  );
}
