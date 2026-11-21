// ---------- the art library: pictures for the card maker, one library shared by every account (0.17.0) ----------
import { useCallback, useEffect, useState } from "react";
import { fetchFile, pickFile, pickFiles, request } from "../api";
import { type Store } from "../store";
import { rowMenu } from "./ContextMenu";
import { blobToData } from "./CustomSets";

export type ArtItem = { id: string; name: string; type: string; bytes: number; createdAt: string; url: string; addedBy?: string | null; canChange?: boolean };

/** Adds a picture file to the account's art library. Returns the saved art, or null when none was chosen. */
export async function uploadToLibrary(store: Store): Promise<{ art: ArtItem; data: string } | null> {
  const file = await pickFile("image/jpeg,image/png,image/webp");
  if (!file) return null;
  if (file.size > 10 * 1024 * 1024) {
    store.flash("Art can be up to 10 MB", "err");
    return null;
  }
  const data = await blobToData(file);
  const art = await request<ArtItem>("/api/art", { method: "POST", body: JSON.stringify({ name: file.name.replace(/\.[a-z0-9]+$/i, ""), picture: data }) });
  return { art, data };
}

/** A picture from the art library, loaded with the account's sign-in (the Android app cannot load it as a plain address). */
function ArtThumb({ art }: { art: ArtItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let live = true;
    void fetchFile(art.url).then(async (response) => {
      if (!response.ok || !live) return;
      made = URL.createObjectURL(await response.blob());
      setUrl(made);
    }).catch(() => undefined);
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [art.url]);
  return url ? <img src={url} alt={art.name} /> : <span className="artwait" aria-label={art.name} />;
}

/** The Art library window: upload, pick (Use on this card), rename and delete. */
export function ArtLibrary({ store, onUse, canUse }: { store: Store; onUse: (art: ArtItem) => void; canUse: boolean }) {
  const [items, setItems] = useState<ArtItem[] | null>(null);
  const [term, setTerm] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<ArtItem | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => setItems(await request<ArtItem[]>("/api/art")), []);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the art library.")); }, [load]);
  // several pictures can be chosen at once; each is added in turn
  const upload = async () => {
    const files = await pickFiles("image/jpeg,image/png,image/webp");
    if (!files.length) return;
    setError("");
    let added = 0;
    const skipped: string[] = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { skipped.push(file.name); continue; }
      try {
        await request<ArtItem>("/api/art", { method: "POST", body: JSON.stringify({ name: file.name.replace(/\.[a-z0-9]+$/i, ""), picture: await blobToData(file) }) });
        added += 1;
      } catch {
        skipped.push(file.name);
      }
    }
    await load();
    if (skipped.length) setError(`Not added (art can be up to 10 MB and a JPEG, PNG or WebP picture): ${skipped.join(", ")}`);
    if (added) store.flash(`${added} ${added === 1 ? "picture" : "pictures"} added to the art library`);
  };
  const rename = async () => {
    if (!renaming) return;
    try {
      await request(`/api/art/${encodeURIComponent(renaming.id)}`, { method: "PATCH", body: JSON.stringify({ name: renaming.name }) });
      setRenaming(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not rename the art.");
    }
  };
  const remove = async (art: ArtItem) => {
    try {
      await request(`/api/art/${encodeURIComponent(art.id)}`, { method: "DELETE" });
      setDeleting(null);
      await load();
      store.flash(`${art.name} deleted from the art library`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the art.");
    }
  };
  const menu = (art: ArtItem) => rowMenu(store, art.name, () => [
    canUse && { label: "Use on this card", run: () => onUse(art) },
    art.canChange !== false && { label: "Rename...", run: () => setRenaming({ id: art.id, name: art.name }) },
    art.canChange !== false && { label: "Delete...", run: () => setDeleting(art) },
  ]);
  const words = term.trim().toLowerCase();
  const shown = (items ?? []).filter((art) => art.name.toLowerCase().includes(words));
  return (
    <div className="artlibrary">
      <div className="btnrow">
        <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find art by name" aria-label="Find art by name" />
        <button type="button" className="btn small" onClick={() => void upload()}>Upload art...</button>
      </div>
      {error && <p className="note err">{error}</p>}
      {renaming && (
        <div className="btnrow">
          <input autoFocus aria-label="New name" value={renaming.name} maxLength={80} onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
            onKeyDown={(event) => { if (event.key === "Enter") void rename(); if (event.key === "Escape") setRenaming(null); }} />
          <button type="button" className="btn small primary" disabled={!renaming.name.trim()} onClick={() => void rename()}>Rename</button>
          <button type="button" className="btn small" onClick={() => setRenaming(null)}>Cancel</button>
        </div>
      )}
      {deleting && (
        <div className="btnrow">
          <span>Delete {deleting.name} from the art library? Cards that use it keep their art.</span>
          <button type="button" className="btn small primary" onClick={() => void remove(deleting)}>Delete</button>
          <button type="button" className="btn small" onClick={() => setDeleting(null)}>Cancel</button>
        </div>
      )}
      {items === null && <p className="note">Loading the art library</p>}
      {items?.length === 0 && <p className="note">No art yet. Art uploaded to a card, or here, is kept in the art library for every account.</p>}
      <div className="artgrid">
        {shown.map((art) => (
          <button key={art.id} type="button" className="artpick" title={art.addedBy ? `${art.name}, added by ${art.addedBy}` : art.name} {...menu(art)} onClick={() => { if (canUse) onUse(art); }}>
            <ArtThumb art={art} /><span className="artname">{art.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
