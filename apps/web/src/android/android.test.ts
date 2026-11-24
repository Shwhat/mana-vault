import { describe, expect, it } from "vitest";
import { sortLines } from "../recognize";
import { newerVersion } from "./AppScreens";
import { isPrivateAddress, normalizeServer } from "./platform";
import { matchOnPhone, printingsOf, setCatalogForTest } from "./catalog";

describe("server address", () => {
  it("adds https and drops a trailing slash", () => {
    expect(normalizeServer("vault.example.com/")).toBe("https://vault.example.com");
    expect(normalizeServer(" http://192.168.1.20:8080 ")).toBe("http://192.168.1.20:8080");
    expect(normalizeServer("ftp://example.com")).toBeNull();
    expect(normalizeServer("")).toBeNull();
  });

  it("allows plain http only on home network addresses", () => {
    for (const address of ["http://192.168.1.20:8080", "http://10.0.0.5", "http://172.20.1.1", "http://nas.local:3000", "http://100.101.1.2"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ["http://vault.example.com", "http://8.8.8.8", "http://172.40.1.1"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});

describe("update check", () => {
  it("compares versions part by part", () => {
    expect(newerVersion("v0.10.0", "0.9.9")).toBe(true);
    expect(newerVersion("0.5.0", "0.5.0")).toBe(false);
    expect(newerVersion("0.4.9", "0.5.0")).toBe(false);
  });
});

describe("text read on the phone", () => {
  it("keeps printing languages and distinguishes set-only recognition offline", async () => {
    setCatalogForTest({
      version: "scan-language",
      fields: ["id", "oracle_id", "name", "set_code", "collector_number", "lang", "released_at", "promo", "variation"],
      rows: [
        ["bolt-ja", "bolt", "Lightning Bolt", "lea", "161", "ja", "1993-01-01", 0, 0],
        ["bolt-en", "bolt", "Lightning Bolt", "lea", "161", "en", "1993-01-01", 0, 0],
      ],
    });
    try {
      expect(await matchOnPhone(["Lightning Bolt"], "LEA EN")).toMatchObject({ by: "printing", exact: false });
      expect(await matchOnPhone(["Lightning Bolt"], "161 LEA EN")).toMatchObject({ by: "printing" });
      expect((await printingsOf("bolt-ja")).map((card) => card.lang)).toEqual(["ja", "en"]);
    } finally {
      setCatalogForTest(null);
    }
  });

  it("sorts lines into the name line and the info line by their place on the card", () => {
    const read = sortLines([
      { text: "Lightning  Bolt", x: 0.06, y: 0.05 },
      { text: "Instant", x: 0.06, y: 0.56 },
      { text: "Lightning Bolt deals 3 damage", x: 0.06, y: 0.7 },
      { text: "0146 C", x: 0.04, y: 0.9 },
      { text: "M10 EN Christopher Moeller", x: 0.04, y: 0.93 },
      { text: "TM & 2009 Wizards", x: 0.7, y: 0.95 },
    ]);
    expect(read.lines).toEqual(["Lightning Bolt"]);
    expect(read.info).toBe("0146 C\nM10 EN Christopher Moeller");
  });

  it("looks further out in the wide mode", () => {
    const read = sortLines([{ text: "Serra Angel", x: 0.1, y: -0.12 }], "wide");
    expect(read.lines).toEqual(["Serra Angel"]);
    expect(sortLines([{ text: "Serra Angel", x: 0.1, y: -0.12 }]).lines).toEqual([]);
  });
});
