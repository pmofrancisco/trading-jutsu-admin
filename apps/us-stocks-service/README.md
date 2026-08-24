# us-stocks-service

NestJS service exposing CRUD over US stock market data (OHLCV candles), backed by
Postgres via TypeORM.

## Setup

```bash
pnpm install
cp .env.example .env   # then set DATABASE_URL
pnpm migration:run     # creates the market_data table and its indexes
```

`DATABASE_URL` is required. SSL is enabled automatically when the URL carries
`sslmode=require`. `PORT` defaults to `3003`.

`MASSIVE_BASE_URL` (e.g. `https://api.massive.com`) and `MASSIVE_API_KEY` are
required by the EOD import only; the rest of the API runs without them.

## Run

```bash
pnpm dev          # watch mode
pnpm start:prod   # after pnpm build
```

Swagger UI is served at `http://localhost:3003/docs`.

## API

All routes live under `/market-data`.

| Method   | Path                        | Description                        |
| -------- | --------------------------- | ---------------------------------- |
| `POST`   | `/market-data`              | Create a candle                    |
| `POST`   | `/market-data/bulk-upsert`  | Insert or update many candles      |
| `POST`   | `/market-data/import/eod`   | Import a day of EOD bars           |
| `GET`    | `/market-data`              | List candles (filtered, paginated) |
| `GET`    | `/market-data/:id`          | Fetch a candle by id               |
| `PATCH`  | `/market-data/:id`          | Partially update a candle          |
| `DELETE` | `/market-data/:id`          | Delete a candle                    |

List query parameters: `symbol`, `from`, `to` (ISO timestamps), `limit`
(1–1000, default 100) and `offset` (default 0). Results are ordered by
`timestamp` ascending.

A candle is `{ symbol, timestamp, open, high, low, close, volume, turnover }`.
`(symbol, timestamp)` is unique — creating or updating into a duplicate pair
returns `409 Conflict`; an unknown id returns `404 Not Found`.

### Bulk upsert

`POST /market-data/bulk-upsert` takes `{ "candles": [ ... ] }` and returns
`{ "upserted": n }`. Each candle is matched on `(symbol, timestamp)`: new pairs
are inserted, existing ones updated. Re-sending an identical batch is a no-op,
so an ingest job can safely retry.

The batch runs in a single transaction and is split into chunks of 1000 to stay
under the Postgres 65535 bound-parameter ceiling, so a partial failure leaves no
half-ingested session behind. The JSON body limit is raised to 25mb in
`main.ts` (the Express default of 100kb caps a batch at roughly 680 candles).

Repeating the same `(symbol, timestamp)` twice *within one request* returns
`400` naming the offending pair, rather than silently keeping just one of them.

### EOD import

`POST /market-data/import/eod` takes an optional `{ "date": "2026-08-21" }`
(defaulting to the current date), fetches that day's grouped daily bars from
`GET {MASSIVE_BASE_URL}/v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true`,
and feeds them through the same bulk upsert, so re-running it for a date is a
no-op. It returns `{ date, sourceUrl, imported, skipped }` — `sourceUrl` omits
the API key.

Each upstream bar maps as `T`→`symbol`, `o`/`h`/`l`/`c`→OHLC, `v`→`volume`, and
`t` (Unix milliseconds, the start of the aggregate window) →`timestamp`. Massive
carries no traded value, so `turnover` is `0`. Prices are rounded to the four
decimals the column stores.

Bars that cannot be stored — missing or non-positive prices, a price at or above
`10^8`, a symbol over 20 characters — are skipped and counted in `skipped`
rather than failing the day's import. An unreachable or erroring upstream
returns `502`, and a `404` from Massive returns `404`.

## Migrations

```bash
pnpm migration:generate src/migrations/<Name>
pnpm migration:run
pnpm migration:revert
```
