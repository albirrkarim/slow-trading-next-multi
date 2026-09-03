"use client";

import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import {
  JsonView,
  allExpanded,
  collapseAllNested,
  darkStyles,
  defaultStyles,
} from "react-json-view-lite";
import { useState } from "react";

import CopyToClipboardIconButton from "@/components/ui/CopyToClipboardIconButton";

type ExpansionMode = "all" | "nested";

export default function JsonTreeViewer({
  ariaLabel = "JSON tree",
  value,
}: {
  ariaLabel?: string;
  value: object;
}) {
  const theme = useTheme();
  const [expansion, setExpansion] = useState<{
    mode: ExpansionMode;
    revision: number;
  }>({ mode: "nested", revision: 0 });
  const resetExpansion = (mode: ExpansionMode) => {
    setExpansion((current) => ({
      mode,
      revision: current.revision + 1,
    }));
  };

  return (
    <Box>
      <Stack
        alignItems="center"
        direction="row"
        flexWrap="wrap"
        gap={0.75}
        sx={{ mb: 1 }}
      >
        <CopyToClipboardIconButton
          aria-label="Copy JSON"
          color="inherit"
          size="small"
          text={JSON.stringify(value, null, 2)}
          tooltipTitle="Copy JSON"
        />
        <Button
          onClick={() => resetExpansion("all")}
          size="small"
          startIcon={<UnfoldMoreIcon fontSize="small" />}
          variant="outlined"
        >
          Expand all
        </Button>
        <Button
          onClick={() => resetExpansion("nested")}
          size="small"
          startIcon={<UnfoldLessIcon fontSize="small" />}
          variant="outlined"
        >
          Collapse nested
        </Button>
        <Typography color="text.secondary" variant="caption">
          Use the arrows or keyboard ←/→ to inspect one branch.
        </Typography>
      </Stack>

      <Box
        sx={{
          bgcolor: "background.default",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "0.78rem",
          lineHeight: 1.5,
          maxHeight: { xs: "58vh", md: "68vh" },
          overflow: "auto",
          p: 1.5,
          "& [role='tree']": {
            backgroundColor: "transparent",
          },
        }}
      >
        <JsonView
          key={`${expansion.mode}-${expansion.revision}`}
          aria-label={ariaLabel}
          clickToExpandNode
          data={value}
          shouldExpandNode={
            expansion.mode === "all" ? allExpanded : collapseAllNested
          }
          style={theme.palette.mode === "dark" ? darkStyles : defaultStyles}
        />
      </Box>
    </Box>
  );
}
