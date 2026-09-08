import { readFileSync } from 'fs';
import { join } from 'path';
import { parseEodLines } from './pse-eod-report.parser';

// Real lines extracted (via the same positional-text logic as extractLines)
// from PSE's Daily Quotation Report PDFs.
function loadFixture(date: string): string[] {
  return JSON.parse(
    readFileSync(
      join(__dirname, '__fixtures__', `pse-eod-${date}-lines.json`),
      'utf-8',
    ),
  ) as string[];
}

// August 07, 2026: the report still labelled the index row `PSEI`.
const lines = loadFixture('2026-08-07');

// September 04, 2026: from the August 14, 2026 report on, PSE labels the same
// row `PSEi`, which the case-sensitive parser silently dropped.
const relabelledLines = loadFixture('2026-09-04');

describe('parseEodLines', () => {
  it('parses regular stock rows', () => {
    const rows = parseEodLines(lines);
    const scc = rows.find((row) => row.symbol === 'SCC');

    expect(scc).toEqual({
      symbol: 'SCC',
      open: 20.3,
      high: 20.3,
      low: 19.54,
      close: 20,
      volume: 3_795_500,
      value: 74_924_211,
    });
  });

  it('parses the sectoral summary rows into their mapped symbols', () => {
    const rows = parseEodLines(lines);
    const bySymbol = Object.fromEntries(rows.map((row) => [row.symbol, row]));

    expect(bySymbol.FINA).toEqual({
      symbol: 'FINA',
      open: 1897.16,
      high: 1898.12,
      low: 1879.73,
      close: 1893.64,
      volume: 27_671_602,
      value: 1_155_098_660.46,
    });
    expect(bySymbol.INDU).toMatchObject({
      symbol: 'INDU',
      open: 8136.45,
      close: 8130.14,
      volume: 105_433_746,
      value: 959_223_030.54,
    });
    expect(bySymbol.HOLD).toMatchObject({
      symbol: 'HOLD',
      open: 4451.66,
      close: 4464.63,
      volume: 42_398_811,
      value: 712_953_480.92,
    });
    expect(bySymbol.PROP).toMatchObject({
      symbol: 'PROP',
      open: 1897.77,
      close: 1915.54,
      volume: 128_551_697,
      value: 540_603_738.14,
    });
    expect(bySymbol.SERV).toMatchObject({
      symbol: 'SERV',
      open: 3469.09,
      close: 3475.23,
      volume: 168_772_295,
      value: 2_442_268_025.23,
    });
    expect(bySymbol.MINI).toMatchObject({
      symbol: 'MINI',
      open: 18292.28,
      close: 18305.3,
      volume: 131_837_340,
      value: 416_037_840.26,
    });
  });

  it('parses the PSEI row with null volume/value since the report omits them', () => {
    const rows = parseEodLines(lines);
    const psei = rows.find((row) => row.symbol === 'PSEI');

    expect(psei).toEqual({
      symbol: 'PSEI',
      open: 6274.54,
      high: 6290.35,
      low: 6221.62,
      close: 6290.35,
      volume: null,
      value: null,
    });
  });

  it('parses the PSEI row from reports that label it "PSEi"', () => {
    const rows = parseEodLines(relabelledLines);
    const psei = rows.find((row) => row.symbol === 'PSEI');

    expect(psei).toEqual({
      symbol: 'PSEI',
      open: 6068.48,
      high: 6094.23,
      low: 6057.75,
      close: 6090.6,
      volume: null,
      value: null,
    });
  });

  it('still parses stock and sectoral rows from the relabelled report', () => {
    const rows = parseEodLines(relabelledLines);
    const bySymbol = Object.fromEntries(rows.map((row) => [row.symbol, row]));

    expect(bySymbol.SCC).toMatchObject({ open: 17.22, close: 17.64 });
    expect(Object.keys(bySymbol)).toEqual(
      expect.arrayContaining(['FINA', 'INDU', 'HOLD', 'PROP', 'SERV', 'MINI']),
    );
  });

  it('upper-cases parsed stock symbols', () => {
    const rows = parseEodLines([
      'JOLLIBEE FOODS jfc 250.0 251.0 250.5 255.0 248.2 252.8 1,250,000 315,000,000 -',
    ]);

    expect(rows).toEqual([
      {
        symbol: 'JFC',
        open: 250.5,
        high: 255,
        low: 248.2,
        close: 252.8,
        volume: 1_250_000,
        value: 315_000_000,
      },
    ]);
  });

  it('stops parsing at the dollar-denominated securities section', () => {
    const rows = parseEodLines(lines);
    expect(rows.some((row) => row.symbol === 'DMPA1')).toBe(false);
    expect(rows.some((row) => row.symbol === 'TCB2A')).toBe(false);
  });
});
