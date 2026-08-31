import type { UTCTimestamp } from "lightweight-charts";
import type {
  TradeHistoryVolatility,
  VolatilityPoint,
} from "../../lib/dynamic";
import type { TradeHistorySimple } from "../../lib/dynamic/backtest-volatility/type";
import type { Position } from "../../lib/trading/models";
import { DEFAULT_COLORS } from "@/components/client/constants";
import { green, red } from "@mui/material/colors";

export interface Marker {
  time: UTCTimestamp;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
  price?: number;
  tooltipTitle?: string;
  tooltipText?: string;
}

export const convertTradeHistoryToMarkers = (
  trades: TradeHistorySimple[],
): Marker[] =>
  trades.map((trade) => ({
    time: Math.floor(trade.time / 1000) as UTCTimestamp,
    position: trade.side === "BUY" ? "belowBar" : "aboveBar",
    color: trade.side === "BUY" ? "green" : "red",
    shape: trade.side === "BUY" ? "arrowUp" : "arrowDown",
    text: trade.message,
  }));

export const convertVolatilityToMarkers = (
  vPoints: VolatilityPoint[],
): Marker[] =>
  vPoints.map((vPoint) => ({
    time: Math.floor(vPoint.t / 1000) as UTCTimestamp,
    position: vPoint.l === "B" ? "belowBar" : "aboveBar",
    color: vPoint.l === "B" ? "green" : "red",
    shape: vPoint.l === "B" ? "arrowUp" : "arrowDown",
    text: `${vPoint.l === "B" ? "BOTTOM" : "TOP"}[${vPoint.lvl}] ${vPoint.pct ?? ""} - ${vPoint.id.split("_")[1]}`,
  }));

export interface LeveledMarkers {
  /**
   * UTCTimestamp
   */
  time: number; // ms
  level: number;
  color?: string;
  text?: string;
}

export const convertVolatilityToLeveledMarkers = (
  symbol: string,
  points: VolatilityPoint[],
  color?: string,
): LeveledMarkers[] =>
  points.map((point) => ({
    time: Math.floor(point.t / 1000) as UTCTimestamp,
    level: point.lvl,
    color: color ? color : point.l === "B" ? green[400] : red[400],
    text: `${symbol} ${point.id.split("_")[0]} - ${point.id.split("_")[1]} [${point.lvl}] - ${point.pct}% @ ${point.p} ${point.message ?? ""}`,
  }));

/**
 * Convert trades -> leveled markers with the trade id embedded into the text.
 * - pivot & entry use trade.level
 * - exit uses event.exitLevel if provided
 * - every marker text starts with "[<id>]"
 */
export function tradesToLeveledMarkers(
  trades: TradeHistoryVolatility[],
): LeveledMarkers[] {
  const markers: LeveledMarkers[] = [];

  for (const t of trades) {
    const symbol = t.symbol ?? "UNKNOWN";
    const tradeLevel = typeof t.entryLevel === "number" ? t.entryLevel : 0;
    const tradeId =
      t.entryId ?? `${symbol}_${Math.floor((t.entryTime ?? 0) / 1000)}`;

    // entry marker (if present) — include id in text
    const entryMs = t.entryTime;
    if (typeof entryMs === "number") {
      const entryTimeSec = Math.floor(entryMs / 1000) as UTCTimestamp;
      const entryMsg = t.message?.trim() ?? `entry: ${t.entryPrice ?? "?"}`;
      const entryText = `[${tradeId}] BUY ${symbol} — ${entryMsg}`;
      markers.push({
        time: entryTimeSec,
        level: tradeLevel,
        color: "blue",
        text: entryText,
      });
    }

    // exit marker (if present) — include id in text and use event.exitLevel if provided
    const exitMs = t.exitTime;
    if (typeof exitMs === "number") {
      const exitTimeSec = Math.floor(exitMs / 1000) as UTCTimestamp;
      const exitLevel =
        typeof t.exitLevel === "number" ? t.exitLevel : tradeLevel;
      const profit =
        typeof t.netProfitPercent === "number" ? t.netProfitPercent : undefined;
      const exitMsg =
        t.message?.trim() ??
        `exit: ${t.exitPrice ?? "?"}${
          profit !== undefined ? ` | profit: ${profit.toFixed(2)}%` : ""
        }`;
      const exitColor =
        profit !== undefined ? (profit >= 0 ? "green" : "red") : "black";
      const exitText = `[${tradeId}] SELL ${symbol} — ${exitMsg}`;

      markers.push({
        time: exitTimeSec,
        level: exitLevel,
        color: exitColor,
        text: exitText,
      });
    }
  }

  markers.sort((a, b) => a.time - b.time);
  return markers;
}

