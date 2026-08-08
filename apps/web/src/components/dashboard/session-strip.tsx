"use client";

import { useEffect, useState } from "react";
import { FlapText } from "./flap-text";
import { LANES, type DataStatus } from "@/lib/dashboard-data";
import { getSessionState, type MarketId, type SessionState } from "@/lib/market-sessions";

const SESSION_LABEL: Record<SessionState, string> = {
  OPEN: "OPEN",
  PRE: "PRE-OPEN",
  CLOSED: "CLOSED",
};

const SESSION_DOT: Record<SessionState, string> = {
  OPEN: "bg-ok",
  PRE: "bg-stale",
  CLOSED: "bg-void",
};

const DATA_LABEL: Record<DataStatus, string> = {
  current: "CURRENT",
  stale: "STALE",
  not_wired: "NOT WIRED",
};

const DATA_COLOR: Record<DataStatus, string> = {
  current: "text-ok",
  stale: "text-stale",
  not_wired: "text-void",
};

const ACCENT_TEXT: Record<MarketId, string> = {
  ph: "text-ph",
  us: "text-us",
  xc: "text-xc",
  fx: "text-fx",
};

const PLACEHOLDER = "········";

export function SessionStrip() {
  const [sessions, setSessions] = useState<Record<MarketId, SessionState> | null>(null);

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      setSessions({
        ph: getSessionState("ph", now),
        us: getSessionState("us", now),
        xc: getSessionState("xc", now),
        fx: getSessionState("fx", now),
      });
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section aria-label="Market session status" className="border border-rule bg-panel">
      {LANES.map((lane, i) => {
        const session = sessions?.[lane.id] ?? null;
        const notWired = lane.dataStatus === "not_wired";

        return (
          <div
            key={lane.id}
            className={`grid grid-cols-2 gap-x-4 gap-y-2 border-b border-rule px-4 py-3 last:border-b-0 md:grid-cols-[9rem_8rem_9rem_1fr_5.5rem] md:items-center md:gap-4 ${
              notWired ? "opacity-60" : ""
            }`}
          >
            <div
              className={`font-display text-lg leading-none tracking-tight ${ACCENT_TEXT[lane.id]}`}
            >
              {lane.label}
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  session ? SESSION_DOT[session] : "bg-rule"
                }`}
                aria-hidden="true"
              />
              <FlapText text={session ? SESSION_LABEL[session] : PLACEHOLDER} delayMs={i * 90} />
            </div>

            <div className={`font-mono text-xs ${DATA_COLOR[lane.dataStatus]}`}>
              <FlapText
                text={sessions ? DATA_LABEL[lane.dataStatus] : PLACEHOLDER}
                delayMs={i * 90 + 140}
              />
            </div>

            <div className="col-span-2 truncate font-mono text-xs text-muted md:col-span-1">
              {lane.detail}
            </div>

            <div className="font-mono text-xs text-muted md:text-right">
              {lane.lastUpdate ?? "—"}
            </div>
          </div>
        );
      })}
    </section>
  );
}
