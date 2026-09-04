import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { CurrencyService } from './currency.service';
import { Currency } from './currency.entity';
import { CreateCurrencyDto } from './dto/create-currency.dto';

const dollar: CreateCurrencyDto = { code: 'USD', name: 'US Dollar' };

// XAU is ISO 4217 too -- one troy ounce of gold -- so metals live in the same
// table as fiat rather than one of their own.
const gold: CreateCurrencyDto = { code: 'XAU', name: 'Gold' };

function stored(dto: CreateCurrencyDto): Currency {
  return {
    ...dto,
    createdAt: new Date('2026-09-04T00:00:00.000Z'),
    updatedAt: new Date('2026-09-04T00:00:00.000Z'),
  };
}

function uniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    code: '23505',
  } as unknown as Error);
}

describe('CurrencyService', () => {
  let service: CurrencyService;
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
      save: jest.fn(),
      upsert: jest.fn(),
      findOneBy: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyService,
        { provide: getRepositoryToken(Currency), useValue: repository },
      ],
    }).compile();

    service = module.get(CurrencyService);
  });

  describe('create', () => {
    it('returns the stored currency', async () => {
      repository.findOneBy.mockResolvedValue(stored(dollar));

      await expect(service.create(dollar)).resolves.toEqual(stored(dollar));
      expect(repository.insert).toHaveBeenCalledWith(dollar);
    });

    // `save` would issue an UPDATE for a primary key that already exists, so a
    // create has to go through `insert` to surface the conflict at all.
    it('inserts rather than saving, so an existing code conflicts', async () => {
      repository.insert.mockRejectedValue(uniqueViolation());

      await expect(service.create(dollar)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rethrows an error that is not a unique violation', async () => {
      const failure = new Error('connection lost');
      repository.insert.mockRejectedValue(failure);

      await expect(service.create(dollar)).rejects.toBe(failure);
    });
  });

  describe('findAll', () => {
    it('defaults to a page that holds the whole ISO 4217 list', async () => {
      await service.findAll({});

      expect(queryBuilder.take).toHaveBeenCalledWith(500);
      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('currency.code', 'ASC');
      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('filters by exact code', async () => {
      await service.findAll({ code: 'USD' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'currency.code = :code',
        { code: 'USD' },
      );
    });

    it('matches a search term as a case-insensitive substring', async () => {
      await service.findAll({ search: 'dollar' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        { search: '%dollar%' },
      );
    });

    // Unescaped, "US_" would match USD through the LIKE wildcard.
    it('escapes LIKE wildcards in a search term', async () => {
      await service.findAll({ search: 'US_ 100%' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.any(String), {
        search: '%US\\_ 100\\%%',
      });
    });
  });

  describe('findOne', () => {
    it('returns the currency', async () => {
      repository.findOneBy.mockResolvedValue(stored(gold));

      await expect(service.findOne('XAU')).resolves.toEqual(stored(gold));
    });

    it('throws when the code is unknown', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('ZZZ')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('saves the merged currency', async () => {
      repository.findOneBy.mockResolvedValue(stored(gold));
      repository.save.mockImplementation((currency: Currency) =>
        Promise.resolve(currency),
      );

      await expect(
        service.update('XAU', { name: 'Gold (troy ounce)' }),
      ).resolves.toMatchObject({ code: 'XAU', name: 'Gold (troy ounce)' });
    });

    it('throws when the code is unknown', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(
        service.update('ZZZ', { name: 'Nothing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws when nothing was deleted', async () => {
      repository.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.remove('ZZZ')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      repository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.remove('USD')).resolves.toBeUndefined();
    });
  });

  describe('bulkUpsert', () => {
    it('upserts on code and reports the count', async () => {
      await expect(service.bulkUpsert([dollar, gold])).resolves.toEqual({
        upserted: 2,
      });
      expect(repository.upsert).toHaveBeenCalledWith([dollar, gold], {
        conflictPaths: ['code'],
        skipUpdateIfNoValuesChanged: true,
      });
    });

    // Postgres cannot apply two ON CONFLICT updates to one row, so a repeat
    // within a batch is caller error rather than a conflict to resolve.
    it('rejects a code repeated within one request', async () => {
      await expect(
        service.bulkUpsert([dollar, { code: 'USD', name: 'Dollar' }]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.upsert).not.toHaveBeenCalled();
    });
  });
});
