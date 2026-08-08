export interface PseEodRow {
  symbol: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  value: number | null;
}

// PSE's Daily Quotation Report has a "Dollar Denominated Securities"
// sub-section (bracketed by this marker and its own "DDS TOTAL" line) with
// USD-denominated prices; skip just that sub-section to avoid mixing
// currencies into PHP fields. The Sectoral Summary table (with PHP values)
// follows later in the same report, so parsing must continue past it.
const DOLLAR_SECTION_MARKER = 'DOLLARDENOMINATEDSECURITIES';
const DOLLAR_SECTION_END_PREFIX = 'DDS TOTAL';

const NUMBER_OR_DASH = String.raw`-|\(?[\d,]+(?:\.\d+)?\)?`;

// A data row looks like:
// "<Issue Name...> <SYMBOL> <Bid> <Ask> <Open> <High> <Low> <Close> <Volume> <Value> <NetForeign>"
const ROW_REGEX = new RegExp(
  `^.+?\\s+([A-Z][A-Z0-9]{0,19})` +
    Array.from({ length: 9 }, () => `\\s+(${NUMBER_OR_DASH})`).join('') +
    '$',
);

// The report's "SECTORAL SUMMARY" table uses these exact labels; map each to
// the symbol its candle should be stored under.
const SECTOR_SYMBOLS: Record<string, string> = {
  Financials: 'FINA',
  Industrial: 'INDU',
  'Holding Firms': 'HOLD',
  Property: 'PROP',
  Services: 'SERV',
  'Mining & Oil': 'MINI',
};

const SECTOR_NAME_PATTERN = Object.keys(SECTOR_SYMBOLS)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

// A sectoral row looks like:
// "<Sector Name> <Open> <High> <Low> <Close> <%Change> <Pt.Change> <Volume> <Value>"
const SECTOR_ROW_REGEX = new RegExp(
  `^(${SECTOR_NAME_PATTERN})` +
    Array.from({ length: 6 }, () => `\\s+(${NUMBER_OR_DASH})`).join('') +
    `(?:\\s+(${NUMBER_OR_DASH})\\s+(${NUMBER_OR_DASH}))?$`,
);

// The PSEI row has no Volume/Value columns:
// "PSEI <Open> <High> <Low> <Close> <%Change> <Pt.Change>"
const PSEI_ROW_REGEX = new RegExp(
  `^PSEI` +
    Array.from({ length: 6 }, () => `\\s+(${NUMBER_OR_DASH})`).join('') +
    '$',
);

function parseNumberOrNull(token: string): number | null {
  if (token === '-') {
    return null;
  }
  const negative = token.startsWith('(') && token.endsWith(')');
  const cleaned = token.replace(/[(),]/g, '');
  const value = Number(cleaned);
  return negative ? -value : value;
}

interface PositionedText {
  x: number;
  width: number;
  str: string;
}

async function extractLines(pdfBuffer: Buffer): Promise<string[]> {
  const pdfjsLib: typeof import('pdfjs-dist') =
    await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    verbosity: pdfjsLib.VerbosityLevel.ERRORS,
  }).promise;

  const lines: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const rowsByY = new Map<number, PositionedText[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) {
        continue;
      }
      // pdfjs-dist types `transform` as `any[]`; index 4/5 are the x/y translation.
      const x = item.transform[4] as number;
      const y = Math.round(item.transform[5] as number);
      let key = y;
      for (const existingY of rowsByY.keys()) {
        if (Math.abs(existingY - y) <= 2) {
          key = existingY;
          break;
        }
      }
      const bucket = rowsByY.get(key) ?? [];
      bucket.push({ x, width: item.width, str: item.str });
      rowsByY.set(key, bucket);
    }

    const sortedYs = [...rowsByY.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = rowsByY.get(y)!.sort((a, b) => a.x - b.x);
      let line = '';
      let lastEnd: number | null = null;
      for (const item of items) {
        if (lastEnd !== null && item.x - lastEnd > 1.5) {
          line += ' ';
        }
        line += item.str;
        lastEnd = item.x + item.width;
      }
      lines.push(line.trim());
    }
  }
  return lines;
}

export function parseEodLines(lines: string[]): PseEodRow[] {
  const rows: PseEodRow[] = [];
  let inDollarSection = false;

  for (const line of lines) {
    if (line.replace(/\s+/g, '') === DOLLAR_SECTION_MARKER) {
      inDollarSection = true;
      continue;
    }
    if (inDollarSection) {
      if (line.startsWith(DOLLAR_SECTION_END_PREFIX)) {
        inDollarSection = false;
      }
      continue;
    }

    const sectorMatch = SECTOR_ROW_REGEX.exec(line);
    if (sectorMatch) {
      const [, name, open, high, low, close, , , volume, value] = sectorMatch;
      rows.push({
        symbol: SECTOR_SYMBOLS[name],
        open: parseNumberOrNull(open),
        high: parseNumberOrNull(high),
        low: parseNumberOrNull(low),
        close: parseNumberOrNull(close),
        volume: volume === undefined ? null : parseNumberOrNull(volume),
        value: value === undefined ? null : parseNumberOrNull(value),
      });
      continue;
    }

    const pseiMatch = PSEI_ROW_REGEX.exec(line);
    if (pseiMatch) {
      const [, open, high, low, close] = pseiMatch;
      rows.push({
        symbol: 'PSEI',
        open: parseNumberOrNull(open),
        high: parseNumberOrNull(high),
        low: parseNumberOrNull(low),
        close: parseNumberOrNull(close),
        volume: null,
        value: null,
      });
      continue;
    }

    const match = ROW_REGEX.exec(line);
    if (!match) {
      continue;
    }
    const [, symbol, , , open, high, low, close, volume, value] = match;
    rows.push({
      symbol,
      open: parseNumberOrNull(open),
      high: parseNumberOrNull(high),
      low: parseNumberOrNull(low),
      close: parseNumberOrNull(close),
      volume: parseNumberOrNull(volume),
      value: parseNumberOrNull(value),
    });
  }

  return rows;
}

export async function parsePseEodReport(
  pdfBuffer: Buffer,
): Promise<PseEodRow[]> {
  const lines = await extractLines(pdfBuffer);
  return parseEodLines(lines);
}
