/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import JsonTreeViewer from "@/components/LiveDashboard/Shared/JsonTreeViewer";

describe("JSON tree viewer", () => {
  it("expands and collapses nested trade details", async () => {
    render(
      <JsonTreeViewer
        ariaLabel="APT trade JSON tree"
        value={{
          account: "1",
          opened: {
            t: 123,
            vPoint: {
              id: "T_TEST",
              lvl: 2,
            },
          },
        }}
      />,
    );

    // PROD:TRADE_HISTORY_JSON_TREE
    expect(
      screen.getByRole("tree", { name: "APT trade JSON tree" }),
    ).toBeTruthy();
    expect(screen.queryByText("vPoint:")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await waitFor(() => {
      expect(screen.getByText("vPoint:")).toBeTruthy();
      expect(screen.getByText('"T_TEST"')).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse nested" }),
    );
    await waitFor(() => {
      expect(screen.queryByText("vPoint:")).toBeNull();
    });

    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeTruthy();
  });
});
