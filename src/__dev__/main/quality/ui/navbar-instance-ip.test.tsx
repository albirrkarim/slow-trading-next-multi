/**
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import NavbarInstanceIp from "@/components/LiveDashboard/Navbar/NavbarInstanceIp";

describe("NavbarInstanceIp", () => {
  it("copies the public IP when its chip is clicked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <NavbarInstanceIp
        snapshot={{ ip: "203.0.113.25", t: 1_780_000_100_000 }}
      />,
    );

    // PROD:NAVBAR_INSTANCE_IP_COPY
    await user.click(
      screen.getByRole("button", { name: "Copy instance IP 203.0.113.25" }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("203.0.113.25");
    });
  });
});
