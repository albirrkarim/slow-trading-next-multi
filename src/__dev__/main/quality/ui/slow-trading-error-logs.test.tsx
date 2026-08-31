/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnackbarProvider } from "notistack";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SlowTradingErrorLogs } from "@/components/LiveDashboard/Feature/SlowTradingLogs";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    delete: vi.fn(),
    get: mocks.get,
    patch: mocks.patch,
  },
}));

function renderLogs() {
  return render(
    <SnackbarProvider>
      <SlowTradingErrorLogs />
    </SnackbarProvider>,
  );
}

describe("SlowTradingErrorLogs", () => {
  afterEach(() => {
    cleanup();
    mocks.get.mockReset();
    mocks.patch.mockReset();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("highlights the section when error records exist", async () => {
    mocks.get.mockResolvedValue({
      data: [
        {
          id: "err-1",
          createdAt: 100,
          source: "runner.tick",
          status: "new",
          message: "Execution failed",
        },
      ],
    });

    renderLogs();

    const section = screen.getByTestId("slow-trading-log-section-errors");
    // PROD:ERROR_LOG_HIGHLIGHT
    await waitFor(() => {
      expect(section.getAttribute("data-has-records")).toBe("true");
    });
    expect(screen.getByText("1 new / 1 total")).toBeDefined();
    expect(screen.getByTestId("ErrorOutlineIcon")).toBeDefined();
  });

  it("keeps the normal section style when the error log is empty", async () => {
    mocks.get.mockResolvedValue({ data: [] });

    renderLogs();

    const section = screen.getByTestId("slow-trading-log-section-errors");
    await waitFor(() => {
      expect(screen.getByText("0 new / 0 total")).toBeDefined();
    });
    expect(section.getAttribute("data-has-records")).toBe("false");
    expect(screen.queryByTestId("ErrorOutlineIcon")).toBeNull();
  });

  it("does not highlight solved or dismissed errors", async () => {
    mocks.get.mockResolvedValue({
      data: [
        { id: "solved", createdAt: 1, source: "test", message: "a", status: "solved" },
        { id: "dismissed", createdAt: 2, source: "test", message: "b", status: "dismissed" },
      ],
    });

    renderLogs();

    const section = screen.getByTestId("slow-trading-log-section-errors");
    await waitFor(() => {
      expect(section.getAttribute("data-has-records")).toBe("false");
    });
    expect(screen.getByText("0 new / 2 total")).toBeDefined();
  });

  it("keeps loaded rows visible during a background refresh", async () => {
    let refresh = () => {};
    const intervalSpy = vi
      .spyOn(window, "setInterval")
      .mockImplementation((handler, timeout) => {
        if (timeout === 30_000) {
          refresh = handler as () => void;
        }
        return 1 as unknown as ReturnType<typeof window.setInterval>;
      });
    const rows = [
      {
        createdAt: 100,
        id: "err-1",
        message: "Execution failed",
        source: "runner.tick",
        status: "new" as const,
      },
    ];
    let finishRefresh: ((value: { data: typeof rows }) => void) | undefined;
    mocks.get
      .mockResolvedValueOnce({ data: rows })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRefresh = resolve;
          }),
      );

    const user = userEvent.setup();
    renderLogs();
    await screen.findByText("1 new / 1 total");
    await user.click(screen.getByTestId("ExpandMoreIcon").closest("button")!);
    expect(await screen.findByText("Execution failed")).toBeDefined();

    refresh();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Execution failed")).toBeDefined();
    expect(screen.queryByText("Loading logs...")).toBeNull();

    finishRefresh?.({ data: rows });
    intervalSpy.mockRestore();
  });

  it("bulk solves selected new errors", async () => {
    const user = userEvent.setup();
    const rows = [
      { id: "err-1", createdAt: 1, source: "test", message: "first", status: "new" as const },
      { id: "err-2", createdAt: 2, source: "test", message: "second", status: "new" as const },
    ];
    mocks.get.mockResolvedValue({ data: rows });
    mocks.patch.mockResolvedValue({
      data: { updated: rows.map((row) => ({ ...row, status: "solved" })) },
    });

    renderLogs();
    await screen.findByText("2 new / 2 total");
    await user.click(screen.getByTestId("ExpandMoreIcon").closest("button")!);
    await user.click(await screen.findByLabelText("Select visible errors"));
    await user.click(screen.getByRole("button", { name: "Solve Selected" }));

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith(
        expect.any(String),
        { ids: ["err-1", "err-2"], status: "solved" },
        { params: { kind: "errors" } },
      );
    });
  });
});
