# forex-service

NestJS service exposing CRUD over foreign exchange market data (OHLC candles)
and the ISO 4217 currencies those pairs are built from, backed by Postgres via
TypeORM.

## Setup

```bash
pnpm install
cp .env.example .env   # then set DATABASE_URL and MASSIVE_API_KEY
pnpm migration:run     # creates the market_data and currency tables
```

`DATABASE_URL` is required, as are `MASSIVE_BASE_URL` and `MASSIVE_API_KEY` for
the EOD import route. SSL is enabled automatically when the URL carries
`sslmode=require`. `PORT` defaults to `3004`.

## Run

```bash
pnpm dev          # watch mode
pnpm start:prod   # after pnpm build
```

Swagger UI is served at `http://localhost:3004/docs`.

## API

### Market data

These routes live under `/market-data`.

| Method   | Path                       | Description                        |
| -------- | -------------------------- | ---------------------------------- |
| `POST`   | `/market-data`             | Create a candle                    |
| `POST`   | `/market-data/bulk-upsert` | Insert or update many candles      |
| `POST`   | `/market-data/import/eod`  | Import a day of EOD bars           |
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

Candles arrive either through `bulk-upsert`, from whichever feed you point at
it, or through the EOD import route below.

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

### EOD import

`POST /market-data/import/eod` takes an optional `{ "date": "2026-09-02" }`
(defaulting to the current date), fetches that day's grouped daily bars from
`GET {MASSIVE_BASE_URL}/v2/aggs/grouped/locale/global/market/fx/{date}?adjusted=true`,
and feeds them through the same bulk upsert, so re-running it for a date is a
no-op. It returns `{ date, sourceUrl, imported, skipped }` — `sourceUrl` omits
the API key.

The `C:` prefix is dropped from the stored symbol: `C:EURUSD` is saved as
`EURUSD`. Every pair Massive returns is imported, whatever its quote currency —
crosses such as `C:AUDNOK` and `C:DKKPLN` are stored alongside the majors, about
1200 pairs a day. (This is the one place forex differs from `crypto-service`,
which imports only USD pairs and reports a `filtered` count.)

Each upstream bar maps as `T`→`symbol`, `o`/`h`/`l`/`c`→OHLC and `v`→`volume`.
`v` is a tick count, which is exactly what this service's nullable `volume` is
for; Massive carries no traded value, so `turnover` is `null` rather than a
fabricated `0`. Like the crypto feed and unlike the equity one, `t` marks the
_close_ of the daily window (`23:59:59.999` UTC), so it is floored to the day it
closes — a candle for 2026-09-02 is keyed at `2026-09-02T00:00:00.000Z`, the
same key a candle ingested through `bulk-upsert` carries.

Bars that cannot be stored — a ticker without the `C:` prefix, a symbol over 20
characters, missing or non-positive prices, a price at or above `10^12` that
would overflow the column, or a price below `5×10^-7` that would round away to
zero — are skipped and counted in `skipped` rather than failing the day's
import. An unusable `v` is _not_ one of these: it stores `null` and keeps the
prices. An unreachable or erroring upstream returns `502`, and a `404` from
Massive returns `404`.

Note that `numeric(18,6)` limits how much of an exotic pair survives: `C:LBPUSD`
around `1.1×10^-5` keeps two significant digits. Majors and ordinary crosses are
unaffected.

### Currencies

`/currencies` is a reference table of ISO 4217 codes — the halves a
`market_data.symbol` pair is built from, so `EURUSD` is `EUR` against `USD` and
`XAUUSD` gold against the dollar. Metals live here too: `XAU` is the ISO code
for a troy ounce of gold, so it needs no table of its own.

| Method   | Path                      | Description                           |
| -------- | ------------------------- | ------------------------------------- |
| `POST`   | `/currencies`             | Create a currency                     |
| `POST`   | `/currencies/bulk-upsert` | Insert or update many currencies      |
| `GET`    | `/currencies`             | List currencies (filtered, paginated) |
| `GET`    | `/currencies/:code`       | Fetch a currency by code              |
| `PATCH`  | `/currencies/:code`       | Partially update a currency           |
| `DELETE` | `/currencies/:code`       | Delete a currency                     |

A currency is `{ code, name }` — `{ "code": "USD", "name": "US Dollar" }`,
`{ "code": "XAU", "name": "Gold" }` — plus `createdAt` and `updatedAt`.

`code` is the primary key rather than a surrogate id: it is assigned upstream,
immutable, and what a caller already has in hand, so `GET /currencies/USD`
needs no lookup first. Codes are normalized to upper case on the way in, on the
path and in a query string alike, so `/currencies/usd` resolves; anything that
is not three letters is a `400`. Creating a code that exists returns `409
Conflict`, and an unknown code `404 Not Found`.

`code` is deliberately absent from the `PATCH` body — it is the row's identity,
not one of its fields, so renaming a currency changes `name` and re-coding one
means delete and create.

List query parameters: `code` (exact), `search` (case-insensitive substring of
the name, with `%` and `_` matched literally), `limit` (1–1000, default **500**)
and `offset` (default 0). Results are ordered by `code` ascending. The default
page is deliberately larger than market data's 100: ISO 4217 is about 180 codes,
so one page holds the whole standard and a caller filling a dropdown cannot
silently miss any.

`POST /currencies/bulk-upsert` takes `{ "currencies": [ ... ] }` and returns
`{ "upserted": n }`, matching on `code`. It is how you seed the standard without
180 requests. A batch is capped at 1000 entries, which keeps it to one statement
well inside the Postgres bound-parameter ceiling — so unlike a market-data
upsert it needs no chunking. Repeating a code inside one request is a `400`, for
the same reason it is there: Postgres cannot apply two `ON CONFLICT` updates to
one row.

ISO 4217 changes a few times a decade, so there is no import route for it the
way there is for EOD bars — seed it once through `bulk-upsert`.

## Migrations

```bash
pnpm migration:generate src/migrations/YourChange
pnpm migration:run
pnpm migration:show
pnpm migration:revert
```
