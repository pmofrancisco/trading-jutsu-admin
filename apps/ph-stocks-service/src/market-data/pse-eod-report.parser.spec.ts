import { readFileSync } from 'fs';
import { join } from 'path';
import { parseEodLines } from './pse-eod-report.parser';

// Real lines extracted (via the same positional-text logic as extractLines)
// from PSE's Daily Quotation Report PDF for August 07, 2026.
const lines = JSON.parse(
  readFileSync(
    join(__dirname, '__fixtures__', 'pse-eod-2026-08-07-lines.json'),
    'utf-8',
  ),
) as string[];

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

  it('stops parsing at the dollar-denominated securities section', () => {
    const rows = parseEodLines(lines);
    expect(rows.some((row) => row.symbol === 'DMPA1')).toBe(false);
    expect(rows.some((row) => row.symbol === 'TCB2A')).toBe(false);
  });
});
