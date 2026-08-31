/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import ExchangeAccountManagerDialog from "@/components/LiveDashboard/Navbar/ExchangeAccountManagerDialog";
import type { ConfigDraft } from "@/components/LiveDashboard/Navbar/types";

vi.mock("axios", () => ({
  default: {
    put: vi.fn(async () => ({ data: {} })),
  },
}));

function createConfigDraft(): ConfigDraft {
  const now = Date.now();

  return {
    autoEntryEnabled: false,
    autoExitEnabled: false,
    autoRemoveSymbolAbsLevel: 0,
    decisionEngineVersion: "decision.v19",
    description: "",
    entrySignalBypass: false,
    exchangeAccountSlug: "1",
    exchangeAccounts: [
      {
        createdAt: now,
        credentials: {
          apiKey: "",
          apiSecret: "",
        },
        description: "",
        slug: "new-binance-account",
        name: "New Binance Account",
        type: "binance",
        enabled: true,
        trading: {
          modelConfig: { takeProfitPercent: 5 },
        },
        sandbox: { enabled: false, initialBalanceUSDT: 1000 },
        updatedAt: now,
      },
    ],
    exchangeType: "binance",
    modelConfig: {
      orderType: "taker",
      safePercentPerMonth: 0,
      safeUSDTPerMonth: 0,
      stopLossPercent: 20,
      takeProfitPercent: 5,
      useStopLossPlus: false,
    },
    name: "Main",
    notification: {
      email: {
        enabled: false,
        types: [],
      },
      telegram: {
        enabled: false,
        types: [],
      },
    },
    runnerEnabled: false,
    safeHavenUSDT: "0",
    sandboxEnabled: false,
    sandboxInitialBalanceUSDT: "1000",
    symbolsText: "BTC",
    tradingMode: "SPOT" as ConfigDraft["tradingMode"],
    withdrawalAutoEnabled: false,
    withdrawalSchedules: [],
    withdrawalWalletBook: [],
  };
}

function Harness() {
  const [configDraft, setConfigDraft] = useState<ConfigDraft | null>(
    createConfigDraft,
  );

  if (!configDraft) {
    return null;
  }

  return (
    <ExchangeAccountManagerDialog
      configDraft={configDraft}
      setConfigDraft={setConfigDraft}
    />
  );
}

describe("exchange account manager dialog", () => {
  it("allows typing into empty credentials without clicking visibility", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      screen.getByRole("button", { name: "Manage exchange accounts" }),
    );

    const apiKey = screen.getByLabelText(
      "Binance API Key",
    ) as HTMLInputElement;
    const apiSecret = screen.getByLabelText(
      "Binance API Secret",
    ) as HTMLInputElement;

    expect(apiKey.readOnly).toBe(false);
    expect(apiSecret.readOnly).toBe(false);

    await user.type(apiKey, "new-api-key");
    await user.type(apiSecret, "new-api-secret");

    expect(apiKey.value).toBe("new-api-key");
    expect(apiSecret.value).toBe("new-api-secret");
    expect(apiKey.readOnly).toBe(false);
    expect(apiSecret.readOnly).toBe(false);
    // expect(axios.put).toHaveBeenCalled();
  });
});
