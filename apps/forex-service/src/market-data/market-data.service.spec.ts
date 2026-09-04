import { Test, TestingModule } from '@nestjs/testing';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { MarketDataService } from './market-data.service';
import { MarketData } from './market-data.entity';
import { CurrencyPairService } from '../currency-pair/currency-pair.service';
import { CreateMarketDataDto } from './dto/create-market-data.dto';

const candle: CreateMarketDataDto = {
  symbol: 'EURUSD',
  timestamp: new Date('2026-08-04T00:00:00.000Z'),
  open: 1.085421,
  high: 1.089734,
  low: 1.083012,
  close: 1.088256,
  volume: 48213,
  turnover: 5240100.25,
};

// What most spot forex feeds actually deliver: OHLC and nothing else.
const bareCandle: CreateMarketDataDto = {
  symbol: 'EURUSD',
  timestamp: new Date('2026-08-04T00:00:00.000Z'),
  open: 1.085421,
  high: 1.089734,
  low: 1.083012,
  close: 1.088256,
};

const MASSIVE_CONFIG: Record<string, string> = {
  MASSIVE_BASE_URL: 'https://api.massive.test',
  MASSIVE_API_KEY: 'test-key',
};

// One grouped daily bar as Massive returns it. `t` is the close of the daily
// window, and `v` a tick count -- how the forex feed stamps these bars.
const bar = {
  T: 'C:EURUSD',
  o: 1.085421,
  h: 1.089734,
  l: 1.083012,
  c: 1.088256,
  v: 277454,
  vw: 1.0867,
  t: 1788393599999,
  n: 277454,
};

const TRADING_DAY = new Date('2026-09-02T00:00:00.000Z');

// What `currency_pair` holds for these tests. Every symbol the import fixtures
// use is registered, so a bar the import drops is dropped for the reason the
// test is about rather than for being unregistered by accident.
const REGISTERED_SYMBOLS = [
  'EURUSD',
  'AUDNOK',
  'USDJPY',
  'DKKPLN',
  'EURCNH',
  'NOVOL',
  'NEGVOL',
  'HUGEVOL',
  'LBPUSD',
  'NOPRICE',
  'ZERO',
  'HUGE',
  'DUST',
  'NOTIME',
];

function violation(code: string): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    code,
  } as unknown as Error);
}

function uniqueViolation(): QueryFailedError {
  return violation('23505');
}

// What Postgres raises when a candle names a pair `currency_pair` does not
// list.
function foreignKeyViolation(): QueryFailedError {
  return violation('23503');
}

