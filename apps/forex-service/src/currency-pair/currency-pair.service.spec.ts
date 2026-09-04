import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { CurrencyPairService } from './currency-pair.service';
import { CurrencyPair } from './currency-pair.entity';
import { CreateCurrencyPairDto } from './dto/create-currency-pair.dto';

const eurusd: CreateCurrencyPairDto = {
  baseCurrencyCode: 'EUR',
  quoteCurrencyCode: 'USD',
};

// XAU is ISO 4217 too -- one troy ounce of gold -- so a metal pair is an
// ordinary row here rather than a special case.
const xauusd: CreateCurrencyPairDto = {
  baseCurrencyCode: 'XAU',
  quoteCurrencyCode: 'USD',
};

function stored(dto: CreateCurrencyPairDto) {
  return {
    symbol: `${dto.baseCurrencyCode}${dto.quoteCurrencyCode}`,
    ...dto,
    createdAt: new Date('2026-09-04T00:00:00.000Z'),
    updatedAt: new Date('2026-09-04T00:00:00.000Z'),
  };
}

function driverError(code: string): QueryFailedError {
  return new QueryFailedError('INSERT', [], { code } as unknown as Error);
}

describe('CurrencyPairService', () => {
  let service: CurrencyPairService;
  let repository: Record<string, jest.Mock>;
  let queryBuilder: Record<string, jest.Mock>;

  beforeEach(async () => {
    queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    repository = {
      insert: jest.fn(),
      upsert: jest.fn(),
      findOneBy: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyPairService,
        { provide: getRepositoryToken(CurrencyPair), useValue: repository },
      ],
    }).compile();

    service = module.get(CurrencyPairService);
  });

  describe('create', () => {
    it('derives the symbol from the two codes', async () => {
      repository.findOneBy.mockResolvedValue(stored(eurusd));

      await expect(service.create(eurusd)).resolves.toEqual(stored(eurusd));
      expect(repository.insert).toHaveBeenCalledWith({
        symbol: 'EURUSD',
        baseCurrencyCode: 'EUR',
        quoteCurrencyCode: 'USD',
      });
    });

    it('rejects a pair of a currency against itself', async () => {
      await expect(
        service.create({ baseCurrencyCode: 'USD', quoteCurrencyCode: 'USD' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.insert).not.toHaveBeenCalled();
    });

    // `save` would issue an UPDATE for a primary key that already exists, so a
    // create has to go through `insert` to surface the conflict at all.
    it('conflicts on a pair that already exists', async () => {
      repository.insert.mockRejectedValue(driverError('23505'));

      await expect(service.create(eurusd)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    // The currency table is the only thing that knows whether EUR exists, and
    // asking it first would be a second round trip for a case the foreign key
    // already covers.
    it('reports an unknown currency as caller error', async () => {
      repository.insert.mockRejectedValue(driverError('23503'));

      await expect(service.create(eurusd)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rethrows an error that is not a constraint violation', async () => {
      const failure = new Error('connection lost');
      repository.insert.mockRejectedValue(failure);

      await expect(service.create(eurusd)).rejects.toBe(failure);
    });
  });

  describe('findAll', () => {
    it('filters by base and quote independently', async () => {
      await service.findAll({ baseCurrencyCode: 'EUR' });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'currencyPair.baseCurrencyCode = :baseCurrencyCode',
        { baseCurrencyCode: 'EUR' },
      );

      queryBuilder.andWhere.mockClear();

      await service.findAll({ quoteCurrencyCode: 'USD' });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'currencyPair.quoteCurrencyCode = :quoteCurrencyCode',
        { quoteCurrencyCode: 'USD' },
      );
    });

    it('applies no filter when the query is empty', async () => {
      await service.findAll({});
      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws when the pair is not registered', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('EURUSD')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('throws when nothing was deleted', async () => {
      repository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('EURUSD')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('bulkUpsert', () => {
    it('upserts every pair with its derived symbol', async () => {
      await expect(service.bulkUpsert([eurusd, xauusd])).resolves.toEqual({
        upserted: 2,
      });
      expect(repository.upsert).toHaveBeenCalledWith(
        [
          {
            symbol: 'EURUSD',
            baseCurrencyCode: 'EUR',
            quoteCurrencyCode: 'USD',
          },
          {
            symbol: 'XAUUSD',
            baseCurrencyCode: 'XAU',
            quoteCurrencyCode: 'USD',
          },
        ],
        { conflictPaths: ['symbol'], skipUpdateIfNoValuesChanged: true },
      );
    });

    // Postgres refuses an ON CONFLICT statement that touches the same row
    // twice, so this has to be caught before the query rather than after it.
    it('rejects the same pair twice in one request', async () => {
      await expect(service.bulkUpsert([eurusd, eurusd])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('rejects a self-pair anywhere in the batch', async () => {
      await expect(
        service.bulkUpsert([
          eurusd,
          { baseCurrencyCode: 'USD', quoteCurrencyCode: 'USD' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('reports an unknown currency as caller error', async () => {
      repository.upsert.mockRejectedValue(driverError('23503'));

      await expect(service.bulkUpsert([eurusd])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
