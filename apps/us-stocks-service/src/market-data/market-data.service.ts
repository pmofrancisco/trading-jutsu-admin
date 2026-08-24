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

// Maps one upstream bar onto a candle, or returns null when the bar cannot be
// stored -- an unusable ticker is dropped rather than failing the whole import.
function toCandle(bar: MassiveEodBar): CreateMarketDataDto | null {
  const { T: symbol, o: open, h: high, l: low, c: close, v: volume, t } = bar;

  if (
    typeof symbol !== 'string' ||
    symbol.length === 0 ||
    symbol.length > SYMBOL_MAX_LENGTH ||
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

    const candles = payload.results
      .map(toCandle)
      .filter((candle): candle is CreateMarketDataDto => candle !== null);

    if (candles.length > 0) {
      await this.bulkUpsert(candles);
    }

    return {
      date: tradingDate,
      sourceUrl,
      imported: candles.length,
      skipped: payload.results.length - candles.length,
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
