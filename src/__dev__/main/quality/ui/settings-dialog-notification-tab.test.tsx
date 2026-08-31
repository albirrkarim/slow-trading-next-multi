/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { SnackbarProvider } from "notistack";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import SettingsDialogNotificationTab from "@/components/LiveDashboard/Navbar/SettingsDialogNotificationTab";
import type { ConfigDraft } from "@/components/LiveDashboard/Navbar/types";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(async () => ({ data: {} })),
  },
}));

function Harness() {
  const [configDraft, setConfigDraft] = useState<ConfigDraft | null>({
    notification: {
      telegram: {
        enabled: true,
        types: [
          {
            id: "NOTIF_HIGH_VOLATILITY",
            params: { level: 4 },
          },
          {
            id: "NOTIF_STALE_POSITION",
            params: { hour: 1 },
          },
          {
            id: "NOTIF_LONG_OPEN_POSITION",
            params: { hour: 24 },
          },
          {
            id: "NOTIF_MANAGEMENT_ACTION",
            params: { add: true, remove: true },
          },
        ],
      },
      email: {
        enabled: true,
        types: [
          {
            id: "NOTIF_HIGH_VOLATILITY",
            params: { level: 7 },
          },
          {
            id: "NOTIF_STALE_POSITION",
            params: { hour: 3 },
          },
          {
            id: "NOTIF_LONG_OPEN_POSITION",
            params: { hour: 48 },
          },
          {
            id: "NOTIF_MANAGEMENT_ACTION",
            params: { add: true, remove: false },
          },
        ],
      },
    },
  } as unknown as ConfigDraft);

  if (!configDraft) {
    return null;
  }

  return (
    <SnackbarProvider>
      <SettingsDialogNotificationTab
        configDraft={configDraft}
        setConfigDraft={setConfigDraft}
      />
      <output data-testid="notification-config">
        {JSON.stringify(configDraft.notification)}
      </output>
    </SnackbarProvider>
  );
}

function DisabledStaleHarness() {
  const [configDraft, setConfigDraft] = useState<ConfigDraft | null>({
    notification: {
      telegram: {
        enabled: true,
        types: [],
      },
      email: {
        enabled: false,
        types: [],
      },
    },
  } as unknown as ConfigDraft);

  if (!configDraft) {
    return null;
  }

  return (
    <SnackbarProvider>
      <SettingsDialogNotificationTab
        configDraft={configDraft}
        setConfigDraft={setConfigDraft}
      />
    </SnackbarProvider>
  );
}

describe("SettingsDialogNotificationTab", () => {
  it("edits High Volatility and Stale Position parameters per channel", () => {
    render(<Harness />);

    expect(
      (
        screen.getByLabelText(
          "Telegram High Volatility Level",
        ) as HTMLInputElement
      ).value,
    ).toBe("4");
    expect(
      (screen.getByLabelText("Email High Volatility Level") as HTMLInputElement)
        .value,
    ).toBe("7");
    expect(
      (
        screen.getByLabelText(
          "Telegram Stale Position Hour",
        ) as HTMLInputElement
      ).value,
    ).toBe("1");
    expect(
      (screen.getByLabelText("Email Stale Position Hour") as HTMLInputElement)
        .value,
    ).toBe("3");
    expect(
      (
        screen.getByLabelText(
          "Telegram Long Open Position Hour",
        ) as HTMLInputElement
      ).value,
    ).toBe("24");
    expect(
      (
        screen.getByLabelText(
          "Email Long Open Position Hour",
        ) as HTMLInputElement
      ).value,
    ).toBe("48");

    fireEvent.change(screen.getByLabelText("Telegram High Volatility Level"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Email Stale Position Hour"), {
      target: { value: "6" },
    });
    fireEvent.change(
      screen.getByLabelText("Telegram Long Open Position Hour"),
      { target: { value: "36" } },
    );
    fireEvent.click(screen.getByLabelText("Telegram Management Action Add"));
    fireEvent.click(screen.getByLabelText("Email Management Action Remove"));

    const config = JSON.parse(
      screen.getByTestId("notification-config").textContent ?? "{}",
    );
    expect(config.telegram.types).toContainEqual({
      id: "NOTIF_HIGH_VOLATILITY",
      params: { level: 5 },
    });
    expect(config.email.types).toContainEqual({
      id: "NOTIF_STALE_POSITION",
      params: { hour: 6 },
    });
    expect(config.email.types).toContainEqual({
      id: "NOTIF_HIGH_VOLATILITY",
      params: { level: 7 },
    });
    expect(config.telegram.types).toContainEqual({
      id: "NOTIF_LONG_OPEN_POSITION",
      params: { hour: 36 },
    });
    expect(config.telegram.types).toContainEqual({
      id: "NOTIF_MANAGEMENT_ACTION",
      params: { add: false, remove: true },
    });
    expect(config.email.types).toContainEqual({
      id: "NOTIF_MANAGEMENT_ACTION",
      params: { add: true, remove: true },
    });
  });

  it("keeps the Hour inputs visible while Stale Position is unchecked", () => {
    render(<DisabledStaleHarness />);

    for (const label of [
      "Telegram Stale Position Hour",
      "Email Stale Position Hour",
    ]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.value).toBe("1");
      expect(input.disabled).toBe(true);
    }

    for (const label of [
      "Telegram Long Open Position Hour",
      "Email Long Open Position Hour",
    ]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.value).toBe("24");
      expect(input.disabled).toBe(true);
    }
  });

  it("previews representative notification content without sending it", () => {
    render(<Harness />);
    const configBefore = screen.getByTestId("notification-config").textContent;

    // PROD:NOTIF_EXAMPLE_PREVIEW
    fireEvent.click(
      screen.getByLabelText("Telegram Black Swan Action notification example"),
    );

    expect(screen.getByText("Black Swan Action example")).toBeTruthy();
    expect(screen.getByText("[BLACK SWAN] CRISIS (SANDBOX)")).toBeTruthy();
    expect(screen.getByText(/State: NORMAL -> CRISIS/)).toBeTruthy();
    expect(screen.getByText(/Reason: SYSTEMIC_BREADTH/)).toBeTruthy();
    expect(screen.getByTestId("notification-config").textContent).toBe(
      configBefore,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Black Swan Action example")).toBeNull();
  });
});
