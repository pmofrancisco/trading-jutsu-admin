import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ExcludedSymbol } from './excluded-symbol.entity';
import { normalizeSymbolString } from './excluded-symbol.constants';
import { CreateExcludedSymbolDto } from './dto/create-excluded-symbol.dto';
import {
  DEFAULT_EXCLUDED_SYMBOL_LIMIT,
  QueryExcludedSymbolDto,
} from './dto/query-excluded-symbol.dto';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// Each row binds its symbol, its reason, and the two timestamps TypeORM fills
// in, so 1000 of them is 4000 -- well inside the Postgres 65535 ceiling, with
// room for the column count to grow. A whole exclusion list arrives in one
// request, so unlike the currency-pair upsert this one has to chunk.
const BULK_UPSERT_CHUNK_SIZE = 1000;

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

// The stored columns, without the timestamps the database fills in. `reason`
// is spelled out rather than left off when absent: an upsert builds its column
// list from the first row, so a batch whose first symbol carries no reason
// would otherwise silently drop every reason after it.
type ExcludedSymbolRow = Pick<ExcludedSymbol, 'symbol' | 'reason'>;

function toRow(dto: CreateExcludedSymbolDto): ExcludedSymbolRow {
  return { symbol: dto.symbol, reason: dto.reason ?? null };
}

// Postgres rejects an ON CONFLICT statement that would touch the same row
// twice, so a symbol repeated within one request is caller error rather than a
// conflict to resolve -- reject it by name instead of silently dropping one.
function assertNoDuplicateSymbols(rows: ExcludedSymbolRow[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.symbol)) {
      throw new BadRequestException(
        `Duplicate symbol "${row.symbol}" in the same request`,
      );
    }
    seen.add(row.symbol);
  }
}

@Injectable()
export class ExcludedSymbolService {
  constructor(
    @InjectRepository(ExcludedSymbol)
    private readonly excludedSymbolRepository: Repository<ExcludedSymbol>,
  ) {}

  // `insert` rather than `save`: with a natural primary key `save` would issue
  // an UPDATE for a symbol that already exists, quietly succeeding where the
  // caller expected a conflict.
  async create(dto: CreateExcludedSymbolDto): Promise<ExcludedSymbol> {
    const row = toRow(dto);

    try {
      await this.excludedSymbolRepository.insert(row);
    } catch (error) {
      if (driverErrorCode(error) === POSTGRES_UNIQUE_VIOLATION) {
        throw new ConflictException(
          `Symbol "${row.symbol}" is already excluded`,
        );
      }
      throw error;
    }

    return this.findOne(row.symbol);
  }

  findAll(query: QueryExcludedSymbolDto): Promise<ExcludedSymbol[]> {
    const qb =
      this.excludedSymbolRepository.createQueryBuilder('excludedSymbol');

    if (query.symbol) {
      qb.andWhere('excludedSymbol.symbol = :symbol', { symbol: query.symbol });
    }

    return qb
      .orderBy('excludedSymbol.symbol', 'ASC')
      .take(query.limit ?? DEFAULT_EXCLUDED_SYMBOL_LIMIT)
      .skip(query.offset ?? 0)
      .getMany();
  }

  async findOne(symbol: string): Promise<ExcludedSymbol> {
    const excludedSymbol = await this.excludedSymbolRepository.findOneBy({
      symbol,
    });
    if (!excludedSymbol) {
      throw new NotFoundException(`Symbol "${symbol}" is not excluded`);
    }
    return excludedSymbol;
  }

  async remove(symbol: string): Promise<void> {
    // Nothing references this table, so unlike unregistering a currency pair
    // there is no foreign key to refuse the delete: un-excluding a symbol just
    // means the next import stops dropping it.
    const result = await this.excludedSymbolRepository.delete(symbol);
    if (result.affected === 0) {
      throw new NotFoundException(`Symbol "${symbol}" is not excluded`);
    }
  }

  // The excluded symbols, as the set an import filters against. Only the key
  // is relevant here, so this selects the key alone -- at five figures the
  // reasons would be the bulk of the payload for nothing the filter reads.
  async findAllSymbols(): Promise<Set<string>> {
    const rows = await this.excludedSymbolRepository.find({
      select: { symbol: true },
    });
    return new Set(rows.map((row) => row.symbol));
  }

  // A single-symbol check, for the write paths that touch one candle. A
  // primary-key lookup rather than `findAllSymbols`, which would read the
  // whole list to answer a question about one row.
  async isExcluded(symbol: string): Promise<boolean> {
    return this.excludedSymbolRepository.existsBy({
      symbol: normalizeSymbolString(symbol),
    });
  }

  // Excluding the same list twice is the expected case -- a seed rerun, a
  // regenerated instrument list -- so this is idempotent. A conflicting row
  // does have something to update, unlike a currency pair: re-sending a symbol
  // with a new reason rewrites it.
  async bulkUpsert(
    excludedSymbols: CreateExcludedSymbolDto[],
  ): Promise<BulkUpsertResult> {
    const rows = excludedSymbols.map(toRow);
    assertNoDuplicateSymbols(rows);

    // One transaction across every chunk, so a failure part way through a
    // large batch leaves no half-applied exclusion list behind.
    await this.excludedSymbolRepository.manager.transaction(async (manager) => {
      for (let i = 0; i < rows.length; i += BULK_UPSERT_CHUNK_SIZE) {
        await manager.upsert(
          ExcludedSymbol,
          rows.slice(i, i + BULK_UPSERT_CHUNK_SIZE),
          {
            conflictPaths: ['symbol'],
            skipUpdateIfNoValuesChanged: true,
          },
        );
      }
    });

    return { upserted: rows.length };
  }
}
