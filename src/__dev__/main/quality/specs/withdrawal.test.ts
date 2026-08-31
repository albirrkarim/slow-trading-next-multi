import slowTrading from "@/lib/slowTrading";

describe("slow specs withdrawal", () => {
  it("caps manual withdrawals at 2 USDT", () => {
    const amountUSDT =
      slowTrading.withdrawal.limits.getExecutionAmountUsdt(25, "manual");

    // PROD:MANUAL_WITHDRAWAL_CAP
    expect(amountUSDT).toBe(2);
  });

  it("uses the configured amount for automatic withdrawals", () => {
    const amountUSDT =
      slowTrading.withdrawal.limits.getExecutionAmountUsdt(25, "automatic");

    // PROD:AUTOMATIC_WITHDRAWAL_AMOUNT
    expect(amountUSDT).toBe(25);
  });
});
