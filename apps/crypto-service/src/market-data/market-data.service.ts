import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

export interface BulkUpsertResult {
  upserted: number;
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
