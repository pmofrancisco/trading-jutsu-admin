import type { MarketId } from "./market-sessions";

export type DataStatus = "current" | "stale" | "not_wired";

export interface LaneData {
  id: MarketId;
  label: string;
  detail: string;
  dataStatus: DataStatus;
  lastUpdate?: string;
}

export const LANES: LaneData[] = [
  {
    id: "ph",
    label: "PH STOCKS",
    detail: "JFC · BDO · SM +58 more",
    dataStatus: "current",
    lastUpdate: "2m ago",
  },
  {
    id: "us",
    label: "US STOCKS",
    detail: "us-stocks-service has not been built",
    dataStatus: "not_wired",
  },
  {
    id: "xc",
    label: "CRYPTO",
    detail: "crypto-service has no market-data module yet",
    dataStatus: "not_wired",
  },
  {
    id: "fx",
    label: "FOREX",
    detail: "forex-service does not exist yet",
    dataStatus: "not_wired",
  },
];

export interface IngestionEntry {
  time: string;
  label: string;
  count: string;
  status: "ok" | "gap";
}

export const INGESTION_LOG: IngestionEntry[] = [
  {
    time: "08-07 17:42",
    label: "PSE EOD import · 2026-08-07",
    count: "612 upserted",
    status: "ok",
  },
  {
    time: "08-06 17:41",
    label: "PSE EOD import · 2026-08-06",
    count: "609 upserted",
    status: "ok",
  },
  {
    time: "08-05 17:44",
    label: "PSE EOD import · 2026-08-05",
    count: "611 upserted",
    status: "ok",
  },
  {
    time: "08-04 17:39",
    label: "PSE EOD import · 2026-08-04",
    count: "3 upserted",
    status: "gap",
  },
];

export interface AnomalyEntry {
  symbol: string;
  issue: string;
  date: string;
  severity: "warn" | "error";
}

export const ANOMALIES: AnomalyEntry[] = [
  { symbol: "JFC", issue: "missing candle", date: "2026-07-14", severity: "error" },
  {
    symbol: "BDO",
    issue: "duplicate timestamp rejected",
    date: "2026-06-02",
    severity: "warn",
  },
  { symbol: "ICT", issue: "zero-volume candle", date: "2026-07-29", severity: "warn" },
];

export interface CoverageRow {
  symbol: string;
  first: string;
  last: string;
  candles: string;
}

export const COVERAGE: CoverageRow[] = [
  { symbol: "JFC", first: "2019-01-02", last: "2026-08-07", candles: "1,842" },
  { symbol: "BDO", first: "2019-01-02", last: "2026-08-07", candles: "1,839" },
  { symbol: "SM", first: "2019-01-02", last: "2026-08-07", candles: "1,841" },
  { symbol: "ALI", first: "2019-01-02", last: "2026-08-07", candles: "1,836" },
  { symbol: "TEL", first: "2019-01-02", last: "2026-08-07", candles: "1,844" },
  { symbol: "BPI", first: "2020-03-16", last: "2026-08-07", candles: "1,598" },
];
