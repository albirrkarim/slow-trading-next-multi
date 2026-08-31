"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Button,
  Checkbox,
  FormControlLabel,
  Grid,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

import type { PostAverageStopLossConfig } from "@/lib/trading/models";
import postAverageStopLoss from "@/lib/trading/post-average-stop-loss";

export default function PostAverageStopLossSettings({
  onChange,
  value,
}: {
  onChange: (config: PostAverageStopLossConfig) => void;
  value?: PostAverageStopLossConfig;
}) {
  const config = postAverageStopLoss.config.normalize(value);

  const updateThreshold = (
    index: number,
    patch: Partial<PostAverageStopLossConfig["thresholds"][number]>,
  ) => {
    onChange({
      ...config,
      thresholds: config.thresholds.map((threshold, thresholdIndex) =>
        thresholdIndex === index ? { ...threshold, ...patch } : threshold,
      ),
    });
  };

  const addThreshold = () => {
    const largestCount = config.thresholds.reduce(
      (largest, threshold) => Math.max(largest, threshold.minAveragingCount),
      0,
    );
    onChange({
      ...config,
      thresholds: [
        ...config.thresholds,
        {
          maxNetPnlPct: 0,
          maxNetPnlUsdt: 0,
          minAveragingCount: largestCount + 1,
        },
      ],
    });
  };

  return (
    <Stack spacing={1.5}>
      <FormControlLabel
        control={
          <Checkbox
            checked={config.enabled}
            onChange={(event) =>
              onChange({ ...config, enabled: event.target.checked })
            }
            size="small"
          />
        }
        label="Enable post-average stop loss"
      />

      <Typography color="text.secondary" variant="caption">
        The greatest averaging count reached selects one row. Percentage and
        USDT are independent loss boundaries; set either value to 0 to disable
        that boundary.
      </Typography>

      {config.thresholds.map((threshold, index) => (
        <Grid
          alignItems="center"
          container
          key={`${threshold.minAveragingCount}-${index}`}
          spacing={1}
        >
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              disabled={!config.enabled}
              fullWidth
              label="Minimum Averaging Count"
              onChange={(event) =>
                updateThreshold(index, {
                  minAveragingCount: Math.max(
                    1,
                    Math.floor(Number(event.target.value) || 1),
                  ),
                })
              }
              size="small"
              slotProps={{
                htmlInput: { inputMode: "numeric", min: 1, step: 1 },
              }}
              type="number"
              value={threshold.minAveragingCount}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              disabled={!config.enabled}
              fullWidth
              helperText="0 disables percentage"
              label="Net PnL Stop (%)"
              onChange={(event) =>
                updateThreshold(index, {
                  maxNetPnlPct: Math.min(0, Number(event.target.value) || 0),
                })
              }
              size="small"
              slotProps={{
                htmlInput: { inputMode: "decimal", max: 0, step: 0.1 },
              }}
              type="number"
              value={threshold.maxNetPnlPct}
            />
          </Grid>
          <Grid size={{ xs: 10, sm: 4 }}>
            <TextField
              disabled={!config.enabled}
              fullWidth
              helperText="0 disables USDT"
              label="Net PnL Stop (USDT)"
              onChange={(event) =>
                updateThreshold(index, {
                  maxNetPnlUsdt: Math.min(0, Number(event.target.value) || 0),
                })
              }
              size="small"
              slotProps={{
                htmlInput: { inputMode: "decimal", max: 0, step: 0.01 },
              }}
              type="number"
              value={threshold.maxNetPnlUsdt}
            />
          </Grid>
          <Grid size={{ xs: 2, sm: 1 }}>
            <Tooltip title="Delete threshold">
              <span>
                <IconButton
                  aria-label={`Delete post-average stop threshold ${index + 1}`}
                  disabled={!config.enabled}
                  onClick={() =>
                    onChange({
                      ...config,
                      thresholds: config.thresholds.filter(
                        (_, thresholdIndex) => thresholdIndex !== index,
                      ),
                    })
                  }
                  size="small"
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Grid>
        </Grid>
      ))}

      <Button
        disabled={!config.enabled}
        onClick={addThreshold}
        size="small"
        startIcon={<AddIcon />}
        sx={{ alignSelf: "flex-start" }}
      >
        Add threshold
      </Button>
    </Stack>
  );
}
