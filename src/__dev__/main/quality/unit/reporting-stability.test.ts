import { getIncomePerMonth } from "@/lib/evaluate/analysis/stability";

describe("monthly profit report", () => {
  it("shows realized short exits instead of zero-profit short entries", () => {
    const result = getIncomePerMonth([
      {
        time: Date.UTC(2024, 9, 1),
        side: "SELL",
        profit: 0,
        message: "[HIT]",
      },
      {
        time: Date.UTC(2024, 9, 8),
        side: "BUY",
        profit: -144,
        message: "[EXIT] SUI SHORT [L_ISOLATED]",
      },
      {
        time: Date.UTC(2024, 9, 14),
        side: "BUY",
        profit: 3.78,
        message: "[EXIT] SUI SHORT [TAKE_PROFIT]",
      },
    ] as any);

    expect(result.monthlyProfitMap["2024-10"].total).toBe(-140.22);
    expect(result.monthlyProfitMap["2024-10"].trades).toHaveLength(2);
    expect(result.monthlyProfitMap["2024-10"].trades[0]).toContain("-144.00");
    expect(result.monthlyProfitMap["2024-10"].trades.join(" ")).not.toContain(
      "$0.00",
    );
  });
});
