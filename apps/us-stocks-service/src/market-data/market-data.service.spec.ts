import { Test, TestingModule } from '@nestjs/testing';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { MarketDataService } from './market-data.service';
import { MarketData } from './market-data.entity';
import { CreateMarketDataDto } from './dto/create-market-data.dto';
import { ExcludedSymbolService } from '../excluded-symbol/excluded-symbol.service';

const candle: CreateMarketDataDto = {
  symbol: 'AAPL',
  timestamp: new Date('2026-08-04T00:00:00.000Z'),
  open: 225.5,
  high: 229.15,
  low: 224.3,
  close: 228.75,
  volume: 48250000,
  turnover: 11035000000,
};

const MASSIVE_CONFIG: Record<string, string> = {
  MASSIVE_BASE_URL: 'https://api.massive.test',
  MASSIVE_API_KEY: 'test-key',
};

// One grouped daily bar as Massive returns it.
const bar = {
  T: 'AAPL',
  o: 225.5,
  h: 229.15,
  l: 224.3,
  c: 228.75,
  v: 48250000,
  t: 1755748800000,
};

function uniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    code: '23505',
  } as unknown as Error);
}

describe('MarketDataService', () => {
  let service: MarketDataService;
  // Typed as plain mocks rather than `jest.Mocked<Repository<…>>` so an
  // assertion can name one without passing an unbound method around, the same
  // reason the query builder below is a `Record<string, jest.Mock>`.
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let queryBuilder: Record<string, jest.Mock>;
  let entityManager: { upsert: jest.Mock };
  let transaction: jest.Mock;
  let fetchMock: jest.Mock;
  let excludedSymbolService: {
    findAllSymbols: jest.Mock;
    isExcluded: jest.Mock;
  };

  // The excluded list is empty unless a test says otherwise, so every existing
  // expectation reads as it did before the list existed.
  const exclude = (...symbols: string[]): void => {
    excludedSymbolService.findAllSymbols.mockResolvedValue(new Set(symbols));
    excludedSymbolService.isExcluded.mockImplementation((symbol: string) =>
      Promise.resolve(symbols.includes(symbol.trim().toUpperCase())),
    );
  };

  beforeEach(async () => {
    queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    fetchMock = jest.fn();
    global.fetch = fetchMock;

    excludedSymbolService = {
      findAllSymbols: jest.fn().mockResolvedValue(new Set<string>()),
      isExcluded: jest.fn().mockResolvedValue(false),
    };

    entityManager = { upsert: jest.fn().mockResolvedValue(undefined) };
    transaction = jest.fn((run: (manager: unknown) => Promise<unknown>) =>
      run(entityManager),
    );

    repository = {
      create: jest.fn((dto: CreateMarketDataDto) => dto as MarketData),
      save: jest.fn(),
      findOneBy: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
      manager: { transaction },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataService,
        {
          provide: getRepositoryToken(MarketData),
          useValue: repository,
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => MASSIVE_CONFIG[key]),
          },
        },
        {
          provide: ExcludedSymbolService,
          useValue: excludedSymbolService,
        },
      ],
    }).compile();

    service = module.get(MarketDataService);
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

    it('rejects an excluded symbol', async () => {
      exclude('AAPL');

      await expect(service.create(candle)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects an excluded symbol whatever case it is sent in', async () => {
      exclude('AAPL');

      await expect(
        service.create({ ...candle, symbol: 'aapl' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('applies only the filters that were supplied', async () => {
      await service.findAll({ symbol: 'AAPL' });

      expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'marketData.symbol = :symbol',
        { symbol: 'AAPL' },
      );
    });

    it('filters by the full symbol and date range when given', async () => {
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-31T00:00:00.000Z');

      await service.findAll({ symbol: 'AAPL', from, to });

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
      const duplicated = [candle, { ...candle }];

      await expect(service.bulkUpsert(duplicated)).rejects.toBeInstanceOf(
        BadRequestException,
      );
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

    it('rejects a batch naming an excluded symbol', async () => {
      exclude('MSFT');

      await expect(
        service.bulkUpsert([candle, { ...candle, symbol: 'MSFT' }]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(entityManager.upsert).not.toHaveBeenCalled();
    });

    it('names the excluded symbol in the error', async () => {
      exclude('MSFT');

      await expect(
        service.bulkUpsert([{ ...candle, symbol: 'MSFT' }]),
      ).rejects.toThrow('MSFT');
    });
  });

  describe('importEod', () => {
    const respondWith = (results: unknown): void => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results }),
      });
    };

    const upsertedCandles = (): CreateMarketDataDto[] =>
      (entityManager.upsert.mock.calls as unknown[][]).flatMap(
        (call) => call[1] as CreateMarketDataDto[],
      );

    it('maps an upstream bar onto a candle', async () => {
      respondWith([bar]);

      await service.importEod('2026-08-21');

      expect(upsertedCandles()).toEqual([
        {
          symbol: 'AAPL',
          timestamp: new Date(1755748800000),
          open: 225.5,
          high: 229.15,
          low: 224.3,
          close: 228.75,
          volume: 48250000,
          turnover: 0,
        },
      ]);
    });

    it('requests the grouped bars for the given date with the api key', async () => {
      respondWith([]);

      await service.importEod('2026-08-21');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.massive.test/v2/aggs/grouped/locale/us/market/stocks/2026-08-21?adjusted=true&apiKey=test-key',
      );
    });

    it('keeps the api key out of the reported source url', async () => {
      respondWith([]);

      const result = await service.importEod('2026-08-21');

      expect(result.sourceUrl).not.toContain('test-key');
      expect(result.sourceUrl).toBe(
        'https://api.massive.test/v2/aggs/grouped/locale/us/market/stocks/2026-08-21?adjusted=true',
      );
    });

    it('defaults to the current date', async () => {
      respondWith([]);

      const result = await service.importEod();

      expect(result.date).toBe(new Date().toISOString().slice(0, 10));
    });

    it('rejects a malformed date before calling upstream', async () => {
      await expect(service.importEod('21-08-2026')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rounds prices to the four decimals the column stores', async () => {
      respondWith([{ ...bar, o: 0.123456, c: 1.00004 }]);

      await service.importEod('2026-08-21');

      expect(upsertedCandles()[0]).toMatchObject({ open: 0.1235, close: 1.0 });
    });

    it('skips bars that cannot be stored and reports the count', async () => {
      respondWith([
        bar,
        { ...bar, T: 'NOPRICE', o: null },
        { ...bar, T: 'ZERO', l: 0 },
        { ...bar, T: 'HUGE', h: 1e9 },
        { ...bar, T: 'A'.repeat(21) },
        { ...bar, T: 'NOTIME', t: undefined },
      ]);

      const result = await service.importEod('2026-08-21');

      expect(result).toMatchObject({ imported: 1, skipped: 5 });
      expect(upsertedCandles().map((c) => c.symbol)).toEqual(['AAPL']);
    });

    it('does not touch the database when nothing is importable', async () => {
      respondWith([]);

      await expect(service.importEod('2026-08-21')).resolves.toMatchObject({
        imported: 0,
        skipped: 0,
      });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('reports an unreachable upstream as a bad gateway', async () => {
      fetchMock.mockRejectedValue(new Error('connection refused'));

      await expect(service.importEod('2026-08-21')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('reports an upstream error status as a bad gateway', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403, json: jest.fn() });

      await expect(service.importEod('2026-08-21')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('reports a missing report as not found', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404, json: jest.fn() });

      await expect(service.importEod('2026-08-21')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a payload without a results array', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ERROR' }),
      });

      await expect(service.importEod('2026-08-21')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('drops an excluded symbol and counts it apart from skipped', async () => {
      exclude('ZVZZT');
      respondWith([bar, { ...bar, T: 'ZVZZT' }]);

      await expect(service.importEod('2026-08-21')).resolves.toMatchObject({
        imported: 1,
        excluded: 1,
        skipped: 0,
      });
      expect(upsertedCandles().map((c) => c.symbol)).toEqual(['AAPL']);
    });

    it('counts an unusable bar as skipped, not excluded', async () => {
      respondWith([bar, { ...bar, T: 'BADD', c: -1 }]);

      await expect(service.importEod('2026-08-21')).resolves.toMatchObject({
        imported: 1,
        excluded: 0,
        skipped: 1,
      });
    });

    // An excluded symbol is dropped for that reason whatever else is wrong
    // with the bar, so the two counts never depend on which check runs first.
    it('counts an excluded symbol as excluded even when its bar is unusable', async () => {
      exclude('ZVZZT');
      respondWith([{ ...bar, T: 'ZVZZT', c: -1 }]);

      await expect(service.importEod('2026-08-21')).resolves.toMatchObject({
        imported: 0,
        excluded: 1,
        skipped: 0,
      });
    });

    it('matches an excluded symbol case-insensitively', async () => {
      exclude('ZVZZT');
      respondWith([{ ...bar, T: 'zvzzt' }]);

      await expect(service.importEod('2026-08-21')).resolves.toMatchObject({
        excluded: 1,
      });
    });

    // The list runs to five figures, so reading it per bar -- or a second time
    // for the upsert -- is the one way this filter could cost anything.
    it('reads the exclusion list once per import', async () => {
      exclude('ZVZZT');
      respondWith([bar, { ...bar, T: 'MSFT' }, { ...bar, T: 'ZVZZT' }]);

      await service.importEod('2026-08-21');

      expect(excludedSymbolService.findAllSymbols).toHaveBeenCalledTimes(1);
    });

    it('still upserts when nothing is excluded', async () => {
      respondWith([bar]);

      await expect(service.importEod('2026-08-21')).resolves.toMatchObject({
        imported: 1,
        excluded: 0,
      });
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
        service.update('1', { close: 230.1 }),
      ).resolves.toMatchObject({ id: '1', close: 230.1, open: 225.5 });
    });

    it('rejects a patch that names an excluded symbol', async () => {
      exclude('ZVZZT');

      await expect(
        service.update('1', { symbol: 'ZVZZT' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    // A candle stored before its symbol was excluded is still editable: the
    // exclusion governs what is written, not what is already there.
    it('allows a patch that does not name a symbol', async () => {
      exclude('AAPL');
      const stored = { id: '1', ...candle } as MarketData;
      repository.findOneBy.mockResolvedValue(stored);
      repository.save.mockImplementation((entity) =>
        Promise.resolve(entity as MarketData),
      );

      await expect(
        service.update('1', { close: 230.1 }),
      ).resolves.toMatchObject({ close: 230.1 });
    });

    // `PartialType` marks every field `@IsOptional()`, which class-validator
    // honours for an explicit `null` -- so a null symbol reaches the service
    // typed as a string. The exclusion check must not be what crashes on it.
    it('does not crash on a patch whose symbol is null', async () => {
      exclude('ZVZZT');
      const stored = { id: '1', ...candle } as MarketData;
      repository.findOneBy.mockResolvedValue(stored);
      repository.save.mockImplementation((entity) =>
        Promise.resolve(entity as MarketData),
      );

      await expect(
        service.update('1', { symbol: null as unknown as string }),
      ).resolves.toBeDefined();
      expect(excludedSymbolService.isExcluded).not.toHaveBeenCalled();
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
