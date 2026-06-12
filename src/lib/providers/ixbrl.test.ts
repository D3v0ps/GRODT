import { describe, expect, it } from "vitest";
import { extractZipEntries, parseAnnualReport, parseIxbrlFinancials } from "./ixbrl";

/** Syntetisk iXBRL enligt svenska taxonomin (se-gen-base). */
const IXBRL = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance">
<head><title>Årsredovisning</title></head>
<body>
<div style="display:none">
  <xbrli:context id="period_nu">
    <xbrli:period><xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate></xbrli:period>
  </xbrli:context>
  <xbrli:context id="period_fg">
    <xbrli:period><xbrli:startDate>2023-01-01</xbrli:startDate><xbrli:endDate>2023-12-31</xbrli:endDate></xbrli:period>
  </xbrli:context>
</div>
<p>Nettoomsättningen uppgick till
  <ix:nonFraction name="se-gen-base:Nettoomsattning" contextRef="period_nu" unitRef="SEK" decimals="-3" scale="3" format="ixt:numspacecomma">8 110</ix:nonFraction> tkr
  (<ix:nonFraction name="se-gen-base:Nettoomsattning" contextRef="period_fg" unitRef="SEK" decimals="-3" scale="3">3 240</ix:nonFraction> tkr).
</p>
<p>Årets resultat:
  <ix:nonFraction name="se-gen-base:AretsResultat" contextRef="period_nu" unitRef="SEK" scale="0">562 000</ix:nonFraction>
  respektive
  <ix:nonFraction name="se-gen-base:AretsResultat" contextRef="period_fg" unitRef="SEK" scale="0" sign="-">120 500</ix:nonFraction>.
</p>
<p>Medelantalet anställda:
  <ix:nonFraction name="se-gen-base:MedelantaletAnstallda" contextRef="period_nu" unitRef="antal" scale="0">19</ix:nonFraction>
</p>
<p>Soliditet:
  <ix:nonFraction name="se-gen-base:Soliditet" contextRef="period_nu" unitRef="procent" scale="0">42,5</ix:nonFraction>
</p>
</body></html>`;

describe("iXBRL-tolkning av årsredovisningar", () => {
  it("läser nettoomsättning, resultat, anställda och soliditet per räkenskapsår", () => {
    const rows = parseIxbrlFinancials(IXBRL);
    expect(rows).toEqual([
      { year: 2023, revenueSek: 3_240_000, profitSek: -120_500, employees: null, soliditetPct: null },
      { year: 2024, revenueSek: 8_110_000, profitSek: 562_000, employees: 19, soliditetPct: 42.5 },
    ]);
  });

  it("scale=3 betyder tkr och konverteras till kr", () => {
    const rows = parseIxbrlFinancials(IXBRL);
    expect(rows.find((r) => r.year === 2024)?.revenueSek).toBe(8_110_000);
  });

  it("sign=\"-\" ger negativt resultat (förlustår)", () => {
    const rows = parseIxbrlFinancials(IXBRL);
    expect(rows.find((r) => r.year === 2023)?.profitSek).toBe(-120_500);
  });

  it("returnerar tomt för dokument utan taggar", () => {
    expect(parseIxbrlFinancials("<html><body>Skannad PDF utan taggar</body></html>")).toEqual([]);
  });
});

/** Bygger en minimal ZIP (stored, utan komprimering) runt en fil. */
function buildStoredZip(name: string, content: Buffer): Buffer {
  const nameBuffer = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version
  local.writeUInt16LE(0, 6); // flaggor
  local.writeUInt16LE(0, 8); // metod: stored
  local.writeUInt32LE(content.length, 18); // komprimerad storlek
  local.writeUInt32LE(content.length, 22); // okomprimerad storlek
  local.writeUInt16LE(nameBuffer.length, 26);
  local.writeUInt16LE(0, 28);

  const localChunk = Buffer.concat([local, nameBuffer, content]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0, 10); // metod
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  central.writeUInt32LE(0, 42); // offset till local header
  const centralChunk = Buffer.concat([central, nameBuffer]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8); // antal poster (denna disk)
  eocd.writeUInt16LE(1, 10); // antal poster totalt
  eocd.writeUInt32LE(centralChunk.length, 12);
  eocd.writeUInt32LE(localChunk.length, 16); // offset till central dir

  return Buffer.concat([localChunk, centralChunk, eocd]);
}

describe("ZIP-läsaren", () => {
  it("packar upp och tolkar en årsredovisning ur ZIP", () => {
    const zip = buildStoredZip("arsredovisning.xhtml", Buffer.from(IXBRL, "utf8"));
    const entries = extractZipEntries(zip);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("arsredovisning.xhtml");

    const rows = parseAnnualReport(zip);
    expect(rows.map((r) => r.year)).toEqual([2023, 2024]);
  });

  it("tolkar rå XHTML utan ZIP-omslag", () => {
    const rows = parseAnnualReport(Buffer.from(IXBRL, "utf8"));
    expect(rows).toHaveLength(2);
  });
});
