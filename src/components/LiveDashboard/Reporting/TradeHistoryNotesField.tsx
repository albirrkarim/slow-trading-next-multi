"use client";

import { endpoints } from "@/components/endpoints";
import type {
  SlowTradingDashboardState,
  SlowTradingMode,
} from "@/lib/slowTrading";
import { TextField } from "@mui/material";
import axios from "axios";
import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import type { SlowTradingReportRow } from "./types";

export default function TradeHistoryNotesField({
  mode,
  onHistoryChange,
  readOnly,
  row,
}: {
  mode: SlowTradingMode;
  onHistoryChange: (history: SlowTradingDashboardState["history"]) => void;
  readOnly: boolean;
  row: SlowTradingReportRow;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [draft, setDraft] = useState(row.notes ?? "");
  const [saved, setSaved] = useState((row.notes ?? "").trim());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = row.notes ?? "";
    setDraft(next);
    setSaved(next.trim());
  }, [row.notes]);

  const saveNotes = async () => {
    const normalized = draft.trim();
    if (readOnly || saving || normalized === saved) {
      return;
    }

    setSaving(true);
    try {
      // PROD:TRADE_HISTORY_NOTES
      const response = await axios.patch<{
        state?: SlowTradingDashboardState;
      }>(endpoints.slow.prod.history, {
        mode,
        symbol: row.symbol,
        entryId: row.opened.vPoint.id,
        entryTime: row.opened.t,
        exitTime: row.closed?.t,
        quantity: row.exposure.quantity,
        usdt: row.exposure.notionalUsdt,
        notes: normalized,
      });

      setDraft(normalized);
      setSaved(normalized);
      onHistoryChange(response.data.state?.history ?? []);
    } catch (error: any) {
      enqueueSnackbar(
        `Failed to save ${row.symbol} notes: ${error.response?.data?.error || error.message}`,
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <TextField
      aria-label={`Notes for ${row.symbol}`}
      disabled={saving}
      fullWidth
      label="Notes"
      maxRows={5}
      minRows={2}
      multiline
      onBlur={() => {
        void saveNotes();
      }}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="Add trade notes"
      size="small"
      slotProps={{ input: { readOnly } }}
      sx={{ mt: 1, minWidth: 210 }}
      value={draft}
    />
  );
}
