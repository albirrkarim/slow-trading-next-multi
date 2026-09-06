"use client";

import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import { Box, Stack, Typography } from "@mui/material";
import type { SlowTradingAccount } from "@/lib/slowTrading/types";

import HeaderMetrics from "../ui/HeaderMetrics";
import { getCustomAccountTradingConfig } from "./account-trading-summary";

type SummaryAccount = Pick<
  SlowTradingAccount,
  "enabled" | "name" | "slug" | "trading"
>;

interface SystemAccountSummaryProps {
  accounts: SummaryAccount[];
  description?: string;
}

function AccountSummary({
  account,
  showDivider,
}: {
  account: SummaryAccount;
  showDivider: boolean;
}) {
  const notes = account.trading.notes.trim();
  const customConfig = getCustomAccountTradingConfig(account.trading);
  const hasCustomConfig = Object.keys(customConfig).length > 0;
  const headingId = `account-config-summary-${account.slug}`;

  return (
    <Box
      aria-labelledby={headingId}
      component="article"
      data-testid={`account-config-summary-${account.slug}`}
      sx={{
        borderColor: "divider",
        borderTop: showDivider ? 1 : 0,
        minWidth: 0,
        px: 2,
        py: 1.5,
      }}
    >
      <Stack alignItems="center" direction="row" gap={1} sx={{ mb: 1 }}>
        <AccountCircleRoundedIcon
          aria-hidden
          color="action"
          data-testid={`account-icon-${account.slug}`}
          fontSize="small"
        />
        <Typography component="h2" id={headingId} fontWeight="bold" variant="subtitle2">
          {account.name}
        </Typography>
      </Stack>
      <Typography
        color={notes ? "text.primary" : "text.secondary"}
        sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
        variant="body2"
      >
        {notes || "No trading notes."}
      </Typography>

      {hasCustomConfig ? (
        <HeaderMetrics
          defaultExpanded={false}
          headerCanBeClicked
          headerSx={{ minHeight: 44 }}
          sx={{ mt: 1 }}
          title={
            <Typography color="text.secondary" variant="caption">
              Details
            </Typography>
          }
        >
          {(expanded) =>
            expanded && (
              <Box
                component="pre"
                data-testid={`account-config-overrides-${account.slug}`}
                sx={{
                  bgcolor: "action.hover",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  lineHeight: 1.6,
                  m: 0,
                  overflowWrap: "anywhere",
                  p: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(customConfig, null, 2)}
              </Box>
            )
          }
        </HeaderMetrics>
      ) : (
        <Box sx={{ mt: 1.5 }}>
          <Typography color="text.secondary" component="p" variant="caption">
            Custom trading values
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Using the default trading configuration.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default function SystemAccountSummary({
  accounts,
  description,
}: SystemAccountSummaryProps) {
  const normalizedDescription = description?.trim();
  const enabledAccounts = accounts.filter((account) => account.enabled);

  // PROD:MULTI_ACCOUNT_TRADING_CONFIG_SUMMARY
  return (
    <Box
      component="section"
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) minmax(360px, 1fr)" },
        mb: 2,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          borderBottom: { xs: 1, md: 0 },
          borderColor: "divider",
          borderRight: { xs: 0, md: 1 },
          minWidth: 0,
          p: 2,
        }}
      >
        <Typography component="h2" sx={{ mb: 1, fontWeight: "bold" }} variant="subtitle1">
          System overview
        </Typography>
        <Typography
          color={normalizedDescription ? "text.primary" : "text.secondary"}
          sx={{ maxWidth: "75ch", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
          variant="body1"
        >
          {normalizedDescription || "No system description."}
        </Typography>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {enabledAccounts.length > 0 ? (
          enabledAccounts.map((account, index) => (
            <AccountSummary
              account={account}
              key={account.slug}
              showDivider={index > 0}
            />
          ))
        ) : (
          <Typography color="text.secondary" sx={{ p: 2 }} variant="body2">
            No enabled trading accounts.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
