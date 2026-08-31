"use client";

import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { Box, TextField, type TextFieldProps } from "@mui/material";

import IconButtonTooltip from "@/components/ui/IconButtonTooltip";

type SettingsInfoFieldProps = TextFieldProps & {
  info?: string;
};

export default function SettingsInfoField({
  info,
  sx,
  multiline,
  select,
  ...textFieldProps
}: SettingsInfoFieldProps) {
  return (
    <Box sx={{ position: "relative" }}>
      <TextField
        {...textFieldProps}
        multiline={multiline}
        select={select}
        sx={[
          {
            "& .MuiInputBase-input": multiline
              ? undefined
              : {
                  pr: 5,
                },
            "& input[type=number]": {
              MozAppearance: "textfield",
            },
            "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
              {
                WebkitAppearance: "none",
                margin: 0,
              },
            "& .MuiSelect-select": {
              pr: 8,
            },
          },
          ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        ]}
      />

      {info ? (
        <Box
          sx={{
            position: "absolute",
            right: select ? 4 : 6,
            top: multiline ? 14 : "50%",
            transform: multiline ? "none" : "translateY(-50%)",
            zIndex: 1,
          }}
        >
          <IconButtonTooltip
            tooltipTitle={info}
            size="small"
            sx={{
              color: "text.secondary",
            }}
          >
            <HelpOutlineIcon fontSize="inherit" />
          </IconButtonTooltip>
        </Box>
      ) : null}
    </Box>
  );
}
