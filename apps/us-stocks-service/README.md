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

Routes live under `/market-data` and `/excluded-symbols`.

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
no-op. It returns `{ date, sourceUrl, imported, skipped, excluded }` —
`sourceUrl` omits the API key.

Each upstream bar maps as `T`→`symbol`, `o`/`h`/`l`/`c`→OHLC, `v`→`volume`, and
`t` (Unix milliseconds, the start of the aggregate window) →`timestamp`. Massive
carries no traded value, so `turnover` is `0`. Prices are rounded to the four
decimals the column stores.

Bars that cannot be stored — missing or non-positive prices, a price at or above
`10^8`, a symbol over 20 characters — are skipped and counted in `skipped`
rather than failing the day's import. An unreachable or erroring upstream
returns `502`, and a `404` from Massive returns `404`.

Bars naming a symbol in `excluded_symbol` are dropped and counted in
`excluded`, kept apart from `skipped` because it means something different: the
bar was fine, the symbol is simply one this service does not store. The list is
read once per import, not once per bar, and the batch is filtered before it
reaches the database — so excluding most of the feed makes an import *faster*,
since the upsert is what the day's work actually costs.

### Excluded symbols

| Method   | Path                            | Description                       |
| -------- | ------------------------------- | --------------------------------- |
| `POST`   | `/excluded-symbols`             | Exclude a symbol                  |
| `POST`   | `/excluded-symbols/bulk-upsert` | Exclude many symbols              |
| `GET`    | `/excluded-symbols`             | List exclusions (paginated)       |
| `GET`    | `/excluded-symbols/:symbol`     | Fetch one exclusion               |
| `DELETE` | `/excluded-symbols/:symbol`     | Stop excluding a symbol           |

The tickers this service refuses to store: `{ symbol, reason? }`, where
`reason` is free text up to 200 characters. Symbols are stored and compared
upper-cased, so `aapl` and `AAPL` are the same exclusion — a denylist a change
of case slips past is not one. List query parameters are `symbol`, `limit`
(1–1000, default 100) and `offset` (default 0), ordered by `symbol` ascending.

The bulk upsert takes up to 20000 symbols in one request and is idempotent —
re-sending a symbol with a new reason rewrites it — so a regenerated exclusion
list can be posted whole. It runs in a single transaction, chunked at 1000 rows.
Repeating a symbol *within one request* returns `400` naming it.

This is a denylist, not the allowlist `forex-service` keeps in `currency_pair`,
so it is deliberately **not** a foreign key on `market_data.symbol`: Postgres
can require a referenced row to exist, not require one to be absent. The rule
is enforced in `MarketDataService` instead, on every write path — `POST
/market-data`, the bulk upsert, and a `PATCH` that names a symbol all return
`400` for an excluded ticker.

Excluding a symbol says nothing about the candles already stored for it. Past
rows stay, and stay editable; delete them separately if they are not wanted.

## Migrations

```bash
pnpm migration:generate src/migrations/<Name>
pnpm migration:run
pnpm migration:revert
```
