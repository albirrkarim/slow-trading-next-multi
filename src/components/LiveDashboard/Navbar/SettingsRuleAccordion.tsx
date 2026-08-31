"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";

interface SettingsRuleAccordionProps {
  behavior: string;
  children?: ReactNode;
  name: string;
  number: number;
  status?: string;
  tc?: string;
}

export default function SettingsRuleAccordion({
  behavior,
  children,
  name,
  number,
  status,
  tc,
}: SettingsRuleAccordionProps) {
  return (
    <Accordion
      disableGutters
      elevation={0}
      square
      sx={{
        bgcolor: "transparent",
        borderBottom: 1,
        borderColor: "divider",
        "&.Mui-expanded": { m: 0 },
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon fontSize="small" />}
        sx={{
          minHeight: 44,
          px: 0,
          "&.Mui-expanded": { minHeight: 44 },
          "& .MuiAccordionSummary-content": { my: 0.75, minWidth: 0 },
          "& .MuiAccordionSummary-content.Mui-expanded": { my: 0.75 },
        }}
      >
        <Box minWidth={0} width="100%">
          <Stack
            alignItems={{ xs: "flex-start", sm: "center" }}
            direction={{ xs: "column", sm: "row" }}
            gap={0.5}
            justifyContent="space-between"
          >
            <Typography fontWeight={600} variant="body2">
              {number}. {name}
            </Typography>
            {status && (
              <Typography
                color="text.secondary"
                sx={{ fontVariantNumeric: "tabular-nums" }}
                variant="caption"
              >
                {status}
              </Typography>
            )}
          </Stack>
          {tc && (
            <Typography
              component="code"
              sx={{
                display: "block",
                fontFamily: "monospace",
                maxWidth: "100%",
                overflowWrap: "anywhere",
                whiteSpace: "normal",
              }}
              variant="caption"
            >
              TC: {tc}
            </Typography>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pb: 1.5, pt: 0 }}>
        <Stack spacing={1.5}>
          <Typography color="text.secondary" variant="caption">
            {behavior}
          </Typography>
          {children}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
