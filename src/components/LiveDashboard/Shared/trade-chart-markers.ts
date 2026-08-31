import type { Marker } from "@/components/LiveDashboard/converter";
import type { SlowTradingHistoryPosition } from "@/lib/slowTrading";
import { blue, orange, purple } from "@mui/material/colors";
import type { UTCTimestamp } from "lightweight-charts";

type TradeMarkerPosition = Pick<
  SlowTradingHistoryPosition,
  "closed" | "opened" | "pnl" | "symbol"
>;

/** Builds entry and exit chart markers for trade rows matching one symbol. */
export function buildTradeMarkersFromHistory(
  history: TradeMarkerPosition[],
  symbol: string,
): Marker[] {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const markers: Marker[] = [];

  history.forEach((trade) => {
    if (trade.symbol?.trim().toUpperCase() !== normalizedSymbol) {
      return;
    }

    if (Number.isFinite(trade.opened.t)) {
      markers.push({
        color: blue[300],
        position: "belowBar",
        shape: "arrowUp",
        text: `ENTRY ${trade.opened.vPoint.id}`,
        time: Math.floor(trade.opened.t / 1000) as UTCTimestamp,
      });
    }

    if (Number.isFinite(trade.closed?.t)) {
      markers.push({
        color:
          (trade.pnl.netPct ?? 0) >= 0 ? purple[500] : orange[500],
        position: "aboveBar",
        shape: "arrowDown",
        text: `EXIT ${trade.opened.vPoint.id}`,
        time: Math.floor(trade.closed!.t / 1000) as UTCTimestamp,
      });
    }
  });

  return markers.sort((a, b) => Number(a.time) - Number(b.time));
}
