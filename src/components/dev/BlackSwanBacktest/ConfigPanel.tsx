"use client";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import type { BlackSwanConfig } from "@/lib/trading/black-swan";

export interface BlackSwanBacktestForm {
  config: BlackSwanConfig;
  endTime: string;
  startTime: string;
  symbolsText: string;
  useCache: boolean;
}

interface Props {
  disabled: boolean;
  form: BlackSwanBacktestForm;
  onChange: (next: BlackSwanBacktestForm) => void;
  onRun: () => void;
}

function NumberSetting(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <TextField
      fullWidth
      label={props.label}
      onChange={(event) => props.onChange(Number(event.target.value))}
      slotProps={{ htmlInput: { min: 0.01, step: 0.1 } }}
      type="number"
      value={props.value}
    />
  );
}

export default function ConfigPanel({
  disabled,
  form,
  onChange,
  onRun,
}: Props) {
  const patchConfig = (config: BlackSwanConfig) =>
    onChange({ ...form, config });

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h6" fontWeight={700}>
        Incident and detector configuration
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Replays Binance USDT perpetual-futures 1-minute candles. A 65-minute
        warm-up is loaded before the selected window and never displayed as a
        test result.
      </Typography>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        <TextField
          fullWidth
          label="Symbols"
          helperText="Comma-separated. BTC is always included; maximum 30 symbols."
          value={form.symbolsText}
          onChange={(event) =>
            onChange({ ...form, symbolsText: event.target.value })
          }
        />
        <TextField
          select
          fullWidth
          label="Emergency exit policy"
          value={form.config.exitPolicy}
          onChange={(event) =>
            patchConfig({
              ...form.config,
              exitPolicy: event.target.value as BlackSwanConfig["exitPolicy"],
            })
          }
        >
          <MenuItem value="FREEZE_ONLY">Freeze only</MenuItem>
          <MenuItem value="CLOSE_ADVERSE">Close adverse positions</MenuItem>
          <MenuItem value="FLATTEN_ALL">Flatten all positions</MenuItem>
        </TextField>
        <TextField
          fullWidth
          label="Start (local time)"
          type="datetime-local"
          value={form.startTime}
          onChange={(event) =>
            onChange({ ...form, startTime: event.target.value })
          }
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          fullWidth
          label="End (local time)"
          type="datetime-local"
          value={form.endTime}
          onChange={(event) =>
            onChange({ ...form, endTime: event.target.value })
          }
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3, mb: 1.5 }}>
        BTC warning and hard triggers (%)
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(5, minmax(0, 1fr))",
          },
        }}
      >
        <NumberSetting
          label="Warning 5m"
          value={form.config.btcWarning.fiveMinuteDrawdownPct}
          onChange={(value) =>
            patchConfig({
              ...form.config,
              btcWarning: {
                ...form.config.btcWarning,
                fiveMinuteDrawdownPct: value,
              },
            })
          }
        />
        <NumberSetting
          label="Warning 15m"
          value={form.config.btcWarning.fifteenMinuteDrawdownPct}
          onChange={(value) =>
            patchConfig({
              ...form.config,
              btcWarning: {
                ...form.config.btcWarning,
                fifteenMinuteDrawdownPct: value,
              },
            })
          }
        />
        <NumberSetting
          label="Hard 5m"
          value={form.config.btcHardTrigger.fiveMinuteDrawdownPct}
          onChange={(value) =>
            patchConfig({
              ...form.config,
              btcHardTrigger: {
                ...form.config.btcHardTrigger,
                fiveMinuteDrawdownPct: value,
              },
            })
          }
        />
        <NumberSetting
          label="Hard 15m"
          value={form.config.btcHardTrigger.fifteenMinuteDrawdownPct}
          onChange={(value) =>
            patchConfig({
              ...form.config,
              btcHardTrigger: {
                ...form.config.btcHardTrigger,
                fifteenMinuteDrawdownPct: value,
              },
            })
          }
        />
        <NumberSetting
          label="Hard 60m"
          value={form.config.btcHardTrigger.sixtyMinuteDrawdownPct}
          onChange={(value) =>
            patchConfig({
              ...form.config,
              btcHardTrigger: {
                ...form.config.btcHardTrigger,
                sixtyMinuteDrawdownPct: value,
              },
            })
          }
        />
      </Box>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3, mb: 1.5 }}>
        Systemic breadth confirmation
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(4, minmax(0, 1fr))",
          },
        }}
      >
        <NumberSetting
          label="Window (minutes)"
          value={form.config.breadthConfirmation.windowMinutes}
          onChange={(value) =>
            patchConfig({
              ...form.config,
              breadthConfirmation: {
                ...form.config.breadthConfirmation,
                windowMinutes: value,
              },
            })
          }
        />
        <NumberSetting
          label="Alt drawdown (%)"
          value={form.config.breadthConfirmation.altDrawdownPct}
          onChange={(value) =>
            patchConfig({
              ...form.config,
              breadthConfirmation: {
                ...form.config.breadthConfirmation,
                altDrawdownPct: value,
              },
            })
          }
        />
        <NumberSetting
          label="Affected symbols (%)"
          value={form.config.breadthConfirmation.affectedSymbolsPct}
          onChange={(value) =>
            patchConfig({
              ...form.config,
              breadthConfirmation: {
                ...form.config.breadthConfirmation,
                affectedSymbolsPct: value,
              },
            })
          }
        />
        <NumberSetting
          label="Minimum valid symbols"
          value={form.config.breadthConfirmation.minimumValidSymbols}
          onChange={(value) =>
            patchConfig({
              ...form.config,
              breadthConfirmation: {
                ...form.config.breadthConfirmation,
                minimumValidSymbols: value,
              },
            })
          }
        />
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 2,
          mt: 2.5,
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              checked={form.useCache}
              onChange={(event) =>
                onChange({ ...form, useCache: event.target.checked })
              }
            />
          }
          label="Reuse raw-candle cache"
        />
        <Button
          disabled={disabled}
          onClick={onRun}
          size="large"
          startIcon={<PlayArrowIcon />}
          variant="contained"
        >
          {disabled ? "Running candle replay…" : "Run Black Swan backtest"}
        </Button>
      </Box>
    </Paper>
  );
}
