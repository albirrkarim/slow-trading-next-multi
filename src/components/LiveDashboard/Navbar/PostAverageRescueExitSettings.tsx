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

import type { PostAverageRescueExitConfig } from "@/lib/trading/models";
import postAverageRescue from "@/lib/trading/post-average-rescue";

interface PostAverageRescueExitSettingsProps {
  onChange: (config: PostAverageRescueExitConfig) => void;
  value?: PostAverageRescueExitConfig;
}

export default function PostAverageRescueExitSettings({
  onChange,
  value,
}: PostAverageRescueExitSettingsProps) {
  const config = postAverageRescue.config.normalize(value);

  const updateThreshold = (
    index: number,
    patch: Partial<PostAverageRescueExitConfig["thresholds"][number]>,
  ) => {
    onChange({
      ...config,
      thresholds: config.thresholds.map((threshold, thresholdIndex) =>
        thresholdIndex === index ? { ...threshold, ...patch } : threshold,
      ),
    });
  };

  const removeThreshold = (index: number) => {
    onChange({
      ...config,
      thresholds: config.thresholds.filter(
        (_, thresholdIndex) => thresholdIndex !== index,
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
          minAveragingCount: largestCount + 1,
          minNetPnlPct: 0,
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
        label="Enable post-average rescue exit"
      />

      <Typography color="text.secondary" variant="caption">
        The greatest minimum averaging count reached by the position supplies
        the required fee-aware net PnL.
      </Typography>

      {config.thresholds.map((threshold, index) => (
        <Grid
          alignItems="center"
          container
          key={`${threshold.minAveragingCount}-${index}`}
          spacing={1}
        >
          <Grid size={{ xs: 12, sm: 5 }}>
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
          <Grid size={{ xs: 10, sm: 5 }}>
            <TextField
              disabled={!config.enabled}
              fullWidth
              label="Minimum Net PnL (%)"
              onChange={(event) =>
                updateThreshold(index, {
                  minNetPnlPct: Number(event.target.value) || 0,
                })
              }
              size="small"
              slotProps={{
                htmlInput: { inputMode: "decimal", step: 0.1 },
              }}
              type="number"
              value={threshold.minNetPnlPct}
            />
          </Grid>
          <Grid size={{ xs: 2, sm: 2 }}>
            <Tooltip title="Delete threshold">
              <span>
                <IconButton
                  aria-label={`Delete threshold ${index + 1}`}
                  disabled={!config.enabled}
                  onClick={() => removeThreshold(index)}
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
