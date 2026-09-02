import {
  BadGatewayException,
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
import { parsePseEodReport } from './pse-eod-report.parser';

const POSTGRES_UNIQUE_VIOLATION = '23505';
const PSE_EOD_REPORT_BASE_URL = 'https://documents.pse.com.ph/market_report';
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface ImportEodResult {
  date: string;
  sourceUrl: string;
  imported: number;
  skipped: number;
}

const DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;

// Pulls the Y/M/D digits straight out of the string instead of going through
// `new Date(string)`, whose local-vs-UTC interpretation depends on whether a
// time component is present and the server's timezone (see PSE EOD import bug).
function resolveReportDate(date?: string): Date {
  if (!date) {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }
  const match = DATE_PREFIX_REGEX.exec(date);
  if (!match) {
    throw new BadRequestException(
      `Invalid date "${date}"; expected format YYYY-MM-DD`,
    );
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function buildPseEodReportUrl(reportDate: Date): string {
  const monthName = MONTH_NAMES[reportDate.getUTCMonth()];
  const day = String(reportDate.getUTCDate()).padStart(2, '0');
  const year = reportDate.getUTCFullYear();
  const fileName = `${monthName} ${day}, ${year}-EOD.pdf`.replace(/ /g, '%20');
  return `${PSE_EOD_REPORT_BASE_URL}/${fileName}`;
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

  async bulkUpsert(candles: CreateMarketDataDto[]): Promise<void> {
    await this.marketDataRepository.upsert(candles, {
      conflictPaths: ['symbol', 'timestamp'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  async importEod(date?: string): Promise<ImportEodResult> {
    const reportDate = resolveReportDate(date);
    const sourceUrl = buildPseEodReportUrl(reportDate);

    let response: Response;
    try {
      response = await fetch(sourceUrl);
    } catch (error) {
      throw new BadGatewayException(
        `Failed to fetch PSE EOD report at ${sourceUrl}: ${(error as Error).message}`,
      );
    }
    if (!response.ok) {
      throw new NotFoundException(
        `PSE EOD report not found at ${sourceUrl} (HTTP ${response.status})`,
      );
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    const rows = await parsePseEodReport(pdfBuffer);

    const candles: CreateMarketDataDto[] = rows
      .filter(
        (row) =>
          row.open !== null &&
          row.high !== null &&
          row.low !== null &&
          row.close !== null,
      )
      .map((row) => ({
        symbol: row.symbol,
        timestamp: reportDate,
        open: row.open!,
        high: row.high!,
        low: row.low!,
        close: row.close!,
        volume: row.volume ?? 0,
        turnover: row.value ?? 0,
      }));

    if (candles.length > 0) {
      await this.bulkUpsert(candles);
    }

    return {
      date: reportDate.toISOString(),
      sourceUrl,
      imported: candles.length,
      skipped: rows.length - candles.length,
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
