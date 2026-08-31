/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CoinMetadataDownloadDialog from "@/components/LiveDashboard/Feature/CoinMetadataDownloadDialog";

describe("coin metadata download dialog", () => {
  it("allows changing and submitting the online source domain", async () => {
    const onDownload = vi.fn().mockResolvedValue(true);
    render(
      <CoinMetadataDownloadDialog
        downloading={false}
        onDownload={onDownload}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Download online version to local" }),
    );

    const sourceInput = screen.getByRole("textbox", { name: "Source domain" });
    expect((sourceInput as HTMLInputElement).value).toBe(
      "https://fast.reinventwp.com",
    );

    fireEvent.change(sourceInput, {
      target: { value: "https://holy.reinventwp.com/" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Download and replace" }),
    );

    await waitFor(() => {
      expect(onDownload).toHaveBeenCalledWith("https://holy.reinventwp.com");
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Source domain" }),
      ).toBeNull();
    });
  });

  it("blocks an invalid source URL", () => {
    render(
      <CoinMetadataDownloadDialog
        downloading={false}
        onDownload={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Download online version to local" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Source domain" }), {
      target: { value: "holy.reinventwp.com" },
    });

    expect(
      screen
        .getByRole("button", { name: "Download and replace" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("Enter a complete HTTP or HTTPS URL.")).toBeTruthy();
  });
});
