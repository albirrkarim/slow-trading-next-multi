/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@mui/material";
import { createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";

import { computeAutoEntryActive } from "@/components/LiveDashboard/Navbar/helpers";
import {
  getNavbarBackgroundColor,
  useNavbarThemeColor,
} from "@/components/LiveDashboard/Navbar/theme-color";
import type { DashboardState } from "@/components/LiveDashboard/Navbar/types";

const theme = createTheme({
  palette: {
    background: {
      default: "#f4f5f7",
    },
    error: {
      main: "#f44336",
    },
  },
});

function ThemeColorHarness({ isActive }: { isActive: boolean }) {
  const activeTheme = useTheme();
  const navbarBackgroundColor = getNavbarBackgroundColor(
    activeTheme,
    isActive,
  );

  useNavbarThemeColor(
    navbarBackgroundColor,
    activeTheme.palette.background.default,
  );

  return <div data-background={navbarBackgroundColor} />;
}

function makeDashboardRuntime(
  runnerEnabled: boolean,
  autoEntryEnabled: boolean,
) {
  return {
    runtime: {
      autoEntryEnabled,
      runnerEnabled,
    },
  } as DashboardState;
}

describe("navbar browser theme color", () => {
  afterEach(() => {
    cleanup();
    document.head
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((element) => element.remove());
  });

  it("treats auto entry as active only when its runner is also enabled", () => {
    expect(computeAutoEntryActive(null)).toBe(false);
    expect(computeAutoEntryActive(makeDashboardRuntime(true, false))).toBe(
      false,
    );
    expect(computeAutoEntryActive(makeDashboardRuntime(false, true))).toBe(
      false,
    );
    expect(computeAutoEntryActive(makeDashboardRuntime(true, true))).toBe(true);
  });

  it("treats auto entry as inactive when today's navbar USD PnL reaches its stop", () => {
    const state = makeDashboardRuntime(true, true);
    state.runtime.autoEntryDailyPnlLimitUSDT = -50;
    state.history = [
      {
        closed: { t: Date.now() - 60_000 },
        opened: { t: Date.now() - 120_000 },
        pnl: { netUsdt: -50 },
      },
    ] as any;

    // PROD:AUTO_ENTRY_DAILY_PNL_LIMIT_USDT
    expect(computeAutoEntryActive(state)).toBe(false);
  });

  it("updates the meta tag to the exact active and inactive navbar colors", () => {
    const themeColorMeta = document.createElement("meta");
    themeColorMeta.name = "theme-color";
    themeColorMeta.content = "#f4f5f7";
    document.head.append(themeColorMeta);

    const view = render(
      <ThemeProvider theme={theme}>
        <ThemeColorHarness isActive />
      </ThemeProvider>,
    );

    expect(themeColorMeta.getAttribute("content")).toBe("#f44336");

    view.rerender(
      <ThemeProvider theme={theme}>
        <ThemeColorHarness isActive={false} />
      </ThemeProvider>,
    );

    expect(themeColorMeta.getAttribute("content")).toBe("#f4f5f7");

    view.unmount();
    expect(themeColorMeta.getAttribute("content")).toBe("#f4f5f7");
  });
});
