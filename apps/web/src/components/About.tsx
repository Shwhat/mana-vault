// ---------- About guide: Markdown pages bundled with each build ----------
// The About guide is a set of Markdown files in src/about, bundled with each build. A file named
// "NN-slug.md" becomes the page /about/slug, ordered by NN, titled by its first "# " heading.
import { APP_VERSION } from "../api";
import { useApp } from "../store";

export type AboutPage = { slug: string; title: string; body: string };

const files = import.meta.glob("../about/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const aboutPages: AboutPage[] = Object.keys(files)
  .sort()
  .map((path) => {
    const body = files[path] ?? "";
    const slug = path.replace(/^.*\/\d+-/, "").replace(/\.md$/, "");
    const title = body.match(/^# (.+)$/m)?.[1]?.trim() || slug;
    return { slug, title, body };
  });

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    // only web addresses and the program's own pages become links
    if (!/^(https?:\/\/|\/)/i.test(href)) return label;
    const external = /^https?:/.test(href);
    return `<a href="${href}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${label}</a>`;
  });
  return html;
}

const splitRow = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

/** A small Markdown renderer for the guide: headings, paragraphs, lists, tables, bold, code and links. */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) { index += 1; continue; }
    const heading = /^(#{1,4}) (.+)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      index += 1;
      continue;
    }
    if (line.trim().startsWith("|") && (lines[index + 1] ?? "").trim().match(/^\|?\s*:?-{2,}/)) {
      const head = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        rows.push(splitRow(lines[index]!));
        index += 1;
      }
      out.push(`<table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${
        rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\. /.test(line);
      const items: string[] = [];
      while (index < lines.length && /^\s*([-*]|\d+\.) /.test(lines[index] ?? "")) {
        let item = (lines[index] ?? "").replace(/^\s*([-*]|\d+\.) /, "");
        index += 1;
        while (index < lines.length && /^\s{2,}\S/.test(lines[index] ?? "") && !/^\s*([-*]|\d+\.) /.test(lines[index] ?? "")) {
          item += ` ${(lines[index] ?? "").trim()}`;
          index += 1;
        }
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim() && !/^(#{1,4} |\s*([-*]|\d+\.) |\|)/.test(lines[index] ?? "")) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    out.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return out.join("\n");
}

export function About() {
  const store = useApp();
  const current = aboutPages.find((page) => page.slug === store.aboutSlug) ?? (store.aboutSlug ? null : aboutPages[0]);
  const index = current ? aboutPages.indexOf(current) : -1;
  const previous = index > 0 ? aboutPages[index - 1] : undefined;
  const next = index >= 0 && index < aboutPages.length - 1 ? aboutPages[index + 1] : undefined;

  const onClick = (event: React.MouseEvent) => {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href") ?? "";
    if (href.startsWith("/about")) {
      event.preventDefault();
      store.openAbout(href.replace(/^\/about\/?/, ""));
      document.querySelector(".abpage")?.scrollTo(0, 0);
    }
  };

  return (
    <div className="view aboutview" id="view-about">
      <div id="pagetabs">
        <span className="phname">About Mana Vault</span>
        <span className="phwhere">Version {APP_VERSION}</span>
        <button type="button" className="btn small closebtn" onClick={store.closeAbout} aria-label="Close the About guide">Close</button>
      </div>
      <div className="aboutwrap">
        <div className="about">
          <nav className="abtoc" aria-label="Guide pages">
            {aboutPages.map((page) => (
              <a key={page.slug} href={`/about/${page.slug}`} className={page === current ? "on" : ""} onClick={(event) => { event.preventDefault(); store.openAbout(page.slug); }}>{page.title}</a>
            ))}
          </nav>
          <select className="abselect" aria-label="Guide page" value={current?.slug ?? ""} onChange={(event) => store.openAbout(event.target.value)}>
            {aboutPages.map((page) => <option key={page.slug} value={page.slug}>{page.title}</option>)}
          </select>
          <article className="abpage" onClick={onClick}>
            {current ? (
              <>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(current.body) }} />
                <div className="abpager">
                  {previous ? <a href={`/about/${previous.slug}`}>Previous: {previous.title}</a> : <span />}
                  {next ? <a className="nx" href={`/about/${next.slug}`}>Next: {next.title}</a> : <span />}
                </div>
              </>
            ) : (
              <div className="empty"><b>Page not found</b><span>There is no guide page at this address.</span>
                <button type="button" className="btn primary" onClick={() => store.openAbout("")}>Go to Overview</button></div>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
