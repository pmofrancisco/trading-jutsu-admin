import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { MarketData } from './market-data.entity';
import { CreateMarketDataDto } from './dto/create-market-data.dto';
import { UpdateMarketDataDto } from './dto/update-market-data.dto';
import { QueryMarketDataDto } from './dto/query-market-data.dto';
import { ExcludedSymbolService } from '../excluded-symbol/excluded-symbol.service';
import { normalizeSymbolString } from '../excluded-symbol/excluded-symbol.constants';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// Postgres caps a statement at 65535 bound parameters; each candle binds 8, so
// batches are split to keep a full-market upsert well inside that ceiling.
const BULK_UPSERT_CHUNK_SIZE = 1000;

const EOD_PATH = '/v2/aggs/grouped/locale/us/market/stocks';

const SYMBOL_MAX_LENGTH = 20;

// market_data prices are numeric(12, 4): four decimals, and anything at or
// above 10^8 overflows the column. A row outside those bounds would abort the
// whole day's transaction, so it is skipped instead.
const PRICE_DECIMALS = 4;
const PRICE_EXCLUSIVE_MAX = 1e8;

const DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;

export interface BulkUpsertResult {
  upserted: number;
}

export interface ImportEodResult {
  date: string;
  sourceUrl: string;
  imported: number;
  skipped: number;
  // Bars for a well-formed ticker listed in `excluded_symbol`. Counted apart
  // from `skipped` because it means something different: the bar was fine, the
  // symbol is simply one this service does not store. An exclusion list runs
  // to five figures against a feed of twelve thousand bars, so folding the two
  // together would bury the bars that were genuinely unusable.
  excluded: number;
}

// A grouped daily bar as returned by the Massive API. Every field is optional
// here because the payload is untrusted input, not a contract we control.
interface MassiveEodBar {
  T?: unknown;
  o?: unknown;
  h?: unknown;
  l?: unknown;
  c?: unknown;
  v?: unknown;
  t?: unknown;
}

interface MassiveEodResponse {
  results?: MassiveEodBar[];
}

// Reads the Y/M/D digits out of the string rather than going through
// `new Date(string)`, whose local-vs-UTC interpretation depends on whether a
// time component is present and on the server's timezone.
function resolveTradingDate(date?: string): string {
  if (!date) {
    return new Date().toISOString().slice(0, 10);
  }
  const match = DATE_PREFIX_REGEX.exec(date);
  if (!match) {
    throw new BadRequestException(
      `Invalid date "${date}"; expected format YYYY-MM-DD`,
    );
  }
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function roundPrice(value: number): number {
  const factor = 10 ** PRICE_DECIMALS;
  return Math.round(value * factor) / factor;
}

function isValidPrice(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value < PRICE_EXCLUSIVE_MAX
  );
}

// The bar's ticker, or null when it carries nothing `market_data.symbol` could
// hold. Split out of `toCandle` so an import can test the symbol against the
// exclusion list before spending anything on parsing the rest of the bar.
function toSymbol(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > SYMBOL_MAX_LENGTH
  ) {
    return null;
  }
  return value;
}

// Maps one upstream bar onto a candle, or returns null when the bar cannot be
// stored -- an unusable ticker is dropped rather than failing the whole import.
function toCandle(
  symbol: string,
  bar: MassiveEodBar,
): CreateMarketDataDto | null {
  const { o: open, h: high, l: low, c: close, v: volume, t } = bar;

  if (
    typeof t !== 'number' ||
    !Number.isFinite(t) ||
    typeof volume !== 'number' ||
    !Number.isFinite(volume) ||
    volume < 0 ||
    !isValidPrice(open) ||
    !isValidPrice(high) ||
    !isValidPrice(low) ||
    !isValidPrice(close)
  ) {
    return null;
  }

  return {
    symbol,
    // `t` is the start of the aggregate window in Unix milliseconds.
    timestamp: new Date(t),
    open: roundPrice(open),
    high: roundPrice(high),
    low: roundPrice(low),
    close: roundPrice(close),
    volume: Math.round(volume),
    // Massive's grouped daily bars carry no traded value.
    turnover: 0,
  };
}

