export type SessionState = "OPEN" | "PRE" | "CLOSED";

export type MarketId = "ph" | "us" | "xc" | "fx";

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  return { weekday: weekdayMap[weekdayStr] ?? 0, minutes: hour * 60 + minute };
}

/** PSE: continuous session, Mon-Fri 09:30-15:30 Asia/Manila */
function pseSession(date: Date): SessionState {
  const { weekday, minutes } = partsInZone(date, "Asia/Manila");
  if (weekday === 0 || weekday === 6) return "CLOSED";
  if (minutes < 9 * 60 + 30) return "PRE";
  if (minutes >= 15 * 60 + 30) return "CLOSED";
  return "OPEN";
}

/** NYSE/Nasdaq: Mon-Fri 09:30-16:00 America/New_York */
function nyseSession(date: Date): SessionState {
  const { weekday, minutes } = partsInZone(date, "America/New_York");
  if (weekday === 0 || weekday === 6) return "CLOSED";
  if (minutes < 9 * 60 + 30) return "PRE";
  if (minutes >= 16 * 60) return "CLOSED";
  return "OPEN";
}

/** FX: open continuously from Sun 17:00 ET to Fri 17:00 ET */
function fxSession(date: Date): SessionState {
  const { weekday, minutes } = partsInZone(date, "America/New_York");
  if (weekday === 6) return "CLOSED";
  if (weekday === 0 && minutes < 17 * 60) return "CLOSED";
  if (weekday === 5 && minutes >= 17 * 60) return "CLOSED";
  return "OPEN";
}

export function getSessionState(market: MarketId, date: Date): SessionState {
  switch (market) {
    case "ph":
      return pseSession(date);
    case "us":
      return nyseSession(date);
    case "fx":
      return fxSession(date);
    case "xc":
      return "OPEN";
  }
}
