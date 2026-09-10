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

import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import levelBasedPctDriftStopLoss from "@/lib/trading/level-based-pct-drift-stop-loss";
import type { LevelBasedPctDriftStopLossConfig } from "@/lib/trading/models";

export default function LevelBasedPctDriftStopLossSettings({
  onChange,
  value,
}: {
  onChange: (config: LevelBasedPctDriftStopLossConfig) => void;
  value?: LevelBasedPctDriftStopLossConfig;
}) {
  const config = levelBasedPctDriftStopLoss.config.normalize(value);

  const updateCondition = (
    index: number,
    patch: Partial<LevelBasedPctDriftStopLossConfig["conditions"][number]>,
  ) => {
    onChange({
      ...config,
      conditions: config.conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, ...patch } : condition,
      ),
    });
  };

  const addCondition = () => {
    const largestLevel = config.conditions.reduce(
      (largest, condition) => Math.max(largest, condition.absoluteLevel),
      0,
    );
    onChange({
      ...config,
      conditions: [
        ...config.conditions,
        {
          absoluteLevel: largestLevel + 1,
          adverseDriftPct: VOLATILITY_THRESHOLD,
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
        label="Enable level-based vPoint drift stop loss"
      />

      <Typography color="text.secondary" variant="caption">
        The current vPoint must exactly match a configured absolute level. LONG
        exits after a downward drift; SHORT exits after an upward drift from
        that vPoint price.
      </Typography>

      {config.conditions.map((condition, index) => (
        <Grid
          alignItems="center"
          container
          key={`${condition.absoluteLevel}-${index}`}
          spacing={1}
        >
          <Grid size={{ xs: 5 }}>
            <TextField
              disabled={!config.enabled}
              fullWidth
              label="Absolute vPoint Level"
              onChange={(event) =>
                updateCondition(index, {
                  absoluteLevel: Math.max(
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
              value={condition.absoluteLevel}
            />
          </Grid>
          <Grid size={{ xs: 5 }}>
            <TextField
              disabled={!config.enabled}
              fullWidth
              label="Adverse Drift (%)"
              onChange={(event) =>
                updateCondition(index, {
                  adverseDriftPct: Math.max(
                    0.01,
                    Number(event.target.value) || VOLATILITY_THRESHOLD,
                  ),
                })
              }
              size="small"
              slotProps={{
                htmlInput: { inputMode: "decimal", min: 0.01, step: 0.1 },
              }}
              type="number"
              value={condition.adverseDriftPct}
            />
          </Grid>
          <Grid size={{ xs: 2 }}>
            <Tooltip title="Delete condition">
              <span>
                <IconButton
                  aria-label={`Delete level-based drift condition ${index + 1}`}
                  disabled={!config.enabled}
                  onClick={() =>
                    onChange({
                      ...config,
                      conditions: config.conditions.filter(
                        (_, conditionIndex) => conditionIndex !== index,
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
        onClick={addCondition}
        size="small"
        startIcon={<AddIcon />}
        sx={{ alignSelf: "flex-start" }}
      >
        Add condition
      </Button>
    </Stack>
  );
}
