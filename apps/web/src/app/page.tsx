import { HeaderClock } from "@/components/dashboard/header-clock";
import { SessionStrip } from "@/components/dashboard/session-strip";
import { ANOMALIES, COVERAGE, INGESTION_LOG } from "@/lib/dashboard-data";

const STATUS_DOT = { ok: "bg-ok", gap: "bg-gap" } as const;
const SEVERITY_TEXT = { warn: "text-stale", error: "text-gap" } as const;

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Trading Jutsu
          </p>
          <h1 className="font-display text-4xl uppercase leading-none tracking-tight text-flap sm:text-5xl">
            Market Data Ops
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <HeaderClock />
          <button
            type="button"
            disabled
            title="Not connected -- POST /market-data/import/eod"
            className="cursor-not-allowed border border-rule px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted"
          >
            Run PSE EOD Import
          </button>
        </div>
      </header>

      <SessionStrip />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section aria-labelledby="ingestion-heading" className="border border-rule bg-panel">
          <h2
            id="ingestion-heading"
            className="border-b border-rule px-4 py-2 font-display text-sm uppercase tracking-wide text-flap"
          >
            Recent Ingestion
          </h2>
          <ul>
            {INGESTION_LOG.map((entry) => (
              <li
                key={entry.time}
                className="flex items-center gap-3 border-b border-rule px-4 py-2 font-mono text-xs last:border-b-0"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[entry.status]}`}
                  aria-hidden="true"
                />
                <span className="text-muted">{entry.time}</span>
                <span className="flex-1 truncate text-flap">{entry.label}</span>
                <span className="text-muted">{entry.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="anomalies-heading" className="border border-rule bg-panel">
          <h2
            id="anomalies-heading"
            className="border-b border-rule px-4 py-2 font-display text-sm uppercase tracking-wide text-flap"
          >
            Gaps &amp; Anomalies
          </h2>
          <ul>
            {ANOMALIES.map((entry) => (
              <li
                key={`${entry.symbol}-${entry.date}`}
                className="flex items-center gap-3 border-b border-rule px-4 py-2 font-mono text-xs last:border-b-0"
              >
                <span className="w-10 shrink-0 text-flap">{entry.symbol}</span>
                <span className={`flex-1 truncate ${SEVERITY_TEXT[entry.severity]}`}>
                  {entry.issue}
                </span>
                <span className="text-muted">{entry.date}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="coverage-heading" className="border border-rule bg-panel">
        <h2
          id="coverage-heading"
          className="border-b border-rule px-4 py-2 font-display text-sm uppercase tracking-wide text-flap"
        >
          Coverage — PH Stocks
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-md border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-rule text-left text-muted">
                <th scope="col" className="px-4 py-2 font-normal uppercase tracking-wide">
                  Symbol
                </th>
                <th scope="col" className="px-4 py-2 font-normal uppercase tracking-wide">
                  First
                </th>
                <th scope="col" className="px-4 py-2 font-normal uppercase tracking-wide">
                  Last
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-right font-normal uppercase tracking-wide"
                >
                  Candles
                </th>
              </tr>
            </thead>
            <tbody>
              {COVERAGE.map((row) => (
                <tr key={row.symbol} className="border-b border-rule last:border-b-0">
                  <td className="px-4 py-2 text-ph">{row.symbol}</td>
                  <td className="px-4 py-2 text-muted">{row.first}</td>
                  <td className="px-4 py-2 text-muted">{row.last}</td>
                  <td className="px-4 py-2 text-right text-flap">{row.candles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="pb-4 font-mono text-xs text-muted">
        Reading market-data from ph-stocks-service. US stocks, crypto, and forex will
        appear here once their services expose the same endpoints.
      </footer>
    </div>
  );
}
