/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ReadMoreDialogButton from "@/components/LiveDashboard/Navbar/ReadMoreDialogButton";

describe("ReadMoreDialogButton", () => {
  it("uses an accessible book action to open detailed content", () => {
    render(
      <ReadMoreDialogButton
        dialogTitle="Detailed mechanism"
        tooltip="Read more about this mechanism"
      >
        <p>Mechanism details</p>
      </ReadMoreDialogButton>,
    );

    expect(screen.queryByText("Readmore")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Read more about this mechanism",
      }),
    );

    expect(screen.getByText("Detailed mechanism")).toBeDefined();
    expect(screen.getByText("Mechanism details")).toBeDefined();
  });
});
