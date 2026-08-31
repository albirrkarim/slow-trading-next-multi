/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import fs from "fs-extra";
import path from "path";
import { describe, expect, it } from "vitest";

import ButtonDialog from "@/components/ui/ButtonDialog";

describe("slow-trading history report dialog", () => {
  it("configures the navbar history report as a closable fullscreen dialog", async () => {
    const source = await fs.readFile(
      path.join(
        process.cwd(),
        "src/components/LiveDashboard/Navbar/NavbarSections.tsx",
      ),
      "utf8",
    );
    const marker = source.indexOf("// PROD:FULLSCREEN_TRADE_HISTORY_REPORT");
    const historyDialog = source.slice(
      marker,
      source.indexOf("</ButtonDialog>", marker),
    );

    render(
      <ButtonDialog
        defaultOpen
        forceFullscreen
        title="History"
        titleLong="Trade History"
        useAppBar
      >
        {() => <div>History content</div>}
      </ButtonDialog>,
    );

    // PROD:FULLSCREEN_TRADE_HISTORY_REPORT
    expect(historyDialog).toContain("forceFullscreen");
    expect(historyDialog).toContain("useAppBar");
    expect(screen.getByRole("dialog").className).toContain(
      "MuiDialog-paperFullScreen",
    );
    const heading = screen.getByRole("heading", {
      name: "Trade History",
    });
    expect(heading.closest(".MuiToolbar-root")?.className).toContain(
      "MuiToolbar-dense",
    );
    expect(screen.getByRole("button", { name: "close" })).toBeTruthy();
    const scrollContent = screen.getByTestId(
      "fullscreen-dialog-scroll-content",
    );
    const scrollStyles = getComputedStyle(scrollContent);
    expect(scrollContent.className).toContain("MuiDialogContent-root");
    expect(scrollStyles.overflowY).toBe("auto");
    expect(scrollStyles.touchAction).toBe("pan-x pan-y");
  });
});
