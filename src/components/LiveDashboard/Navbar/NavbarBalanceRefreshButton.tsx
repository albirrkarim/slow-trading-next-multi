"use client";

import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { CircularProgress, IconButton, Tooltip } from "@mui/material";

interface NavbarBalanceRefreshButtonProps {
  accountName: string;
  disabled: boolean;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export default function NavbarBalanceRefreshButton({
  accountName,
  disabled,
  loading,
  onRefresh,
}: NavbarBalanceRefreshButtonProps) {
  const label = loading
    ? `Refreshing ${accountName} live balance`
    : `Refresh ${accountName} live balance`;

  return (
    <Tooltip
      arrow
      title={
        disabled && !loading
          ? "Balance refresh is unavailable during Binance cooldown."
          : `${label}. This makes one private Binance request and updates stored runner memory.`
      }
    >
      <span>
        <IconButton
          aria-label={label}
          color="inherit"
          disabled={disabled}
          onClick={() => void onRefresh()}
          size="small"
          sx={{ height: 40, width: 40 }}
        >
          {loading ? (
            <CircularProgress color="inherit" size={18} />
          ) : (
            <RefreshRoundedIcon fontSize="small" />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}
