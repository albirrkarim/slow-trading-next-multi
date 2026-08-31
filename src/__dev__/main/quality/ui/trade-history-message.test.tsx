import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TradeAuditMessage } from "@/components/LiveDashboard/Reporting/TradesTableSection";

describe("slow trading history messages", () => {
  it("renders persisted entry and close audit text", () => {
    const html = renderToStaticMarkup(
      <>
        <TradeAuditMessage message="[BUY] COMMON entry executed" />
        <TradeAuditMessage message="[SELL] STOP_LOSS_PLUS_TP exit executed" />
      </>,
    );

    expect(html).toContain("[BUY] COMMON entry executed");
    expect(html).toContain("[SELL] STOP_LOSS_PLUS_TP exit executed");
    expect(html).not.toContain("-webkit-line-clamp");
  });

  it("does not render an empty audit-message row", () => {
    expect(renderToStaticMarkup(<TradeAuditMessage message="  " />)).toBe("");
  });
});
