import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CurrencyPair } from './currency-pair.entity';
import { toSymbol } from './currency-pair.constants';
import { CreateCurrencyPairDto } from './dto/create-currency-pair.dto';
import {
  DEFAULT_CURRENCY_PAIR_LIMIT,
  QueryCurrencyPairDto,
} from './dto/query-currency-pair.dto';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// A pair naming a currency that is not in the reference table trips the
// foreign key rather than any check this service could do without a second
// query.
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

export interface BulkUpsertResult {
  upserted: number;
}

interface PostgresDriverError {
  code: string;
}

function driverErrorCode(error: unknown): string | undefined {
  if (!(error instanceof QueryFailedError)) {
    return undefined;
  }
  return (error.driverError as PostgresDriverError | undefined)?.code;
}

// The stored columns of a pair, without the timestamps the database fills in
// or the relations nothing writes through.
type CurrencyPairRow = Pick<
  CurrencyPair,
  'symbol' | 'baseCurrencyCode' | 'quoteCurrencyCode'
>;

// Written here rather than in the DTO so the symbol is derived on the one path
// that reaches the database, whether the pair arrived singly or in a batch.
function toRow(dto: CreateCurrencyPairDto): CurrencyPairRow {
  return {
    symbol: toSymbol(dto.baseCurrencyCode, dto.quoteCurrencyCode),
    baseCurrencyCode: dto.baseCurrencyCode,
    quoteCurrencyCode: dto.quoteCurrencyCode,
  };
}

// EURENR is not a market, and the database says so too -- but a check
// constraint surfaces as a 500 unless it is caught, and this one is worth a
// message that names the currency.
function assertDistinctCurrencies(dto: CreateCurrencyPairDto): void {
  if (dto.baseCurrencyCode === dto.quoteCurrencyCode) {
    throw new BadRequestException(
      `A pair cannot be "${dto.baseCurrencyCode}" against itself`,
    );
  }
}

// Postgres rejects an ON CONFLICT statement that would touch the same row
// twice, so a pair repeated within one request is caller error rather than a
// conflict to resolve -- reject it by name instead of silently dropping one.
function assertNoDuplicateSymbols(rows: CurrencyPairRow[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.symbol)) {
      throw new BadRequestException(
        `Duplicate currency pair "${row.symbol}" in the same request`,
      );
    }
    seen.add(row.symbol);
  }
}

@Injectable()
export class CurrencyPairService {
  constructor(
    @InjectRepository(CurrencyPair)
    private readonly currencyPairRepository: Repository<CurrencyPair>,
  ) {}

  // `insert` rather than `save`, for the same reason as `CurrencyService`:
  // with a natural primary key `save` would issue an UPDATE for a pair that
  // already exists, quietly succeeding where the caller expected a conflict.
  async create(dto: CreateCurrencyPairDto): Promise<CurrencyPair> {
    assertDistinctCurrencies(dto);
    const row = toRow(dto);

    try {
      await this.currencyPairRepository.insert(row);
    } catch (error) {
      const code = driverErrorCode(error);
      if (code === POSTGRES_UNIQUE_VIOLATION) {
        throw new ConflictException(
          `Currency pair "${row.symbol}" already exists`,
        );
      }
      if (code === POSTGRES_FOREIGN_KEY_VIOLATION) {
        throw new BadRequestException(
          `Currency pair "${row.symbol}" names a currency that does not exist`,
        );
      }
      throw error;
    }

    return this.findOne(row.symbol);
  }

  findAll(query: QueryCurrencyPairDto): Promise<CurrencyPair[]> {
    const qb = this.currencyPairRepository.createQueryBuilder('currencyPair');

    if (query.symbol) {
      qb.andWhere('currencyPair.symbol = :symbol', { symbol: query.symbol });
    }
    if (query.baseCurrencyCode) {
      qb.andWhere('currencyPair.baseCurrencyCode = :baseCurrencyCode', {
        baseCurrencyCode: query.baseCurrencyCode,
      });
    }
    if (query.quoteCurrencyCode) {
      qb.andWhere('currencyPair.quoteCurrencyCode = :quoteCurrencyCode', {
        quoteCurrencyCode: query.quoteCurrencyCode,
      });
    }

    return qb
      .orderBy('currencyPair.symbol', 'ASC')
      .take(query.limit ?? DEFAULT_CURRENCY_PAIR_LIMIT)
      .skip(query.offset ?? 0)
      .getMany();
  }

  async findOne(symbol: string): Promise<CurrencyPair> {
    const currencyPair = await this.currencyPairRepository.findOneBy({
      symbol,
    });
    if (!currencyPair) {
      throw new NotFoundException(`Currency pair "${symbol}" not found`);
    }
    return currencyPair;
  }

  async remove(symbol: string): Promise<void> {
    const result = await this.currencyPairRepository.delete(symbol);
    if (result.affected === 0) {
      throw new NotFoundException(`Currency pair "${symbol}" not found`);
    }
  }

  // Registering the same pair list twice is the expected case -- a seed rerun,
  // a feed's instrument list -- so this is idempotent. Every column is either
  // the key or part of what derives it, so there is nothing for a conflicting
  // row to update; `skipUpdateIfNoValuesChanged` keeps that from writing a new
  // row version for no reason.
  async bulkUpsert(
    currencyPairs: CreateCurrencyPairDto[],
  ): Promise<BulkUpsertResult> {
    for (const dto of currencyPairs) {
      assertDistinctCurrencies(dto);
    }
    const rows = currencyPairs.map(toRow);
    assertNoDuplicateSymbols(rows);

    // The DTO caps a batch well inside the Postgres bound-parameter ceiling,
    // so this goes out as one statement -- no chunking, and nothing to wrap in
    // a transaction of its own.
    try {
      await this.currencyPairRepository.upsert(rows, {
        conflictPaths: ['symbol'],
        skipUpdateIfNoValuesChanged: true,
      });
    } catch (error) {
      if (driverErrorCode(error) === POSTGRES_FOREIGN_KEY_VIOLATION) {
        throw new BadRequestException(
          'One or more currency pairs name a currency that does not exist',
        );
      }
      throw error;
    }

    return { upserted: rows.length };
  }
}