// Postgres rejects an ON CONFLICT statement that would touch the same row
// twice, so a repeated key within one request is caller error, not a conflict
// to resolve -- reject it by name rather than silently dropping a candle.
function assertNoDuplicateKeys(candles: CreateMarketDataDto[]): void {
  const seen = new Set<string>();
  for (const candle of candles) {
    const key = `${candle.symbol}@${candle.timestamp.toISOString()}`;
    if (seen.has(key)) {
      throw new BadRequestException(
        `Duplicate candle for symbol "${candle.symbol}" at ${candle.timestamp.toISOString()} in the same request`,
      );
    }
    seen.add(key);
  }
}

// A denylist cannot be a foreign key: Postgres can require a referenced row to
// exist, not require one to be absent. So nothing in the database stops an
// excluded symbol from being written, and this is what enforces it instead.
// Compared upper-cased, because `market_data.symbol` is stored as the caller
// sent it -- an exclusion `aapl` slipped past would not be an exclusion.
function assertNoExcludedSymbols(
  candles: CreateMarketDataDto[],
  excludedSymbols: Set<string>,
): void {
  for (const candle of candles) {
    if (excludedSymbols.has(normalizeSymbolString(candle.symbol))) {
      throw new BadRequestException(
        `Symbol "${candle.symbol}" is excluded and cannot be stored`,
      );
    }
  }
}

interface PostgresDriverError {
  code: string;
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as PostgresDriverError | undefined;
  return driverError?.code === POSTGRES_UNIQUE_VIOLATION;
}

@Injectable()
export class MarketDataService {
  constructor(
    @InjectRepository(MarketData)
    private readonly marketDataRepository: Repository<MarketData>,
    private readonly configService: ConfigService,
    private readonly excludedSymbolService: ExcludedSymbolService,
  ) {}

  async create(dto: CreateMarketDataDto): Promise<MarketData> {
    await this.assertNotExcluded(dto.symbol);
    return this.saveOrThrowConflict(this.marketDataRepository.create(dto));
  }

