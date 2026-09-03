# forex-service

NestJS service exposing CRUD over foreign exchange market data (OHLC candles),
backed by Postgres via TypeORM.

## Setup

```bash
pnpm install
cp .env.example .env   # then set DATABASE_URL
pnpm migration:run     # creates the market_data table and its indexes
```

`DATABASE_URL` is required. SSL is enabled automatically when the URL carries
`sslmode=require`. `PORT` defaults to `3004`.

## Run

```bash
pnpm dev          # watch mode
pnpm start:prod   # after pnpm build
```

Swagger UI is served at `http://localhost:3004/docs`.

## API

All routes live under `/market-data`.

| Method   | Path                       | Description                        |
| -------- | -------------------------- | ---------------------------------- |
| `POST`   | `/market-data`             | Create a candle                    |
| `POST`   | `/market-data/bulk-upsert` | Insert or update many candles      |
| `GET`    | `/market-data`             | List candles (filtered, paginated) |
| `GET`    | `/market-data/:id`         | Fetch a candle by id               |
| `PATCH`  | `/market-data/:id`         | Partially update a candle          |
| `DELETE` | `/market-data/:id`         | Delete a candle                    |

List query parameters: `symbol`, `from`, `to` (ISO timestamps), `limit`
(1–1000, default 100) and `offset` (default 0). Results are ordered by
`timestamp` ascending.

A candle is `{ symbol, timestamp, open, high, low, close, volume, turnover }`,
with `symbol` a pair such as `EURUSD`. `(symbol, timestamp)` is unique —
creating or updating into a duplicate pair returns `409 Conflict`; an unknown id
returns `404 Not Found`.

There is no EOD import route. Spot forex has no single end-of-day publication to
pull from the way `ph-stocks-service` scrapes the PSE report; candles arrive
through `bulk-upsert` from whichever feed you point at it.

### Precision

| Field                       | Column          | Notes                                 |
| --------------------------- | --------------- | ------------------------------------- |
| `open` `high` `low` `close` | `numeric(18,6)` | 6 decimals — pipette precision        |
| `volume`                    | `numeric(24,8)` | Nullable; tick count or lots          |
| `turnover`                  | `numeric(24,6)` | Nullable; quote-currency value traded |

Six decimals is the fractional-pip precision forex is quoted at, and twelve
integer digits leave room for a pair quoted against a hyperinflated currency —
far past the ~157 of USDJPY.

`volume` and `turnover` are **optional and nullable**. Spot forex trades over the
counter with no central tape, so a candle has no authoritative volume and no
market-wide traded value. Feeds that report a tick count or lots fill `volume`;
omitting either field stores `null` rather than a misleading `0`.

Values are validated against these scales at the edge, so anything Postgres
would silently round is rejected with `400`. The check uses a local
`@MaxDecimalPlaces` rather than class-validator's
`@IsNumber({ maxDecimalPlaces })`, which throws a `TypeError` on exponential
values such as `1e-7` — turning a bad request into a `500` — and undercounts
ones such as `1.234e-13`.

### Bulk upsert

`POST /market-data/bulk-upsert` takes `{ "candles": [ ... ] }` and returns
`{ "upserted": n }`. Each candle is matched on `(symbol, timestamp)`: new pairs
are inserted, existing ones updated. Re-sending an identical batch is a no-op,
so an ingest job can safely retry.

The batch runs in a single transaction and is split into chunks of 1000 to stay
under the Postgres 65535 bound-parameter ceiling, so a partial failure leaves no
half-ingested range behind. The JSON body limit is raised to 25mb in `main.ts`;
the Express default of 100kb would cap a batch at roughly 680 candles.

Repeating the same `(symbol, timestamp)` twice inside one request is rejected
with `400` — Postgres cannot apply two `ON CONFLICT` updates to one row, so the
duplicate is caller error rather than a conflict to resolve.

Note that an upsert replaces the whole row: sending a candle without `volume`
over an existing one that had a volume clears it to `null`.

## Migrations

```bash
pnpm migration:generate src/migrations/YourChange
pnpm migration:run
pnpm migration:show
pnpm migration:revert
```
