// ---------- the Wiki tab (0.22.0): every deck's and collection's notes, and pages not attached to anything ----------
import type { Action } from "../actions";
import { exportDialog, importPages, newPageDialog, newPageFromWeb, NotesPane, openWikiPage, templatesDialog } from "../components/NotesPane";
import { useApp } from "../store";

export function WikiView({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  void actions;
  return (
    <div className="view" id="view-wiki">
      <div id="pagetabs" className="colhead wikihead">
        <span className="phname">Wiki</span>
        <span className="btnrow">
          <button type="button" className="btn small primary" onClick={() => newPageDialog(store, {}, (page) => openWikiPage(page.id))}>New page...</button>
          <button type="button" className="btn small" onClick={() => newPageFromWeb(store, {}, (page) => openWikiPage(page.id))}>From web address...</button>
          <button type="button" className="btn small" onClick={() => void importPages(store, {})}>Import pages...</button>
          <button type="button" className="btn small" onClick={() => exportDialog(store, null)}>Export...</button>
          <button type="button" className="btn small" onClick={() => templatesDialog()}>Templates...</button>
        </span>
      </div>
      <NotesPane scope={null} view="wiki" />
    </div>
  );
}
