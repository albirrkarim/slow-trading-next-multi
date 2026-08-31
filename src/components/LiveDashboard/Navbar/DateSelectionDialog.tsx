"use client";

import DateRangeIcon from "@mui/icons-material/DateRange";
import { Box, IconButton, MenuItem, TextField } from "@mui/material";
import { TIME_RANGE } from "@/components/constants";
import ButtonDialog from "@/components/ui/ButtonDialog";
import { calculateTimeRange, localInputToMs, msToLocalInput } from "../utils";

export default function DateSelectionDialog(props: {
  endTime?: number;
  onEndTimeChange: (value?: number) => void;
  onRangeChange: (
    value: string,
    window?: { endTime?: number; startTime?: number },
  ) => void;
  range: string;
  startTime?: number;
  onStartTimeChange: (value?: number) => void;
}) {
  const {
    endTime,
    onEndTimeChange,
    onRangeChange,
    range,
    startTime,
    onStartTimeChange,
  } = props;

  return (
    <ButtonDialog
      title="Date"
      titleLong="Slow Trading Date Selection"
      maxWidth="xs"
      customButton={(handleOpen) => (
        <IconButton
          onClick={handleOpen}
          title="Open date selection"
          color="inherit"
        >
          <DateRangeIcon />
        </IconButton>
      )}
    >
      {() => (
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Range"
            value={range}
            onChange={(e) => {
              const nextRange = e.target.value;
              if (nextRange === "custom") {
                onRangeChange("custom");
                return;
              }

              const timeWindow = calculateTimeRange(nextRange);
              onRangeChange(nextRange, timeWindow);
            }}
          >
            {TIME_RANGE.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Start Time"
            type="datetime-local"
            size="small"
            value={msToLocalInput(startTime)}
            onChange={(e) => onStartTimeChange(localInputToMs(e.target.value))}
            slotProps={{
              inputLabel: {
                shrink: true,
              },
            }}
          />

          <TextField
            label="End Time"
            type="datetime-local"
            size="small"
            value={msToLocalInput(endTime)}
            onChange={(e) => onEndTimeChange(localInputToMs(e.target.value))}
            slotProps={{
              inputLabel: {
                shrink: true,
              },
            }}
          />
        </Box>
      )}
    </ButtonDialog>
  );
}
