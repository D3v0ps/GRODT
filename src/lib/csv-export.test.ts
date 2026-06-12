import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "./csv-export";

describe("CSV-export", () => {
  it("citerar fält med semikolon, citattecken och radbrytning", () => {
    expect(csvEscape("Bemanning; Syd AB")).toBe('"Bemanning; Syd AB"');
    expect(csvEscape('Säger "hej" AB')).toBe('"Säger ""hej"" AB"');
    expect(csvEscape("rad\nbrytning")).toBe('"rad\nbrytning"');
    expect(csvEscape("Vanligt namn AB")).toBe("Vanligt namn AB");
  });

  it("neutraliserar formelinjektion (=, +, -, @) med apostrof", () => {
    expect(csvEscape("=HYPERLINK(\"http://ond.se\")")).toBe(
      "\"'=HYPERLINK(\"\"http://ond.se\"\")\"",
    );
    expect(csvEscape("+46 8 123 45 67")).toBe("'+46 8 123 45 67");
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("-Bolaget AB")).toBe("'-Bolaget AB");
  });

  it("lämnar rena tal orörda, även negativa", () => {
    expect(csvEscape("-12,5")).toBe("-12,5");
    expect(csvEscape("-1200")).toBe("-1200");
    expect(csvEscape("5000000")).toBe("5000000");
  });

  it("bygger semikolonseparerad fil med BOM och CRLF", () => {
    const csv = toCsv([
      ["Bolagsnamn", "Orgnr"],
      ["Nordisk Bemanning AB", "556712-4830"],
      [null, "x"],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Bolagsnamn;Orgnr\r\n");
    expect(csv).toContain("Nordisk Bemanning AB;556712-4830\r\n");
    expect(csv).toContain(";x\r\n");
  });
});
