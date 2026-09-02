# crypto-service

NestJS service exposing CRUD over cryptocurrency market data (OHLCV candles),
backed by Postgres via TypeORM.

## Setup

```bash
pnpm install
cp .env.example .env   # then set DATABASE_URL
pnpm migration:run     # creates the market_data table and its indexes
```

`DATABASE_URL` is required. SSL is enabled automatically when the URL carries
`sslmode=require`. `PORT` defaults to `3002`.

## Run

```bash
pnpm dev          # watch mode
pnpm start:prod   # after pnpm build
```

Swagger UI is served at `http://localhost:3002/docs`.

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

A candle is `{ symbol, timestamp, open, high, low, close, volume, turnover }`.
`(symbol, timestamp)` is unique — creating or updating into a duplicate pair
returns `409 Conflict`; an unknown id returns `404 Not Found`.

### Precision

Crypto spans a far wider price range than equities, so the columns are scaled
for it rather than copied from the stock services:

| Field                     | Column           | Notes                                            |
| ------------------------- | ---------------- | ------------------------------------------------ |
| `open` `high` `low` `close` | `numeric(24,12)` | 12 decimals — covers long-tail and alt/BTC pairs |
| `volume`                  | `numeric(30,12)` | Base-asset units, fractional (e.g. `0.00341` BTC) |
| `turnover`                | `numeric(24,8)`  | Quote-currency value traded                       |

Eight decimals (satoshi precision) would be enough for majors but rounds tokens
below `1e-8` to zero, so prices carry twelve. `volume` is `numeric`, not the
`bigint` the equity services use, because crypto trades in fractional units.

Values are validated against these scales at the edge, so anything Postgres
would silently round is rejected with `400`. The check uses a local
`@MaxDecimalPlaces` rather than class-validator's
`@IsNumber({ maxDecimalPlaces })`, which throws on exponential values such as
`1e-7` and undercounts ones such as `1.234e-13` — both routine at crypto scale.

Rows are read back as JS numbers, which hold ~15–17 significant digits. That is
ample for any single price, but the column stores more precision than the JSON
response can express.

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

## Migrations

```bash
pnpm migration:generate src/migrations/YourChange
pnpm migration:run
pnpm migration:show
pnpm migration:revert
```
