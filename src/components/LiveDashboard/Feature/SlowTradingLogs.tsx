"use client";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import DoNotDisturbAltIcon from "@mui/icons-material/DoNotDisturbAlt";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ReplayIcon from "@mui/icons-material/Replay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  alpha,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useSnackbar } from "notistack";

import { endpoints } from "@/components/endpoints";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import type {
  SlowTradingErrorLogEntry,
  SlowTradingErrorStatus,
  SlowTradingLogKind,
  SlowTradingManagementLogEntry,
  SlowTradingSafeHavenLogEntry,
  SlowTradingWithdrawalLogEntry,
} from "@/lib/slowTrading";

type LogEntryByKind = {
  management: SlowTradingManagementLogEntry;
  safe_haven: SlowTradingSafeHavenLogEntry;
  withdrawals: SlowTradingWithdrawalLogEntry;
};
type GenericLogKind = Exclude<SlowTradingLogKind, "errors">;

const DELETE_ALL_ID = "__delete_all__";
const ERROR_LOG_POLL_INTERVAL_MS = 30_000;
type ErrorLogFilter = SlowTradingErrorStatus | "all";

function DeleteLogButton(props: {
  deleting: boolean;
  disabled: boolean;
  onDelete: () => void;
}) {
  const { deleting, disabled, onDelete } = props;

  return (
    <Tooltip title="Delete log record">
      <span>
        <IconButton
          aria-label="Delete log record"
          color="error"
          disabled={disabled}
          onClick={onDelete}
          size="small"
        >
          {deleting ? (
            <CircularProgress color="inherit" size={18} />
          ) : (
            <DeleteOutlineIcon fontSize="small" />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}

function formatTime(timestamp: number) {
  if (!Number.isFinite(timestamp)) {
    return "-";
  }

  return new Date(timestamp).toLocaleString();
}

function formatUsdt(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return `$${value.toFixed(2)}`;
}

function LogsTableShell(props: {
  children: React.ReactNode;
  emptyLabel: string;
  error: string | null;
  loading: boolean;
  rowCount: number;
}) {
  const { children, emptyLabel, error, loading, rowCount } = props;

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Loading logs...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error" variant="body2" sx={{ py: 2 }}>
        {error}
      </Typography>
    );
  }

  if (rowCount === 0) {
    return (
      <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
        {emptyLabel}
      </Typography>
    );
  }

  return (
    <TableContainer sx={{ mt: 1, maxHeight: 320 }}>
      <Table stickyHeader size="small">
        {children}
      </Table>
    </TableContainer>
  );
}

function ErrorLogTable(props: {
  deletingId: string | null;
  error: string | null;
  loading: boolean;
  onCopy: (row: SlowTradingErrorLogEntry) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onStatus: (ids: string[], status: SlowTradingErrorStatus) => void;
  rows: SlowTradingErrorLogEntry[];
  selectedIds: Set<string>;
  updating: boolean;
}) {
  const {
    deletingId,
    error,
    loading,
    onCopy,
    onDelete,
    onSelect,
    onSelectAll,
    onStatus,
    rows,
    selectedIds,
    updating,
  } = props;
  const selectedVisible = rows.filter((row) => selectedIds.has(row.id)).length;
  const allSelected = rows.length > 0 && selectedVisible === rows.length;

  return (
    <LogsTableShell
      emptyLabel="No error logs match this status."
      error={error}
      loading={loading}
      rowCount={rows.length}
    >
      <TableHead>
        <TableRow>
          <TableCell padding="checkbox">
            <Checkbox
              checked={allSelected}
              disabled={rows.length === 0 || updating}
              indeterminate={selectedVisible > 0 && !allSelected}
              inputProps={{ "aria-label": "Select visible errors" }}
              onChange={(_, checked) => onSelectAll(checked)}
              size="small"
            />
          </TableCell>
          <TableCell>Time</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>Source</TableCell>
          <TableCell>Message</TableCell>
          <TableCell align="right">Action</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            data-status={row.status}
            key={row.id}
            sx={(theme) => ({
              backgroundColor:
                row.status === "new"
                  ? alpha(theme.palette.error.main, 0.1)
                  : row.status === "solved"
                    ? alpha(theme.palette.success.main, 0.1)
                    : alpha(theme.palette.text.primary, 0.035),
              "& > td:first-of-type": {
                borderLeft: `4px solid ${
                  row.status === "new"
                    ? theme.palette.error.main
                    : row.status === "solved"
                      ? theme.palette.success.main
                      : theme.palette.divider
                }`,
              },
            })}
          >
            <TableCell padding="checkbox">
              <Checkbox
                checked={selectedIds.has(row.id)}
                disabled={updating}
                inputProps={{ "aria-label": `Select error ${row.id}` }}
                onChange={(_, checked) => onSelect(row.id, checked)}
                size="small"
              />
            </TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>
              {formatTime(row.createdAt)}
            </TableCell>
            <TableCell>
              <Chip
                color={
                  row.status === "new"
                    ? "error"
                    : row.status === "solved"
                      ? "success"
                      : "default"
                }
                label={row.status}
                size="small"
                variant={row.status === "dismissed" ? "outlined" : "filled"}
              />
            </TableCell>
            <TableCell>{row.source}</TableCell>
            <TableCell>{row.message}</TableCell>
            <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
              <Tooltip title="Copy error JSON">
                <IconButton
                  aria-label={`Copy error ${row.id} JSON`}
                  onClick={() => onCopy(row)}
                  size="small"
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {row.status !== "dismissed" && (
                <Tooltip title="Dismiss error">
                  <span>
                    <IconButton
                      aria-label={`Dismiss error ${row.id}`}
                      disabled={updating}
                      onClick={() => onStatus([row.id], "dismissed")}
                      size="small"
                    >
                      <DoNotDisturbAltIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              {row.status !== "solved" && (
                <Tooltip title="Mark error solved">
                  <span>
                    <IconButton
                      aria-label={`Solve error ${row.id}`}
                      color="success"
                      disabled={updating}
                      onClick={() => onStatus([row.id], "solved")}
                      size="small"
                    >
                      <CheckCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              {row.status !== "new" && (
                <Tooltip title="Reopen error">
                  <span>
                    <IconButton
                      aria-label={`Reopen error ${row.id}`}
                      color="error"
                      disabled={updating}
                      onClick={() => onStatus([row.id], "new")}
                      size="small"
                    >
                      <ReplayIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              <DeleteLogButton
                deleting={deletingId === row.id}
                disabled={deletingId !== null || updating}
                onDelete={() => onDelete(row.id)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </LogsTableShell>
  );
}

function SafeHavenLogTable(props: {
  deletingId: string | null;
  error: string | null;
  loading: boolean;
  onDelete: (id: string) => void;
  rows: SlowTradingSafeHavenLogEntry[];
}) {
  const { deletingId, error, loading, onDelete, rows } = props;

  return (
    <LogsTableShell
      emptyLabel="No Safe Haven logs recorded yet."
      error={error}
      loading={loading}
      rowCount={rows.length}
    >
      <TableHead>
        <TableRow>
          <TableCell>Time</TableCell>
          <TableCell>Mode</TableCell>
          <TableCell>Source</TableCell>
          <TableCell>Before</TableCell>
          <TableCell>After</TableCell>
          <TableCell>Delta</TableCell>
          <TableCell>Reason</TableCell>
          <TableCell align="right">Action</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell sx={{ whiteSpace: "nowrap" }}>
              {formatTime(row.createdAt)}
            </TableCell>
            <TableCell>{row.mode}</TableCell>
            <TableCell>{row.source}</TableCell>
            <TableCell>{formatUsdt(row.previousUSDT)}</TableCell>
            <TableCell>{formatUsdt(row.nextUSDT)}</TableCell>
            <TableCell>{row.deltaUSDT}</TableCell>
            <TableCell>{row.reason ?? "-"}</TableCell>
            <TableCell align="right">
              <DeleteLogButton
                deleting={deletingId === row.id}
                disabled={deletingId !== null}
                onDelete={() => onDelete(row.id)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </LogsTableShell>
  );
}

function WithdrawalLogTable(props: {
  deletingId: string | null;
  error: string | null;
  loading: boolean;
  onDelete: (id: string) => void;
  rows: SlowTradingWithdrawalLogEntry[];
}) {
  const { deletingId, error, loading, onDelete, rows } = props;

  return (
    <LogsTableShell
      emptyLabel="No withdrawal logs recorded yet."
      error={error}
      loading={loading}
      rowCount={rows.length}
    >
      <TableHead>
        <TableRow>
          <TableCell>Time</TableCell>
          <TableCell>Trigger</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>Schedule</TableCell>
          <TableCell>Amount</TableCell>
          <TableCell>Network</TableCell>
          <TableCell>Message</TableCell>
          <TableCell align="right">Action</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell sx={{ whiteSpace: "nowrap" }}>
              {formatTime(row.createdAt)}
            </TableCell>
            <TableCell>{row.trigger}</TableCell>
            <TableCell>{row.status}</TableCell>
            <TableCell>{row.scheduleName ?? row.scheduleId}</TableCell>
            <TableCell>{formatUsdt(row.amountUSDT)}</TableCell>
            <TableCell>{row.targetNetwork ?? "-"}</TableCell>
            <TableCell>{row.message}</TableCell>
            <TableCell align="right">
              <DeleteLogButton
                deleting={deletingId === row.id}
                disabled={deletingId !== null}
                onDelete={() => onDelete(row.id)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </LogsTableShell>
  );
}

function ManagementLogTable(props: {
  deletingId: string | null;
  error: string | null;
  loading: boolean;
  onDelete: (id: string) => void;
  rows: SlowTradingManagementLogEntry[];
}) {
  const { deletingId, error, loading, onDelete, rows } = props;

  return (
    <LogsTableShell
      emptyLabel="No Coin Management logs recorded yet."
      error={error}
      loading={loading}
      rowCount={rows.length}
    >
      <TableHead>
        <TableRow>
          <TableCell>Time</TableCell>
          <TableCell>Action</TableCell>
          <TableCell>Symbol</TableCell>
          <TableCell>Source</TableCell>
          <TableCell>Reason</TableCell>
          <TableCell align="right">Delete</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell sx={{ whiteSpace: "nowrap" }}>
              {formatTime(row.createdAt)}
            </TableCell>
            <TableCell>
              <Chip
                color={row.action === "add" ? "success" : "error"}
                label={row.action === "add" ? "Add" : "Remove"}
                size="small"
                variant="outlined"
              />
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{row.symbol}</TableCell>
            <TableCell>{row.source}</TableCell>
            <TableCell>{row.reason}</TableCell>
            <TableCell align="right">
              <DeleteLogButton
                deleting={deletingId === row.id}
                disabled={deletingId !== null}
                onDelete={() => onDelete(row.id)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </LogsTableShell>
  );
}

function SlowTradingLogSection<K extends GenericLogKind>(props: {
  kind: K;
  renderTable: (params: {
    deletingId: string | null;
    error: string | null;
    loading: boolean;
    onDelete: (id: string) => void;
    rows: LogEntryByKind[K][];
  }) => React.ReactNode;
  title: string;
}) {
  const { kind, renderTable, title } = props;
  const [rows, setRows] = useState<LogEntryByKind[K][]>([]);
  const [requested, setRequested] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);

  const loadRows = useCallback(async () => {
    if (requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    setRequested(true);
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<LogEntryByKind[K][]>(
        endpoints.slow.prod.logs,
        {
          params: { kind },
        },
      );
      setRows(response.data);
      setLoaded(true);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.error ??
        requestError?.message ??
        "Failed to load logs",
      );
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  }, [kind]);

  const deleteRow = useCallback(
    async (id: string) => {
      if (!confirm("Delete this log record permanently?")) {
        return;
      }

      setDeletingId(id);
      setError(null);
      try {
        await axios.delete(endpoints.slow.prod.logs, {
          params: { id, kind },
        });
        setRows((current) => current.filter((row) => row.id !== id));
      } catch (requestError: any) {
        setError(
          requestError?.response?.data?.error ??
          requestError?.message ??
          "Failed to delete log record",
        );
      } finally {
        setDeletingId(null);
      }
    },
    [kind],
  );

  const clearRows = useCallback(async () => {
    if (
      rows.length === 0 ||
      !confirm(`Delete all ${title} permanently? This cannot be undone.`)
    ) {
      return;
    }

    setDeletingId(DELETE_ALL_ID);
    setError(null);
    try {
      await axios.delete(endpoints.slow.prod.logs, {
        params: { all: "true", kind },
      });
      setRows([]);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.error ??
        requestError?.message ??
        "Failed to delete all log records",
      );
    } finally {
      setDeletingId(null);
    }
  }, [kind, rows.length, title]);

  return (
    <Box
      data-testid={`slow-trading-log-section-${kind}`}
    >
      <HeaderMetrics
        defaultExpanded={false}
        rememberExpand={`slow-trading-logs:${kind}`}
        title={
          <Stack alignItems="center" direction="row" spacing={0.75}>
            <Typography
              color="text.primary"
              variant="body1"
              sx={{ fontWeight: "bold" }}
            >
              {title}
            </Typography>
          </Stack>
        }
        titleRight={
          <Stack direction="row" spacing={1} alignItems="center">
            {requested && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ whiteSpace: "nowrap" }}
              >
                {loading && !loaded
                  ? "Loading..."
                  : `${rows.length} latest`}
              </Typography>
            )}
            <Button
              color="error"
              disabled={!requested || rows.length === 0 || deletingId !== null}
              onClick={() => {
                void clearRows();
              }}
              size="small"
              startIcon={
                deletingId === DELETE_ALL_ID ? (
                  <CircularProgress color="inherit" size={16} />
                ) : (
                  <DeleteSweepIcon fontSize="small" />
                )
              }
              sx={{ whiteSpace: "nowrap" }}
            >
              Delete All
            </Button>
          </Stack>
        }
      >
        {(expanded) => (
          <SlowTradingLogSectionContent
            error={error}
            deletingId={deletingId}
            expanded={expanded}
            loading={loading}
            onLoad={loadRows}
            onDelete={deleteRow}
            renderTable={renderTable}
            requested={requested}
            rows={rows}
          />
        )}
      </HeaderMetrics>
    </Box>
  );
}

function SlowTradingLogSectionContent<K extends GenericLogKind>(props: {
  deletingId: string | null;
  error: string | null;
  expanded: boolean;
  loading: boolean;
  onLoad: () => Promise<void>;
  onDelete: (id: string) => void;
  renderTable: (params: {
    deletingId: string | null;
    error: string | null;
    loading: boolean;
    onDelete: (id: string) => void;
    rows: LogEntryByKind[K][];
  }) => React.ReactNode;
  requested: boolean;
  rows: LogEntryByKind[K][];
}) {
  const {
    error,
    deletingId,
    expanded,
    loading,
    onLoad,
    onDelete,
    renderTable,
    requested,
    rows,
  } = props;

  useEffect(() => {
    if (expanded && !requested) {
      void onLoad();
    }
  }, [expanded, onLoad, requested]);

  if (!expanded) {
    return null;
  }

  return <>{renderTable({ deletingId, error, loading, onDelete, rows })}</>;
}

export function SlowTradingErrorLogs() {
  const { enqueueSnackbar } = useSnackbar();
  const loadedRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const [rows, setRows] = useState<SlowTradingErrorLogEntry[]>([]);
  const [filter, setFilter] = useState<ErrorLogFilter>("new");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: rows.length,
      dismissed: rows.filter((row) => row.status === "dismissed").length,
      new: rows.filter((row) => row.status === "new").length,
      solved: rows.filter((row) => row.status === "solved").length,
    }),
    [rows],
  );
  const visibleRows = useMemo(
    () =>
      filter === "all" ? rows : rows.filter((row) => row.status === filter),
    [filter, rows],
  );
  const hasNewErrors = counts.new > 0;

  const loadRows = useCallback(async () => {
    if (requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    const isInitialLoad = !loadedRef.current;
    if (isInitialLoad) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await axios.get<SlowTradingErrorLogEntry[]>(
        endpoints.slow.prod.logs,
        { params: { kind: "errors" } },
      );
      setRows(response.data);
      setSelectedIds((current) => {
        const available = new Set(response.data.map((row) => row.id));
        return new Set([...current].filter((id) => available.has(id)));
      });
      setLoaded(true);
      loadedRef.current = true;
    } catch (requestError: any) {
      if (isInitialLoad) {
        setError(
          requestError?.response?.data?.error ??
            requestError?.message ??
            "Failed to load error logs",
        );
      }
    } finally {
      requestInFlightRef.current = false;
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadRows();
    const intervalId = window.setInterval(() => {
      void loadRows();
    }, ERROR_LOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadRows]);

  const updateStatus = useCallback(
    async (ids: string[], status: SlowTradingErrorStatus) => {
      setUpdating(true);
      setError(null);
      try {
        const response = await axios.patch<{
          updated: SlowTradingErrorLogEntry[];
        }>(
          endpoints.slow.prod.logs,
          { ids, status },
          { params: { kind: "errors" } },
        );
        const updatedById = new Map(
          response.data.updated.map((entry) => [entry.id, entry]),
        );
        setRows((current) =>
          current.map((entry) => updatedById.get(entry.id) ?? entry),
        );
        setSelectedIds((current) => {
          const next = new Set(current);
          ids.forEach((id) => next.delete(id));
          return next;
        });
        enqueueSnackbar(
          `${ids.length} ${ids.length === 1 ? "error" : "errors"} marked ${status}`,
          { variant: "success" },
        );
      } catch (requestError: any) {
        setError(
          requestError?.response?.data?.error ??
            requestError?.message ??
            "Failed to update error status",
        );
      } finally {
        setUpdating(false);
      }
    },
    [enqueueSnackbar],
  );

  const deleteRow = useCallback(async (id: string) => {
    if (!confirm("Delete this error permanently?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await axios.delete(endpoints.slow.prod.logs, {
        params: { id, kind: "errors" },
      });
      setRows((current) => current.filter((row) => row.id !== id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.error ??
          requestError?.message ??
          "Failed to delete error log",
      );
    } finally {
      setDeletingId(null);
    }
  }, []);

  const clearRows = useCallback(async () => {
    if (
      rows.length === 0 ||
      !confirm("Delete all Error Logs permanently? This cannot be undone.")
    ) {
      return;
    }
    setDeletingId(DELETE_ALL_ID);
    setError(null);
    try {
      await axios.delete(endpoints.slow.prod.logs, {
        params: { all: "true", kind: "errors" },
      });
      setRows([]);
      setSelectedIds(new Set());
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.error ??
          requestError?.message ??
          "Failed to delete all error logs",
      );
    } finally {
      setDeletingId(null);
    }
  }, [rows.length]);

  const copyJson = useCallback(
    async (value: SlowTradingErrorLogEntry | SlowTradingErrorLogEntry[]) => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
        enqueueSnackbar("Error JSON copied", { variant: "success" });
      } catch {
        enqueueSnackbar("Failed to copy error JSON", { variant: "error" });
      }
    },
    [enqueueSnackbar],
  );

  const selected = [...selectedIds];

  return (
    <Box
      data-has-records={hasNewErrors ? "true" : "false"}
      data-testid="slow-trading-log-section-errors"
      sx={(theme) => ({
        ...(hasNewErrors && {
          backgroundColor: alpha(theme.palette.error.main, 0.12),
          border: `1px solid ${theme.palette.error.main}`,
          borderLeftWidth: 5,
          borderRadius: 1,
          p: 1,
        }),
      })}
    >
      <HeaderMetrics
        defaultExpanded={false}
        rememberExpand="slow-trading-logs:errors"
        title={
          <Stack alignItems="center" direction="row" spacing={0.75}>
            {hasNewErrors && <ErrorOutlineIcon color="error" fontSize="small" />}
            <Typography
              color={hasNewErrors ? "error.main" : "text.primary"}
              sx={{ fontWeight: "bold" }}
              variant="body1"
            >
              Error Logs
            </Typography>
          </Stack>
        }
        titleRight={
          <Stack
            alignItems="center"
            direction="row"
            flexWrap="wrap"
            justifyContent="flex-end"
            spacing={1}
          >
            <Typography
              color={hasNewErrors ? "error.main" : "text.secondary"}
              sx={{ fontWeight: hasNewErrors ? 700 : 400, whiteSpace: "nowrap" }}
              variant="caption"
            >
              {loading && !loaded
                ? "Loading..."
                : `${counts.new} new / ${counts.all} total`}
            </Typography>
            <Button
              disabled={counts.new === 0}
              onClick={() => void copyJson(rows.filter((row) => row.status === "new"))}
              size="small"
              startIcon={<ContentCopyIcon fontSize="small" />}
            >
              Copy New
            </Button>
            <Button
              color="error"
              disabled={rows.length === 0 || deletingId !== null}
              onClick={() => void clearRows()}
              size="small"
              startIcon={
                deletingId === DELETE_ALL_ID ? (
                  <CircularProgress color="inherit" size={16} />
                ) : (
                  <DeleteSweepIcon fontSize="small" />
                )
              }
            >
              Delete All
            </Button>
          </Stack>
        }
      >
        {(expanded) =>
          expanded && (
            <Stack spacing={1.25} sx={{ pt: 1 }}>
              <Stack
                alignItems="center"
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                spacing={1}
              >
                <ToggleButtonGroup
                  aria-label="Error status filter"
                  exclusive
                  onChange={(_, value: ErrorLogFilter | null) => {
                    if (value) setFilter(value);
                  }}
                  size="small"
                  value={filter}
                >
                  <ToggleButton value="new">New {counts.new}</ToggleButton>
                  <ToggleButton value="solved">Solved {counts.solved}</ToggleButton>
                  <ToggleButton value="dismissed">
                    Dismissed {counts.dismissed}
                  </ToggleButton>
                  <ToggleButton value="all">All {counts.all}</ToggleButton>
                </ToggleButtonGroup>
                <Stack direction="row" spacing={1}>
                  <Button
                    disabled={selected.length === 0 || updating}
                    onClick={() => void updateStatus(selected, "dismissed")}
                    size="small"
                    startIcon={<DoNotDisturbAltIcon />}
                  >
                    Dismiss Selected
                  </Button>
                  <Button
                    color="success"
                    disabled={selected.length === 0 || updating}
                    onClick={() => void updateStatus(selected, "solved")}
                    size="small"
                    startIcon={<CheckCircleOutlineIcon />}
                  >
                    Solve Selected
                  </Button>
                </Stack>
              </Stack>
              <ErrorLogTable
                deletingId={deletingId}
                error={error}
                loading={loading}
                onCopy={(row) => void copyJson(row)}
                onDelete={(id) => void deleteRow(id)}
                onSelect={(id, checked) => {
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    if (checked) next.add(id);
                    else next.delete(id);
                    return next;
                  });
                }}
                onSelectAll={(checked) => {
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    visibleRows.forEach((row) => {
                      if (checked) next.add(row.id);
                      else next.delete(row.id);
                    });
                    return next;
                  });
                }}
                onStatus={(ids, status) => void updateStatus(ids, status)}
                rows={visibleRows}
                selectedIds={selectedIds}
                updating={updating}
              />
            </Stack>
          )
        }
      </HeaderMetrics>
    </Box>
  );
}

export function SlowTradingSafeHavenLogs() {
  return (
    <SlowTradingLogSection
      kind="safe_haven"
      title="Safe Haven Logs"
      renderTable={(params) => <SafeHavenLogTable {...params} />}
    />
  );
}

export function SlowTradingManagementLogs() {
  return (
    <SlowTradingLogSection
      kind="management"
      title="Coin Management Logs"
      renderTable={(params) => <ManagementLogTable {...params} />}
    />
  );
}

export function SlowTradingWithdrawalLogs() {
  return (
    <SlowTradingLogSection
      kind="withdrawals"
      title="Withdrawal Logs"
      renderTable={(params) => <WithdrawalLogTable {...params} />}
    />
  );
}

export default function SlowTradingLogsPanel() {
  return (
    <Stack spacing={2}>
      <SlowTradingErrorLogs />
      <SlowTradingManagementLogs />
      <SlowTradingSafeHavenLogs />
      <SlowTradingWithdrawalLogs />
    </Stack>
  );
}
