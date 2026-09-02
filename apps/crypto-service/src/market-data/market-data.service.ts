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

const POSTGRES_UNIQUE_VIOLATION = '23505';

// Postgres caps a statement at 65535 bound parameters; each candle binds 8, so
// batches are split to keep a large upsert well inside that ceiling.
const BULK_UPSERT_CHUNK_SIZE = 1000;

const EOD_PATH = '/v2/aggs/grouped/locale/global/market/crypto';

const SYMBOL_MAX_LENGTH = 20;

// Massive quotes crypto as `X:<base><quote>`. Only USD pairs are imported, and
// the pair notation is dropped so `X:BTCUSD` is stored as `BTC`. The capture is
// greedy, so `X:USDTUSD` yields `USDT` rather than stopping at the first `USD`,
// and a bare `X:USD` has no base to capture and so does not match at all.
const USD_TICKER_REGEX = /^X:(.+)USD$/;

// market_data prices are numeric(24, 12) and volume numeric(30, 12): twelve
// decimals, and twelve resp. eighteen integer digits before the column
// overflows. A row outside those bounds would abort the whole day's
// transaction, so it is skipped instead.
const PRICE_DECIMALS = 12;
const PRICE_EXCLUSIVE_MAX = 1e12;
const VOLUME_DECIMALS = 12;
const VOLUME_EXCLUSIVE_MAX = 1e18;

const DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;

const MS_PER_DAY = 86_400_000;

export interface BulkUpsertResult {
  upserted: number;
}

export interface ImportEodResult {
  date: string;
  sourceUrl: string;
  imported: number;
  filtered: number;
  skipped: number;
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

// Scaling by 10^12 and rounding would lose precision on a large volume -- a
// value in the billions times 10^12 is far past Number.MAX_SAFE_INTEGER -- so
// the rounding goes through the decimal representation instead.
function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

// Returns the stored symbol for a USD pair, or null for any other quote
// currency -- those are filtered out rather than treated as bad data.
function toSymbol(ticker: unknown): string | null {
  if (typeof ticker !== 'string') {
    return null;
  }
  const symbol = USD_TICKER_REGEX.exec(ticker)?.[1];
  if (!symbol || symbol.length > SYMBOL_MAX_LENGTH) {
    return null;
  }
  return symbol;
}

// Bounds are checked against the rounded value, not the raw one: a price below
// 1e-12 rounds away to zero, which the column cannot tell apart from no price
// at all, and one just under the ceiling must not round up past it.
function toPrice(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const rounded = roundTo(value, PRICE_DECIMALS);
  return rounded > 0 && rounded < PRICE_EXCLUSIVE_MAX ? rounded : null;
}

function toVolume(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const rounded = roundTo(value, VOLUME_DECIMALS);
  return rounded < VOLUME_EXCLUSIVE_MAX ? rounded : null;
}

// Maps one upstream bar onto a candle, or returns null when the bar cannot be
// stored -- an unusable pair is dropped rather than failing the whole import.
function toCandle(
  symbol: string,
  bar: MassiveEodBar,
): CreateMarketDataDto | null {
  const open = toPrice(bar.o);
  const high = toPrice(bar.h);
  const low = toPrice(bar.l);
  const close = toPrice(bar.c);
  const volume = toVolume(bar.v);
  const t = bar.t;

  if (
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    volume === null ||
    typeof t !== 'number' ||
    !Number.isFinite(t)
  ) {
    return null;
  }

  return {
    symbol,
    // `t` marks the end of the aggregate window (23:59:59.999 UTC) for these
    // grouped bars, so it is floored to the day it closes to key the candle by
    // its trading date.
    timestamp: new Date(Math.floor(t / MS_PER_DAY) * MS_PER_DAY),
    open,
    high,
    low,
    close,
    volume,
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
  ) {}

  create(dto: CreateMarketDataDto): Promise<MarketData> {
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
    assertNoDuplicateKeys(candles);

    // One transaction across every chunk, so a failure part way through a
    // large batch leaves no partially ingested range behind.
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

    // Two separate outcomes, counted apart: a non-USD pair is filtered by
    // design and says nothing about the feed, while a USD pair that cannot be
    // stored is bad data worth noticing.
    const usdBars = payload.results.flatMap((bar) => {
      const symbol = toSymbol(bar.T);
      return symbol === null ? [] : [{ symbol, bar }];
    });

    const candles = usdBars
      .map(({ symbol, bar }) => toCandle(symbol, bar))
      .filter((candle): candle is CreateMarketDataDto => candle !== null);

    if (candles.length > 0) {
      await this.bulkUpsert(candles);
    }

    return {
      date: tradingDate,
      sourceUrl,
      imported: candles.length,
      filtered: payload.results.length - usdBars.length,
      skipped: usdBars.length - candles.length,
    };
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
