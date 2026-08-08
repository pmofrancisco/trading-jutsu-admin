export interface PseEodRow {
  symbol: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  value: number | null;
}

// PSE's Daily Quotation Report switches to USD-denominated prices past this
// section; stop parsing there to avoid mixing currencies into PHP fields.
const DOLLAR_SECTION_MARKER = 'DOLLARDENOMINATEDSECURITIES';

const NUMBER_OR_DASH = String.raw`-|\(?[\d,]+(?:\.\d+)?\)?`;

// A data row looks like:
// "<Issue Name...> <SYMBOL> <Bid> <Ask> <Open> <High> <Low> <Close> <Volume> <Value> <NetForeign>"
const ROW_REGEX = new RegExp(
  `^.+?\\s+([A-Z][A-Z0-9]{0,19})` +
    Array.from({ length: 9 }, () => `\\s+(${NUMBER_OR_DASH})`).join('') +
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

export async function parsePseEodReport(
  pdfBuffer: Buffer,
): Promise<PseEodRow[]> {
  const lines = await extractLines(pdfBuffer);
  const rows: PseEodRow[] = [];

  for (const line of lines) {
    if (line.replace(/\s+/g, '') === DOLLAR_SECTION_MARKER) {
      break;
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
