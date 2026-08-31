"use client";

import {
  Autocomplete,
  Box,
  TextField,
  Typography,
  type FilterOptionsState,
} from "@mui/material";

interface TargetNetworkOption {
  code: string;
  name: string;
}

const TARGET_NETWORK_OPTIONS: TargetNetworkOption[] = [
  { code: "BSC", name: "BNB Smart Chain (BEP20)" },
  { code: "OPBNB", name: "opBNB" },
  { code: "TRX", name: "Tron (TRC20)" },
  { code: "ETH", name: "Ethereum (ERC20)" },
  { code: "MATIC", name: "Polygon" },
  { code: "SOL", name: "Solana" },
  { code: "ARBITRUM", name: "Arbitrum One" },
  { code: "TON", name: "The Open Network" },
];

function getTargetNetworkOption(
  value: string,
): TargetNetworkOption | string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return (
    TARGET_NETWORK_OPTIONS.find((option) => option.code === normalized) ??
    normalized
  );
}

function getTargetNetworkLabel(option: TargetNetworkOption | string): string {
  return typeof option === "string"
    ? option
    : `${option.code} - ${option.name}`;
}

function filterTargetNetworkOptions(
  options: TargetNetworkOption[],
  state: FilterOptionsState<TargetNetworkOption>,
): TargetNetworkOption[] {
  const input = state.inputValue.trim().toLowerCase();
  if (!input) {
    return options;
  }

  return options.filter((option) => {
    const code = option.code.toLowerCase();
    const name = option.name.toLowerCase();
    return code.includes(input) || name.includes(input);
  });
}

export default function WithdrawalNetworkAutocomplete(props: {
  helperText?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const { helperText, label, onChange, value } = props;

  return (
    <Autocomplete
      freeSolo
      options={TARGET_NETWORK_OPTIONS}
      value={getTargetNetworkOption(value)}
      inputValue={value}
      filterOptions={filterTargetNetworkOptions}
      getOptionLabel={getTargetNetworkLabel}
      onChange={(_, nextValue) => {
        if (typeof nextValue === "string") {
          onChange(nextValue.toUpperCase());
          return;
        }

        onChange(nextValue?.code ?? "");
      }}
      onInputChange={(_, nextValue, reason) => {
        if (reason === "input") {
          onChange(nextValue.toUpperCase());
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          size="small"
          fullWidth
          helperText={helperText}
        />
      )}
      renderOption={(optionProps, option) => (
        <Box component="li" {...optionProps} key={option.code}>
          <Box>
            <Typography variant="body2" fontWeight={700}>
              {option.code}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {option.name}
            </Typography>
          </Box>
        </Box>
      )}
    />
  );
}
