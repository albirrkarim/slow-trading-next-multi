/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SettingsCheckbox from "@/components/LiveDashboard/Navbar/SettingsCheckbox";

describe("SettingsCheckbox", () => {
  it("renders state, tooltip trigger, and optional action", () => {
    const onChange = vi.fn();

    render(
      <SettingsCheckbox
        action={<button type="button">Readmore</button>}
        checked
        info="Detailed setting description"
        label="Example Setting"
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Example Setting")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Detailed setting description" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Readmore" })).toBeDefined();

    fireEvent.click(screen.getByRole("checkbox", { name: "Example Setting" }));

    expect(onChange).toHaveBeenCalledWith(false);
  });
});
