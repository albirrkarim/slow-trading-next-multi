"use client";

import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { Box, TextField, Tooltip, Typography } from "@mui/material";
import type {
  CoinFilterConfig,
  CoinResultFilters,
} from "@/lib/devBacktest/coins/filter-config";
import CoinTagSelect from "./CoinTagSelect";

type FilterField = {
  help: string;
  key: keyof CoinResultFilters;
  label: string;
};

const FILTER_GROUPS: Array<{
  fields: FilterField[];
  title: string;
}> = [
  {
    title: "Activity",
    fields: [
      {
        key: "entrySignalsPerMonthMinimum",
        label: "Entry signals/mo",
        help: "Entry signals per month at least",
      },
      {
        key: "entrySequenceCountMinimum",
        label: "Entry sequences",
        help: "Count entry sequence at least",
      },
      {
        key: "vPointsPerMonthMinimum",
        label: "Avg vPoints/mo",
        help: "Average vPoints per month at least",
      },
      {
        key: "firstSeenMinimumMonths",
        label: "First seen (mo)",
        help: "First seen at least this many months ago",
      },
    ],
  },
  {
    title: "Quality and levels",
    fields: [
      {
        key: "healthScoreMinimum",
        label: "Health score",
        help: "Health score at least",
      },
      { key: "maxTop", label: "Max top", help: "Max top at most" },
      { key: "maxBottom", label: "Max bottom", help: "Max bottom at most" },
      {
        key: "maxLevelAbsolute",
        label: "Max absolute",
        help: "Max absolute level at most",
      },
    ],
  },
  {
    title: "Hold duration",
    fields: [
      {
        key: "holdDurationMinMaxHours",
        label: "Min hold max",
        help: "Min hold duration at most (hours)",
      },
      {
        key: "holdDurationAvgMaxHours",
        label: "Avg hold max",
        help: "Average hold duration at most (hours)",
      },
      {
        key: "holdDurationMaxMaxHours",
        label: "Max hold max",
        help: "Max hold duration at most (hours)",
      },
    ],
  },
  {
    title: "vPoint transitions",
    fields: [
      {
        key: "vPointTransitionAvgHours",
        label: "Avg transition",
        help: "Average vPoint transition at most (hours)",
      },
      {
        key: "vPointTransitionMaxHours",
        label: "Max transition",
        help: "Max vPoint transition at most (hours)",
      },
    ],
  },
  {
    title: "Latest direction transitions",
    fields: [
      {
        key: "avgBottomToTopMaxHours",
        label: "Avg B→T max",
        help: "Average latest BOTTOM to TOP transition at most (hours)",
      },
      {
        key: "avgTopToBottomMaxHours",
        label: "Avg T→B max",
        help: "Average latest TOP to BOTTOM transition at most (hours)",
      },
      {
        key: "maxBottomToTopMaxHours",
        label: "Max B→T max",
        help: "Max latest BOTTOM to TOP transition at most (hours)",
      },
      {
        key: "maxTopToBottomMaxHours",
        label: "Max T→B max",
        help: "Max latest TOP to BOTTOM transition at most (hours)",
      },
    ],
  },
];

function getInputProps(field: FilterField) {
  if (field.key === "firstSeenMinimumMonths") return { min: 0, step: 1 };
  if (field.key === "healthScoreMinimum") return { max: 100, min: 0, step: 1 };
  if (
    field.key === "entrySignalsPerMonthMinimum" ||
    field.key === "vPointsPerMonthMinimum"
  ) {
    return { min: 0, step: 0.1 };
  }
  if (field.key === "entrySequenceCountMinimum") return { min: 0, step: 1 };
  return {};
}

function renderFieldLabel(field: FilterField) {
  return (
    <Box
      component="span"
      sx={{ alignItems: "center", display: "inline-flex", gap: 0.5 }}
    >
      <Box component="span">{field.label}</Box>
      <Tooltip title={field.help}>
        <HelpOutlineIcon color="action" fontSize="inherit" />
      </Tooltip>
    </Box>
  );
}

export default function CoinCandidateFilters({
  availableTags,
  config,
  onChange,
  tagColors,
  tagDescriptions,
}: {
  availableTags: string[];
  config: CoinFilterConfig;
  onChange: (config: CoinFilterConfig) => void;
  tagColors: Record<string, string>;
  tagDescriptions: Record<string, string>;
}) {
  const filters = config.filters;

  const renderField = (field: FilterField) => (
    <TextField
      fullWidth
      key={field.key}
      label={renderFieldLabel(field)}
      onChange={(event) =>
        onChange({
          ...config,
          filters: { ...filters, [field.key]: event.target.value },
        })
      }
      size="small"
      slotProps={{
        htmlInput: getInputProps(field),
      }}
      type="number"
      value={filters[field.key]}
    />
  );

  return (
    <Box
      sx={{
        display: "grid",
        gap: 1,
        gridTemplateColumns: {
          xs: "1fr",
          md: "repeat(2, minmax(0, 1fr))",
          xl: "repeat(3, minmax(0, 1fr))",
        },
      }}
    >
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          p: 1,
        }}
      >
        <Typography
          color="text.secondary"
          fontWeight={700}
          variant="caption"
          sx={{ display: "block", mb: 0.5, textTransform: "uppercase" }}
        >
          Tags
        </Typography>
        <CoinTagSelect
          allowCreate={false}
          label="Required tags (all)"
          onChange={(requiredTags) => onChange({ ...config, requiredTags })}
          options={availableTags}
          tagColors={tagColors}
          tagDescriptions={tagDescriptions}
          value={config.requiredTags}
        />
      </Box>
      {FILTER_GROUPS.map((group) => (
        <Box
          key={group.title}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            p: 1,
          }}
        >
          <Typography
            color="text.secondary"
            fontWeight={700}
            variant="caption"
            sx={{ display: "block", mb: 0.5, textTransform: "uppercase" }}
          >
            {group.title}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
              },
            }}
          >
            {group.fields.map(renderField)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
