import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Currency } from './currency.entity';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import {
  DEFAULT_CURRENCY_LIMIT,
  QueryCurrencyDto,
} from './dto/query-currency.dto';

const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface BulkUpsertResult {
  upserted: number;
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

// `%` and `_` are wildcards to LIKE, so a search for "US_" would otherwise
// match "USD" -- escape them, along with the escape character itself, so the
// term is matched literally.
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// Postgres rejects an ON CONFLICT statement that would touch the same row
// twice, so a repeated code within one request is caller error rather than a
// conflict to resolve -- reject it by name instead of silently dropping one.
function assertNoDuplicateCodes(currencies: CreateCurrencyDto[]): void {
  const seen = new Set<string>();
  for (const currency of currencies) {
    if (seen.has(currency.code)) {
      throw new BadRequestException(
        `Duplicate currency "${currency.code}" in the same request`,
      );
    }
    seen.add(currency.code);
  }
}

@Injectable()
export class CurrencyService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
  ) {}

  // `insert` rather than `save`: with a natural primary key, `save` on an
  // existing code issues an UPDATE, so a create would quietly overwrite a
  // currency instead of reporting the conflict. A plain INSERT raises 23505.
  async create(dto: CreateCurrencyDto): Promise<Currency> {
    try {
      await this.currencyRepository.insert(dto);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Currency "${dto.code}" already exists`);
      }
      throw error;
    }
    return this.findOne(dto.code);
  }

  findAll(query: QueryCurrencyDto): Promise<Currency[]> {
    const qb = this.currencyRepository.createQueryBuilder('currency');

    if (query.code) {
      qb.andWhere('currency.code = :code', { code: query.code });
    }
    if (query.search) {
      qb.andWhere("currency.name ILIKE :search ESCAPE '\\'", {
        search: `%${escapeLikeTerm(query.search)}%`,
      });
    }

    return qb
      .orderBy('currency.code', 'ASC')
      .take(query.limit ?? DEFAULT_CURRENCY_LIMIT)
      .skip(query.offset ?? 0)
      .getMany();
  }

  async findOne(code: string): Promise<Currency> {
    const currency = await this.currencyRepository.findOneBy({ code });
    if (!currency) {
      throw new NotFoundException(`Currency "${code}" not found`);
    }
    return currency;
  }

  // The DTO omits `code`, so an update can never collide with another row --
  // no conflict handling is needed here, unlike `create`.
  async update(code: string, dto: UpdateCurrencyDto): Promise<Currency> {
    const currency = await this.findOne(code);
    Object.assign(currency, dto);
    return this.currencyRepository.save(currency);
  }

  async remove(code: string): Promise<void> {
    const result = await this.currencyRepository.delete(code);
    if (result.affected === 0) {
      throw new NotFoundException(`Currency "${code}" not found`);
    }
  }

  async bulkUpsert(currencies: CreateCurrencyDto[]): Promise<BulkUpsertResult> {
    assertNoDuplicateCodes(currencies);

    // The DTO caps a batch well inside the Postgres bound-parameter ceiling, so
    // this goes out as one statement -- no chunking, and nothing to wrap in a
    // transaction of its own.
    await this.currencyRepository.upsert(currencies, {
      conflictPaths: ['code'],
      skipUpdateIfNoValuesChanged: true,
    });

    return { upserted: currencies.length };
  }
}
