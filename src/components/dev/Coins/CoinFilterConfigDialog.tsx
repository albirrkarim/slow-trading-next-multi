"use client";

import ButtonDialog from "@/components/ui/ButtonDialog";
import { CopyText } from "@/components/ui/CopyText";
import {
  pruneCoinFilterConfig,
  type CoinFilterConfig,
} from "@/lib/devBacktest/coins/filter-config";
import DataObjectIcon from "@mui/icons-material/DataObject";
import { Box, TextField } from "@mui/material";

export default function CoinFilterConfigDialog({
  config,
}: {
  config: CoinFilterConfig;
}) {
  const json = JSON.stringify(pruneCoinFilterConfig(config), null, 2);

  return (
    <ButtonDialog
      maxWidth="md"
      size="small"
      startIcon={<DataObjectIcon />}
      title="JSON"
      titleLong="Current filter JSON"
      variant="outlined"
    >
      {() => (
        <Box sx={{ display: "grid", gap: 1 }}>
          <Box sx={{ justifySelf: "end" }}>
            <CopyText label="filter JSON" text={json} />
          </Box>
          <TextField
            fullWidth
            multiline
            minRows={16}
            size="small"
            value={json}
            slotProps={{
              htmlInput: {
                readOnly: true,
                spellCheck: false,
                style: { fontFamily: "monospace" },
              },
            }}
          />
        </Box>
      )}
    </ButtonDialog>
  );
}
