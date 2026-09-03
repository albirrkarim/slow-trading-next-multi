"use client";

import { useMemo, useState } from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";

import type { SlowTradingAccountTradingConfig } from "@/lib/slowTrading";
import tradingConfigJson from "./trading-config-json";

interface TradingConfigJsonEditorProps {
  accountName: string;
  onApply: (config: SlowTradingAccountTradingConfig) => void;
  tradingConfig: SlowTradingAccountTradingConfig;
}

export default function TradingConfigJsonEditor({
  accountName,
  onApply,
  tradingConfig,
}: TradingConfigJsonEditorProps) {
  const initialJson = useMemo(
    () => tradingConfigJson.stringify(tradingConfig),
    [tradingConfig],
  );
  const [raw, setRaw] = useState(initialJson);
  const [message, setMessage] = useState<{
    severity: "error" | "success";
    text: string;
  } | null>(null);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setMessage({
        severity: "success",
        text: `${accountName} Trading configuration copied.`,
      });
    } catch {
      setMessage({
        severity: "error",
        text: "Could not access the clipboard. Select and copy the JSON manually.",
      });
    }
  };

  const applyJson = () => {
    try {
      const parsed = tradingConfigJson.parse(raw);
      onApply(parsed);
      setRaw(tradingConfigJson.stringify(parsed));
      setMessage({
        severity: "success",
        text: `JSON applied to ${accountName}'s settings draft. Choose Save to persist it.`,
      });
    } catch (error) {
      setMessage({
        severity: "error",
        text:
          error instanceof Error
            ? error.message
            : "The Trading configuration could not be applied.",
      });
    }
  };

  return (
    <Stack gap={1.5}>
      {message && <Alert severity={message.severity}>{message.text}</Alert>}

      <TextField
        error={message?.severity === "error"}
        fullWidth
        label="Trading configuration JSON"
        minRows={20}
        multiline
        onChange={(event) => {
          setRaw(event.target.value);
          if (message) setMessage(null);
        }}
        slotProps={{
          htmlInput: {
            spellCheck: false,
            sx: {
              fontFamily: "monospace",
              fontSize: "0.82rem",
              lineHeight: 1.5,
            },
          },
        }}
        value={raw}
      />

      <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
        <Button
          onClick={() => {
            void copyJson();
          }}
          startIcon={<ContentCopyRoundedIcon />}
          variant="outlined"
        >
          Copy Trading JSON
        </Button>
        <Button
          onClick={applyJson}
          startIcon={<CheckRoundedIcon />}
          variant="contained"
        >
          Apply JSON to {accountName}
        </Button>
      </Stack>
    </Stack>
  );
}
