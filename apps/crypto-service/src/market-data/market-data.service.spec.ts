import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { MarketDataService } from './market-data.service';
import { MarketData } from './market-data.entity';
import { CreateMarketDataDto } from './dto/create-market-data.dto';

const candle: CreateMarketDataDto = {
  symbol: 'BTCUSDT',
  timestamp: new Date('2026-08-04T00:00:00.000Z'),
  open: 104523.87,
  high: 105980.12,
  low: 103410.55,
  close: 105204.3,
  volume: 12843.00341,
  turnover: 1348920455.31,
};

function uniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    code: '23505',
  } as unknown as Error);
}

describe('MarketDataService', () => {
  let service: MarketDataService;
  let repository: jest.Mocked<Repository<MarketData>>;
  let queryBuilder: Record<string, jest.Mock>;
  let entityManager: { upsert: jest.Mock };
  let transaction: jest.Mock;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataService,
        {
          provide: getRepositoryToken(MarketData),
          useValue: {
            create: jest.fn((dto: CreateMarketDataDto) => dto as MarketData),
            save: jest.fn(),
            findOneBy: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn(() => queryBuilder),
            manager: { transaction },
          },
        },
      ],
    }).compile();

    service = module.get(MarketDataService);
    repository = module.get(getRepositoryToken(MarketData));
  });

  describe('create', () => {
    it('returns the saved candle', async () => {
      const saved = { id: '1', ...candle } as MarketData;
      repository.save.mockResolvedValue(saved);

      await expect(service.create(candle)).resolves.toEqual(saved);
    });

    it('translates a unique violation into a conflict', async () => {
      repository.save.mockRejectedValue(uniqueViolation());

      await expect(service.create(candle)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows unrelated database errors', async () => {
      const error = new Error('connection lost');
      repository.save.mockRejectedValue(error);

      await expect(service.create(candle)).rejects.toBe(error);
    });
  });

  describe('findAll', () => {
    it('applies only the filters that were supplied', async () => {
      await service.findAll({ symbol: 'BTCUSDT' });

      expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'marketData.symbol = :symbol',
        { symbol: 'BTCUSDT' },
      );
    });

    it('filters by the full symbol and date range when given', async () => {
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-31T00:00:00.000Z');

      await service.findAll({ symbol: 'BTCUSDT', from, to });

      expect(queryBuilder.andWhere).toHaveBeenCalledTimes(3);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'marketData.timestamp >= :from',
        { from },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'marketData.timestamp <= :to',
        { to },
      );
    });

    it('defaults to the first page of 100 rows', async () => {
      await service.findAll({});

      expect(queryBuilder.take).toHaveBeenCalledWith(100);
      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    });

    it('honours an explicit limit and offset', async () => {
      await service.findAll({ limit: 25, offset: 50 });

      expect(queryBuilder.take).toHaveBeenCalledWith(25);
      expect(queryBuilder.skip).toHaveBeenCalledWith(50);
    });
  });

  describe('bulkUpsert', () => {
    // mock.calls is any[][]; narrow it once so the assertions stay type-safe.
    const upsertedChunks = (): CreateMarketDataDto[][] =>
      (entityManager.upsert.mock.calls as unknown[][]).map(
        (call) => call[1] as CreateMarketDataDto[],
      );

    const candlesFor = (count: number): CreateMarketDataDto[] =>
      Array.from({ length: count }, (_, i) => ({
        ...candle,
        symbol: `T${i}`,
      }));

    it('reports how many candles were upserted', async () => {
      await expect(service.bulkUpsert(candlesFor(3))).resolves.toEqual({
        upserted: 3,
      });
    });

    it('upserts on the (symbol, timestamp) key', async () => {
      await service.bulkUpsert(candlesFor(3));

      expect(entityManager.upsert).toHaveBeenCalledWith(
        MarketData,
        expect.any(Array),
        {
          conflictPaths: ['symbol', 'timestamp'],
          skipUpdateIfNoValuesChanged: true,
        },
      );
    });

    it('sends a small batch as a single statement', async () => {
      await service.bulkUpsert(candlesFor(3));

      expect(entityManager.upsert).toHaveBeenCalledTimes(1);
    });

    it('splits a large batch to stay inside the parameter ceiling', async () => {
      await service.bulkUpsert(candlesFor(2500));

      expect(entityManager.upsert).toHaveBeenCalledTimes(3);
      expect(upsertedChunks().map((chunk) => chunk.length)).toEqual([
        1000, 1000, 500,
      ]);
    });

    it('covers every candle exactly once across chunks', async () => {
      await service.bulkUpsert(candlesFor(2500));

      const symbols = upsertedChunks().flatMap((chunk) =>
        chunk.map((c) => c.symbol),
      );
      expect(new Set(symbols).size).toBe(2500);
    });

    it('runs the whole batch in one transaction', async () => {
      await service.bulkUpsert(candlesFor(2500));

      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects a duplicate key within the same request', async () => {
      await expect(
        service.bulkUpsert([candle, { ...candle }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not touch the database when a duplicate is rejected', async () => {
      await expect(
        service.bulkUpsert([candle, { ...candle }]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
      expect(entityManager.upsert).not.toHaveBeenCalled();
    });

    it('allows the same symbol at different timestamps', async () => {
      await expect(
        service.bulkUpsert([
          candle,
          { ...candle, timestamp: new Date('2026-08-05T00:00:00.000Z') },
        ]),
      ).resolves.toEqual({ upserted: 2 });
    });
  });

  describe('findOne', () => {
    it('throws when the candle does not exist', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('merges the partial update onto the stored candle', async () => {
      const stored = { id: '1', ...candle } as MarketData;
      repository.findOneBy.mockResolvedValue(stored);
      repository.save.mockImplementation((entity) =>
        Promise.resolve(entity as MarketData),
      );

      await expect(
        service.update('1', { close: 105999.5 }),
      ).resolves.toMatchObject({
        id: '1',
        close: 105999.5,
        open: 104523.87,
      });
    });

    it('throws when the candle does not exist', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.update('1', { close: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('throws when nothing was deleted', async () => {
      repository.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.remove('1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      repository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.remove('1')).resolves.toBeUndefined();
    });
  });
});
