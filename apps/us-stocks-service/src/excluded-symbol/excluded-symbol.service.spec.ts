import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { ExcludedSymbolService } from './excluded-symbol.service';
import { ExcludedSymbol } from './excluded-symbol.entity';

function uniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    code: '23505',
  } as unknown as Error);
}

describe('ExcludedSymbolService', () => {
  let service: ExcludedSymbolService;
  // Typed as plain mocks rather than `jest.Mocked<Repository<…>>` so an
  // assertion can name one without passing an unbound method around, the same
  // reason the query builder below is a `Record<string, jest.Mock>`.
  let repository: {
    insert: jest.Mock;
    find: jest.Mock;
    findOneBy: jest.Mock;
    existsBy: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let queryBuilder: Record<string, jest.Mock>;
  let entityManager: { upsert: jest.Mock };
  let transaction: jest.Mock;

  const upsertedRows = (): ExcludedSymbol[] =>
    (entityManager.upsert.mock.calls as unknown[][]).flatMap(
      (call) => call[1] as ExcludedSymbol[],
    );

  beforeEach(async () => {
    queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    entityManager = { upsert: jest.fn().mockResolvedValue(undefined) };
    transaction = jest.fn((run: (manager: unknown) => Promise<unknown>) =>
      run(entityManager),
    );

    repository = {
      insert: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn(),
      existsBy: jest.fn().mockResolvedValue(false),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
      manager: { transaction },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExcludedSymbolService,
        {
          provide: getRepositoryToken(ExcludedSymbol),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get(ExcludedSymbolService);
  });

  describe('create', () => {
    it('returns the stored row', async () => {
      const stored = {
        symbol: 'ZVZZT',
        reason: 'test ticker',
      } as ExcludedSymbol;
      repository.findOneBy.mockResolvedValue(stored);

      await expect(
        service.create({ symbol: 'ZVZZT', reason: 'test ticker' }),
      ).resolves.toBe(stored);
    });

    // `reason` is optional on the DTO but not on the row: an upsert builds its
    // column list from the first row it is given.
    it('stores an explicit null when no reason is given', async () => {
      repository.findOneBy.mockResolvedValue({});

      await service.create({ symbol: 'ZVZZT' });

      expect(repository.insert).toHaveBeenCalledWith({
        symbol: 'ZVZZT',
        reason: null,
      });
    });

    it('translates a unique violation into a conflict', async () => {
      repository.insert.mockRejectedValue(uniqueViolation());

      await expect(service.create({ symbol: 'ZVZZT' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows unrelated database errors', async () => {
      const error = new Error('connection lost');
      repository.insert.mockRejectedValue(error);

      await expect(service.create({ symbol: 'ZVZZT' })).rejects.toBe(error);
    });
  });

  describe('findAll', () => {
    it('filters by symbol when one is given', async () => {
      await service.findAll({ symbol: 'ZVZZT' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'excludedSymbol.symbol = :symbol',
        { symbol: 'ZVZZT' },
      );
    });

    it('applies the default page size', async () => {
      await service.findAll({});

      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
      expect(queryBuilder.take).toHaveBeenCalledWith(100);
      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    });
  });

  describe('findOne', () => {
    it('throws when the symbol is not excluded', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('ZVZZT')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('throws when the symbol is not excluded', async () => {
      repository.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.remove('ZVZZT')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      repository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.remove('ZVZZT')).resolves.toBeUndefined();
    });
  });

  describe('findAllSymbols', () => {
    it('reads the key column alone', async () => {
      await service.findAllSymbols();

      expect(repository.find).toHaveBeenCalledWith({
        select: { symbol: true },
      });
    });

    it('returns the symbols as a set', async () => {
      repository.find.mockResolvedValue([
        { symbol: 'ZVZZT' },
        { symbol: 'ZXYZ.A' },
      ] as ExcludedSymbol[]);

      await expect(service.findAllSymbols()).resolves.toEqual(
        new Set(['ZVZZT', 'ZXYZ.A']),
      );
    });
  });

  describe('isExcluded', () => {
    it('looks the symbol up by key rather than reading the list', async () => {
      await service.isExcluded('ZVZZT');

      expect(repository.existsBy).toHaveBeenCalledWith({ symbol: 'ZVZZT' });
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('normalizes the symbol before looking it up', async () => {
      await service.isExcluded('  zvzzt ');

      expect(repository.existsBy).toHaveBeenCalledWith({ symbol: 'ZVZZT' });
    });
  });

  describe('bulkUpsert', () => {
    it('upserts every row in one transaction', async () => {
      await expect(
        service.bulkUpsert([{ symbol: 'ZVZZT' }, { symbol: 'ZXYZ.A' }]),
      ).resolves.toEqual({ upserted: 2 });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(upsertedRows()).toEqual([
        { symbol: 'ZVZZT', reason: null },
        { symbol: 'ZXYZ.A', reason: null },
      ]);
    });

    it('rejects a symbol repeated within one request', async () => {
      await expect(
        service.bulkUpsert([{ symbol: 'ZVZZT' }, { symbol: 'ZVZZT' }]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
      expect(entityManager.upsert).not.toHaveBeenCalled();
    });

    // A whole exclusion list arrives in one request, so the batch has to be
    // split to stay inside the Postgres bound-parameter ceiling.
    it('splits a large batch into chunks of 1000', async () => {
      const rows = Array.from({ length: 2500 }, (_, i) => ({
        symbol: `SYM${i}`,
      }));

      await expect(service.bulkUpsert(rows)).resolves.toEqual({
        upserted: 2500,
      });

      expect(entityManager.upsert).toHaveBeenCalledTimes(3);
      expect(upsertedRows()).toHaveLength(2500);
    });
  });
});
