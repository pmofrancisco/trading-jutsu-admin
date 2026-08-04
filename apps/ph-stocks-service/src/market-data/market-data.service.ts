import {
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

export interface YtdPerformance {
  symbol: string;
  from: Date;
  to: Date;
  startClose: number;
  endClose: number;
  changePct: number;
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

  async getYtdPerformance(
    symbol: string,
    asOf: Date = new Date(),
  ): Promise<YtdPerformance> {
    const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));

    const baseline = await this.marketDataRepository
      .createQueryBuilder('marketData')
      .where('marketData.symbol = :symbol', { symbol })
      .andWhere('marketData.timestamp < :yearStart', { yearStart })
      .orderBy('marketData.timestamp', 'DESC')
      .limit(1)
      .getOne();

    const latest = await this.marketDataRepository
      .createQueryBuilder('marketData')
      .where('marketData.symbol = :symbol', { symbol })
      .andWhere('marketData.timestamp <= :asOf', { asOf })
      .orderBy('marketData.timestamp', 'DESC')
      .limit(1)
      .getOne();

    if (!baseline || !latest) {
      throw new NotFoundException(`No market data for symbol "${symbol}"`);
    }

    return {
      symbol,
      from: baseline.timestamp,
      to: latest.timestamp,
      startClose: baseline.close,
      endClose: latest.close,
      changePct: ((latest.close - baseline.close) / baseline.close) * 100,
    };
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

  async bulkUpsert(candles: CreateMarketDataDto[]): Promise<void> {
    await this.marketDataRepository.upsert(candles, {
      conflictPaths: ['symbol', 'timestamp'],
      skipUpdateIfNoValuesChanged: true,
    });
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