interface LeveledMarkersPoint {
  symbol?: string;
  time: number; //  UTC timestamp
  level: number;
  color: string;
  text: string; // when entry use the .message when exit use the exitMessage
}

/**
 * Convert positions into pairs of [entryMarker, exitMarker]
 *
 * - entryMarker.time  => Math.floor(entryTime / 1000)
 * - exitMarker.time   => Math.floor(exitTime / 1000) (or null if missing)
 * - entry text uses `message` + entryId
 * - exit text uses `exitMessage` + exitId + holdDurationHuman (if present)
 */
export function convertPositionIntoEntryExitPair({
  positions,
  colorMap,
  symbol,
  color,
}: {
  positions: Position[];
  colorMap?: Record<string, string>;
  symbol?: string;
  color?: string;
}): Array<[LeveledMarkersPoint, LeveledMarkersPoint]> {
  const out: Array<[LeveledMarkersPoint, LeveledMarkersPoint]> = [];

  for (const p of positions) {
    const usedSymbol = symbol ?? p.symbol ?? "unknown";

    const usedColor = color ?? colorMap?.[usedSymbol] ?? DEFAULT_COLORS[0];

    // build entry marker (use entryLevel, fallback 0)
    const entryLevel = typeof p.opened.vPoint.lvl === "number" ? p.opened.vPoint.lvl : 0;
    const entryTimeSec = Math.floor((p.opened.t ?? 0) / 1000);

    const entryTextParts: string[] = [];
    if (p.executionMode) entryTextParts.push(`[${p.executionMode}]`);
    if (p.opened.vPoint.id) entryTextParts.push(`${p.opened.vPoint.id}`);
    entryTextParts.push(`${usedSymbol} ENTRY ${p.exposure.averageEntryPrice}`);
    // if (p.entryTimeHuman) entryTextParts.push(`(${p.entryTimeHuman})`);
    if (p.exposure.notionalUsdt) entryTextParts.push(`- $${p.exposure.notionalUsdt.toFixed(2)}`);
    if (p.strategy.entry.label) entryTextParts.push(` ${p.strategy.entry.label}`);

    const entryMarker: LeveledMarkersPoint = {
      symbol: usedSymbol,
      time: entryTimeSec,
      level: entryLevel,
      color: usedColor,
      text: p.opened.message || entryTextParts.join(" "),
    };

    // build exit marker if available
    let exitMarker: LeveledMarkersPoint = { ...entryMarker };

    if (p.closed?.t) {
      const exitLevel =
        typeof p.closed?.vPoint?.lvl === "number" ? p.closed?.vPoint?.lvl : entryLevel;
      const exitTimeSec = Math.floor(p.closed.t / 1000);

      const exitTextParts: string[] = [];
      if (p.executionMode) exitTextParts.push(`[${p.executionMode}]`);
      if (p.opened.vPoint.id) exitTextParts.push(`${p.opened.vPoint.id}`);
      exitTextParts.push(`${usedSymbol} EXIT`);
      // if (p.exitTimeHuman) exitTextParts.push(`(${p.exitTimeHuman})`);
      if (p.strategy.entry.label) exitTextParts.push(`- ${p.strategy.entry.label}`);
      if (p.pnl.netUsdt)
        exitTextParts.push(`- profit $${p.pnl.netUsdt.toFixed(2)}`);
      if (p.pnl.netPct) exitTextParts.push(` (${p.pnl.netPct}%)`);
      if (p.closed?.price) exitTextParts.push(`| Exit @ ${p.closed?.price}`);

      const holdHours = (p.closed.t - p.opened.t) / (60 * 60 * 1000);
      exitTextParts.push(`| Hold: ${holdHours.toFixed(1)}h`);

      const exitText = p.closed.message || exitTextParts.join(" ");

      exitMarker = {
        symbol: usedSymbol,
        time: exitTimeSec,
        level: exitLevel,
        color: usedColor,
        text: exitText,
      };
    }

    out.push([entryMarker, exitMarker]);
  }

  return out;
}