describe('MarketDataService', () => {
  let service: MarketDataService;
  let repository: jest.Mocked<Repository<MarketData>>;
  let queryBuilder: Record<string, jest.Mock>;
  let entityManager: { upsert: jest.Mock };
  let transaction: jest.Mock;
  let fetchMock: jest.Mock;
  let findAllSymbols: jest.Mock;

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

    findAllSymbols = jest.fn().mockResolvedValue(new Set(REGISTERED_SYMBOLS));

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
        {
          provide: CurrencyPairService,
          useValue: { findAllSymbols },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => MASSIVE_CONFIG[key]),
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

    it('stores an omitted volume and turnover as null, not zero', async () => {
      repository.save.mockImplementation((entity) =>
        Promise.resolve(entity as MarketData),
      );

      await expect(service.create(bareCandle)).resolves.toMatchObject({
        volume: null,
        turnover: null,
      });
    });

    it('translates a unique violation into a conflict', async () => {
      repository.save.mockRejectedValue(uniqueViolation());

      await expect(service.create(candle)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('translates an unregistered pair into a bad request', async () => {
      repository.save.mockRejectedValue(foreignKeyViolation());

      await expect(service.create(candle)).rejects.toBeInstanceOf(
        BadRequestException,
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
      await service.findAll({ symbol: 'EURUSD' });

      expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'marketData.symbol = :symbol',
        { symbol: 'EURUSD' },
      );
    });

    it('filters by the full symbol and date range when given', async () => {
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-31T00:00:00.000Z');

      await service.findAll({ symbol: 'EURUSD', from, to });

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

    // A mixed batch would otherwise bind different columns per row, so the
    // gaps are filled before the rows reach the upsert.
    it('fills a missing volume and turnover so every row binds the same columns', async () => {
      await service.bulkUpsert([bareCandle, { ...candle, symbol: 'GBPUSD' }]);

      expect(upsertedChunks()[0]).toEqual([
        { ...bareCandle, volume: null, turnover: null },
        { ...candle, symbol: 'GBPUSD' },
      ]);
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

    it('translates an unregistered pair into a bad request', async () => {
      transaction.mockRejectedValue(foreignKeyViolation());

      await expect(service.bulkUpsert([candle])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rethrows unrelated database errors', async () => {
      const error = new Error('connection lost');
      transaction.mockRejectedValue(error);

      await expect(service.bulkUpsert([candle])).rejects.toBe(error);
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

      await service.importEod('2026-09-02');

      expect(upsertedCandles()).toEqual([
        {
          symbol: 'EURUSD',
          timestamp: TRADING_DAY,
          open: 1.085421,
          high: 1.089734,
          low: 1.083012,
          close: 1.088256,
          volume: 277454,
          turnover: null,
        },
      ]);
    });

    it('drops the C: prefix from the symbol', async () => {
      respondWith([bar, { ...bar, T: 'C:AUDNOK' }, { ...bar, T: 'C:USDJPY' }]);

      await service.importEod('2026-09-02');

      expect(upsertedCandles().map((c) => c.symbol)).toEqual([
        'EURUSD',
        'AUDNOK',
        'USDJPY',
      ]);
    });

    it('imports every pair, not just the USD ones', async () => {
      respondWith([bar, { ...bar, T: 'C:DKKPLN' }, { ...bar, T: 'C:EURCNH' }]);

      await expect(service.importEod('2026-09-02')).resolves.toMatchObject({
        imported: 3,
        skipped: 0,
      });
    });

    it('floors the end-of-window timestamp to the day it closes', async () => {
      respondWith([bar]);

      await service.importEod('2026-09-02');

      expect(upsertedCandles()[0].timestamp).toEqual(TRADING_DAY);
    });

    it('stores the tick count as volume and leaves turnover null', async () => {
      respondWith([bar]);

      await service.importEod('2026-09-02');

      expect(upsertedCandles()[0]).toMatchObject({
        volume: 277454,
        turnover: null,
      });
    });

    it('keeps the prices of a bar whose volume is unusable', async () => {
      respondWith([
        { ...bar, T: 'C:NOVOL', v: undefined },
        { ...bar, T: 'C:NEGVOL', v: -1 },
        { ...bar, T: 'C:HUGEVOL', v: 1e16 },
      ]);

      const result = await service.importEod('2026-09-02');

      expect(result).toMatchObject({ imported: 3, skipped: 0 });
      expect(upsertedCandles().map((c) => c.volume)).toEqual([
        null,
        null,
        null,
      ]);
    });

    it('keeps the precision of an exotic low-value pair', async () => {
      respondWith([
        { ...bar, T: 'C:LBPUSD', o: 1.115397800259223e-5, c: 1.1154e-5 },
      ]);

      await service.importEod('2026-09-02');

      expect(upsertedCandles()[0]).toMatchObject({
        open: 0.000011,
        close: 0.000011,
      });
    });

    it('rounds to the decimals the columns store', async () => {
      respondWith([{ ...bar, o: 1.0000004, v: 2.000000004 }]);

      await service.importEod('2026-09-02');

      expect(upsertedCandles()[0]).toMatchObject({ open: 1, volume: 2 });
    });

    it('requests the grouped bars for the given date with the api key', async () => {
      respondWith([]);

      await service.importEod('2026-09-02');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.massive.test/v2/aggs/grouped/locale/global/market/fx/2026-09-02?adjusted=true&apiKey=test-key',
      );
    });

    it('keeps the api key out of the reported source url', async () => {
      respondWith([]);

      const result = await service.importEod('2026-09-02');

      expect(result.sourceUrl).not.toContain('test-key');
      expect(result.sourceUrl).toBe(
        'https://api.massive.test/v2/aggs/grouped/locale/global/market/fx/2026-09-02?adjusted=true',
      );
    });

    it('defaults to the current date', async () => {
      respondWith([]);

      const result = await service.importEod();

      expect(result.date).toBe(new Date().toISOString().slice(0, 10));
    });

    it('rejects a malformed date before calling upstream', async () => {
      await expect(service.importEod('02-09-2026')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('imports only the pairs that are registered', async () => {
      findAllSymbols.mockResolvedValue(new Set(['EURUSD', 'USDJPY']));
      respondWith([bar, { ...bar, T: 'C:AUDNOK' }, { ...bar, T: 'C:USDJPY' }]);

      const result = await service.importEod('2026-09-02');

      expect(result).toMatchObject({
        imported: 2,
        skipped: 0,
        unregistered: 1,
      });
      expect(upsertedCandles().map((c) => c.symbol)).toEqual([
        'EURUSD',
        'USDJPY',
      ]);
    });

    // An unregistered pair is not a malformed bar, and the two counts are read
    // for different reasons: one is a pair worth registering, the other a feed
    // problem.
    it('counts an unregistered pair apart from an unusable bar', async () => {
      findAllSymbols.mockResolvedValue(new Set(['EURUSD', 'NOTIME']));
      respondWith([
        bar,
        { ...bar, T: 'C:AUDNOK' },
        { ...bar, T: 'C:DKKPLN' },
        { ...bar, T: 'C:NOTIME', t: undefined },
      ]);

      await expect(service.importEod('2026-09-02')).resolves.toMatchObject({
        imported: 1,
        skipped: 1,
        unregistered: 2,
      });
    });

    it('imports nothing when no pair is registered', async () => {
      findAllSymbols.mockResolvedValue(new Set<string>());
      respondWith([bar, { ...bar, T: 'C:USDJPY' }]);

      await expect(service.importEod('2026-09-02')).resolves.toMatchObject({
        imported: 0,
        skipped: 0,
        unregistered: 2,
      });
      expect(transaction).not.toHaveBeenCalled();
    });

    // One read of the reference table for the whole day, not one per bar.
    it('reads the registered pairs once per import', async () => {
      respondWith([bar, { ...bar, T: 'C:USDJPY' }, { ...bar, T: 'C:AUDNOK' }]);

      await service.importEod('2026-09-02');

      expect(findAllSymbols).toHaveBeenCalledTimes(1);
    });

    it('skips bars that cannot be stored and reports the count', async () => {
      respondWith([
        bar,
        { ...bar, T: 'EURUSD' },
        { ...bar, T: 42 },
        { ...bar, T: 'C:NOPRICE', o: null },
        { ...bar, T: 'C:ZERO', l: 0 },
        { ...bar, T: 'C:HUGE', h: 1e12 },
        { ...bar, T: 'C:DUST', c: 4e-7 },
        { ...bar, T: `C:${'A'.repeat(21)}` },
        { ...bar, T: 'C:NOTIME', t: undefined },
      ]);

      const result = await service.importEod('2026-09-02');

      expect(result).toMatchObject({
        imported: 1,
        skipped: 8,
        unregistered: 0,
      });
      expect(upsertedCandles().map((c) => c.symbol)).toEqual(['EURUSD']);
    });

    it('does not touch the database when nothing is importable', async () => {
      respondWith([]);

      await expect(service.importEod('2026-09-02')).resolves.toMatchObject({
        imported: 0,
        skipped: 0,
      });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('reports an unreachable upstream as a bad gateway', async () => {
      fetchMock.mockRejectedValue(new Error('connection refused'));

      await expect(service.importEod('2026-09-02')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('reports an upstream error status as a bad gateway', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403, json: jest.fn() });

      await expect(service.importEod('2026-09-02')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('reports a missing report as not found', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404, json: jest.fn() });

      await expect(service.importEod('2026-09-02')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a payload without a results array', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ERROR' }),
      });

      await expect(service.importEod('2026-09-02')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
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
        service.update('1', { close: 1.091337 }),
      ).resolves.toMatchObject({
        id: '1',
        close: 1.091337,
        open: 1.085421,
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