  findAll(query: QueryMarketDataDto): Promise<MarketData[]> {
    const qb = this.marketDataRepository.createQueryBuilder('marketData');

    if (query.symbol) {
      qb.andWhere('marketData.symbol = :symbol', { symbol: query.symbol });
    }
    if (query.from) {
      qb.andWhere('marketData.timestamp >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('marketData.timestamp <= :to', { to: query.to });
    }

    return qb
      .orderBy('marketData.timestamp', 'ASC')
      .take(query.limit ?? 100)
      .skip(query.offset ?? 0)
      .getMany();
  }

  async findOne(id: string): Promise<MarketData> {
    const marketData = await this.marketDataRepository.findOneBy({ id });
    if (!marketData) {
      throw new NotFoundException(`Market data with id ${id} not found`);
    }
    return marketData;
  }

  async update(id: string, dto: UpdateMarketDataDto): Promise<MarketData> {
    // Only when the patch names a symbol: re-checking the stored one would
    // make an unrelated edit fail on a candle that predates the exclusion.
    // Narrowed on `typeof` rather than `!== undefined` because `PartialType`
    // marks every inherited field `@IsOptional()`, which class-validator honours
    // for an explicit `null` too -- so `{ "symbol": null }` reaches here typed
    // as a string but holding null. It is not this check's business to reject:
    // the column is NOT NULL and says so for every field alike.
    if (typeof dto.symbol === 'string') {
      await this.assertNotExcluded(dto.symbol);
    }
    const marketData = await this.findOne(id);
    Object.assign(marketData, dto);
    return this.saveOrThrowConflict(marketData);
  }

  async remove(id: string): Promise<void> {
    const result = await this.marketDataRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Market data with id ${id} not found`);
    }
  }

  async bulkUpsert(candles: CreateMarketDataDto[]): Promise<BulkUpsertResult> {
    return this.upsertCandles(
      candles,
      await this.excludedSymbolService.findAllSymbols(),
    );
  }

  // The shared write path. Takes the exclusion set rather than reading it, so
  // an import that has already filtered against it does not go back for a
  // second copy of a five-figure list.
  private async upsertCandles(
    candles: CreateMarketDataDto[],
    excludedSymbols: Set<string>,
  ): Promise<BulkUpsertResult> {
    assertNoDuplicateKeys(candles);
    assertNoExcludedSymbols(candles, excludedSymbols);

    // One transaction across every chunk, so a failure part way through a
    // large batch leaves no partially ingested session behind.
    await this.marketDataRepository.manager.transaction(async (manager) => {
      for (let i = 0; i < candles.length; i += BULK_UPSERT_CHUNK_SIZE) {
        await manager.upsert(
          MarketData,
          candles.slice(i, i + BULK_UPSERT_CHUNK_SIZE),
          {
            conflictPaths: ['symbol', 'timestamp'],
            skipUpdateIfNoValuesChanged: true,
          },
        );
      }
    });

    return { upserted: candles.length };
  }

  async importEod(date?: string): Promise<ImportEodResult> {
    const tradingDate = resolveTradingDate(date);
    const baseUrl = this.configService
      .getOrThrow<string>('MASSIVE_BASE_URL')
      .replace(/\/+$/, '');
    const apiKey = this.configService.getOrThrow<string>('MASSIVE_API_KEY');

    // Reported back to the caller and quoted in errors, so the key stays out
    // of it; only the request itself carries the credential.
    const sourceUrl = `${baseUrl}${EOD_PATH}/${tradingDate}?adjusted=true`;

    let response: Response;
    try {
      response = await fetch(`${sourceUrl}&apiKey=${apiKey}`);
    } catch (error) {
      throw new BadGatewayException(
        `Failed to fetch grouped daily bars at ${sourceUrl}: ${(error as Error).message}`,
      );
    }
    if (response.status === 404) {
      throw new NotFoundException(
        `No grouped daily bars found at ${sourceUrl}`,
      );
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `Failed to fetch grouped daily bars at ${sourceUrl} (HTTP ${response.status})`,
      );
    }

    let payload: MassiveEodResponse;
    try {
      payload = (await response.json()) as MassiveEodResponse;
    } catch (error) {
      throw new BadGatewayException(
        `Unexpected response from ${sourceUrl}: ${(error as Error).message}`,
      );
    }
    if (!Array.isArray(payload.results)) {
      throw new BadGatewayException(
        `Unexpected response from ${sourceUrl}: missing "results" array`,
      );
    }

    // The feed carries every symbol Massive quotes; this list is the ones not
    // worth storing. Read once per import rather than once per bar, and the
    // batch is filtered before it reaches the database -- there is no
    // constraint to reject an excluded symbol on the way in.
    const excludedSymbols = await this.excludedSymbolService.findAllSymbols();

    const candles: CreateMarketDataDto[] = [];
    let excluded = 0;

    for (const bar of payload.results) {
      const symbol = toSymbol(bar.T);
      if (symbol === null) {
        continue;
      }
      // Checked before the bar is parsed: an excluded symbol is dropped for
      // that reason whatever else is wrong with it, which keeps the counts
      // from depending on the order the two checks happen to run in.
      if (excludedSymbols.has(normalizeSymbolString(symbol))) {
        excluded += 1;
        continue;
      }
      const candle = toCandle(symbol, bar);
      if (candle !== null) {
        candles.push(candle);
      }
    }

    if (candles.length > 0) {
      await this.upsertCandles(candles, excludedSymbols);
    }

    return {
      date: tradingDate,
      sourceUrl,
      imported: candles.length,
      skipped: payload.results.length - candles.length - excluded,
      excluded,
    };
  }

  // Single-symbol guard for the routes that write one candle. A key lookup
  // rather than the whole set, which the write paths have no other use for.
  private async assertNotExcluded(symbol: string): Promise<void> {
    if (await this.excludedSymbolService.isExcluded(symbol)) {
      throw new BadRequestException(
        `Symbol "${symbol}" is excluded and cannot be stored`,
      );
    }
  }

  private async saveOrThrowConflict(
    marketData: MarketData,
  ): Promise<MarketData> {
    try {
      return await this.marketDataRepository.save(marketData);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Market data for symbol "${marketData.symbol}" at ${marketData.timestamp.toISOString()} already exists`,
        );
      }
      throw error;
    }
  }
}
