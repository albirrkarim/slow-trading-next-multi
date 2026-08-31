interface PositionPnl {
  pnl: {
    netUsdt?: number;
  };
}

/** Sums the absolute current USDT PnL across open positions. */
function totalAbsolute(positions: PositionPnl[]) {
  return positions.reduce((total, position) => {
    const pnlUsdt = Number(position.pnl.netUsdt);
    return Number.isFinite(pnlUsdt) ? total + Math.abs(pnlUsdt) : total;
  }, 0);
}

/** Returns one position's share of total absolute open-position USDT PnL. */
function share(pnlUsdt: number, totalAbsolutePnlUsdt: number) {
  if (
    !Number.isFinite(pnlUsdt) ||
    !Number.isFinite(totalAbsolutePnlUsdt) ||
    totalAbsolutePnlUsdt <= 0
  ) {
    return 0;
  }

  return Math.min(1, Math.abs(pnlUsdt) / totalAbsolutePnlUsdt);
}

/** Converts contribution share into a restrained background-gradient opacity. */
function opacity(contributionShare: number) {
  if (!Number.isFinite(contributionShare) || contributionShare <= 0) {
    return 0;
  }

  return Math.min(0.18, 0.03 + Math.sqrt(Math.min(1, contributionShare)) * 0.15);
}

const openPositionPnlContribution = {
  opacity,
  share,
  totalAbsolute,
} as const;

export default openPositionPnlContribution;
