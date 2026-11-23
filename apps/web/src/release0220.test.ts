// Tests for 0.22.0: notes pages read from and written as markdown, links in page text, and markdown imports.
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { linkedCards, linkedTitles, parseNote, tidy, writeNote } from "./notes-md";
import { readMarkdownFiles, safeName } from "./notes-io";
import { exportText } from "./formats";

const roundTrip = (text: string) => writeNote(parseNote(text));

describe("notes markdown", () => {
  it("keeps headings, marks, lists, checklists, tables, quotes, code, dividers and pictures", () => {
    const text = [
      "# Plan", "", "Some **bold**, *italic*, ~~gone~~ and `code` with a [link](https://example.com).", "",
      "- one", "- two", "", "1. first", "2. second", "", "- [ ] to buy", "- [x] bought", "",
      "| A | B |", "| --- | --- |", "| 1 | 2 |", "", "> quoted", "", "```", "code block", "```", "", "---", "",
      "![dot](/api/notes/files/0f8fad5b-d9cb-469f-a165-70867728950e)", "",
    ].join("\n");
    const out = roundTrip(text);
    for (const part of ["# Plan", "**bold**", "*italic*", "~~gone~~", "`code`", "[link](https://example.com)", "- one", "1. first", "- [ ] to buy", "- [x] bought",
      "| 1", "> quoted", "```\ncode block\n```", "---", "![dot](/api/notes/files/0f8fad5b-d9cb-469f-a165-70867728950e)"]) expect(out).toContain(part);
    expect(roundTrip(out)).toBe(out);
  });

  it("keeps page links and card links apart", () => {
    const text = "See [[Elf combo]] with [[card:Llanowar Elves]] and [[card:Fire // Ice]].\n";
    expect(roundTrip(text)).toBe(text);
    const doc = parseNote(text) as { content: Array<{ content: Array<{ type: string }> }> };
    expect(doc.content[0]!.content.map((node) => node.type)).toEqual(["text", "pageLink", "text", "cardLink", "text", "cardLink", "text"]);
    expect(linkedTitles(text)).toEqual(["Elf combo"]);
    expect(linkedCards(text)).toEqual(["Llanowar Elves", "Fire // Ice"]);
  });

  it("saves text without runs of blank lines and with one newline at the end", () => {
    expect(tidy("a  \n\n\n\nb\n\n")).toBe("a\n\nb\n");
    expect(tidy("\n \n")).toBe("");
    expect(roundTrip("")).toBe("");
  });
});

describe("markdown import", () => {
  it("turns folders into parent pages and a note named like its folder into the folder's page", async () => {
    const zip = zipSync({
      "Vault/Decks.md": strToU8("All decks"),
      "Vault/Decks/Elves.md": strToU8("---\ntags: x\n---\n# Elves\n"),
      "Vault/Other/Loose.md": strToU8("Loose"),
      "Vault/attachments/elf.png": new Uint8Array([1, 2, 3]),
      "__MACOSX/Vault/._Decks.md": strToU8("x"),
    });
    const read = await readMarkdownFiles([{ name: "vault.zip", bytes: zip }, { name: "single.md", bytes: strToU8("One file") }]);
    const pages = Object.fromEntries(read.pages.map((page) => [page.key, page]));
    expect(Object.keys(pages).sort()).toEqual(["Vault", "Vault/Decks", "Vault/Decks/Elves", "Vault/Other", "Vault/Other/Loose", "single"]);
    expect(pages["Vault/Decks"]).toMatchObject({ parentKey: "Vault", title: "Decks", body: "All decks" });
    expect(pages["Vault/Decks/Elves"]).toMatchObject({ parentKey: "Vault/Decks", body: "# Elves\n" });
    expect(pages["Vault/Other"]).toMatchObject({ parentKey: "Vault", body: "" });
    expect(pages.single).toMatchObject({ parentKey: null, title: "single" });
    expect(read.files).toEqual([{ name: "Vault/attachments/elf.png", type: "image/png", data: "AQID" }]);
    expect(safeName("A/B: C?")).toBe("A B C");
  });
});

describe("deck text export", () => {
  it("ends a plain text list with the deck's notes as // lines", () => {
    const file = exportText([{ quantity: 1, name: "Sol Ring", set_code: "lea", set_name: "Alpha", collector_number: "1", cardId: "sol", foil: 0 }], "text", "# Plan\n\nRamp\n");
    expect(file.text).toBe("1 Sol Ring (LEA) 1\r\n\r\n// Notes\r\n// # Plan\r\n//\r\n// Ramp");
  });
});
