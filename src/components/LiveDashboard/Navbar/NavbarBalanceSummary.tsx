"use client";

import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";

import type { BalanceSummary } from "./types";

const STORAGE_KEY = "slow-trading:navbar:balance-visible:v1";
const MASKED_VALUE = "*****";

const balanceTooltipSlotProps = {
  tooltip: {
    sx: {
      maxWidth: 420,
      p: 1.25,
      fontSize: "0.85rem",
      lineHeight: 1.45,
    },
  },
};

interface BalanceItem {
  description: string;
  formula: string;
  label: string;
  resolvedFormula: string;
  value: number;
  visible: boolean;
}

function readInitialVisibility() {
  if (typeof window === "undefined") return false;

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === null ? false : value === "true";
  } catch {
    return false;
  }
}

function writeVisibility(visible: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, String(visible));
  } catch {
    // Local storage can be unavailable in private or restricted contexts.
  }
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function formatExactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function BalanceValueTooltip({
  children,
  title,
}: {
  children: ReactElement;
  title: ReactNode;
}) {
  return (
    <Tooltip
      arrow
      placement="bottom-start"
      slotProps={balanceTooltipSlotProps}
      title={title}
    >
      {children}
    </Tooltip>
  );
}

function BalanceValueTooltipText({
  description,
  formula,
  resolvedFormula,
  value,
  visible,
}: {
  description: string;
  formula: string;
  resolvedFormula: string;
  value: number;
  visible: boolean;
}) {
  return (
    <Box>
      <Typography
        component="div"
        sx={{ fontSize: "0.85rem", fontWeight: 700, mb: 0.5 }}
      >
        {description}
      </Typography>
      {visible && (
        <Typography component="div" sx={{ fontSize: "0.85rem", mb: 0.5 }}>
          Exact: {formatExactCurrency(value)}
        </Typography>
      )}
      {!visible && (
        <Typography component="div" sx={{ fontSize: "0.85rem", mb: 0.5 }}>
          Value hidden
        </Typography>
      )}
      <Typography
        component="div"
        sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}
      >
        {formula}
      </Typography>
      {visible && (
        <Box sx={{ mt: 0.5 }}>
          <Typography
            component="div"
            sx={{ fontSize: "0.8rem", fontWeight: 700 }}
          >
            Current values
          </Typography>
          <Typography
            component="div"
            sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}
          >
            {resolvedFormula}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function BalanceMetric({
  description,
  formula,
  label,
  resolvedFormula,
  value,
  visible,
}: BalanceItem) {
  return (
    <BalanceValueTooltip
      title={
        <BalanceValueTooltipText
          description={description}
          formula={formula}
          resolvedFormula={resolvedFormula}
          value={value}
          visible={visible}
        />
      }
    >
      <span style={{ cursor: "help" }}>
        {label}: {visible ? formatCompactCurrency(value) : MASKED_VALUE}
      </span>
    </BalanceValueTooltip>
  );
}

export default function NavbarBalanceSummary({
  balanceSummary,
}: {
  balanceSummary: BalanceSummary;
}) {
  const [visible, setVisible] = useState(readInitialVisibility);

  useEffect(() => {
    writeVisibility(visible);
  }, [visible]);

  const items: BalanceItem[] = [
    {
      description:
        "Available is the actual live USDT on the exchange. Inside SLOW it is virtually divided into spendable, reserved, and safe haven.",
      formula: "balance.available = spendable + reserved + safeHaven",
      label: "A",
      resolvedFormula:
        `${formatExactCurrency(balanceSummary.available)} = ` +
        `${formatExactCurrency(balanceSummary.spendable)} + ` +
        `${formatExactCurrency(balanceSummary.reserved)} + ` +
        formatExactCurrency(balanceSummary.safeHaven),
      value: balanceSummary.available,
      visible,
    },
    {
      description:
        "Spendable is virtual capital that can be used for new entries or bailout averaging.",
      formula: "balance.spendable = available - reserved - safeHaven",
      label: "S",
      resolvedFormula:
        `${formatExactCurrency(balanceSummary.spendable)} = ` +
        `${formatExactCurrency(balanceSummary.available)} - ` +
        `${formatExactCurrency(balanceSummary.reserved)} - ` +
        formatExactCurrency(balanceSummary.safeHaven),
      value: balanceSummary.spendable,
      visible,
    },
    {
      description:
        "Reserved is virtual balance allocated for averaging active open positions.",
      formula: "balance.reserved = sum of remaining reserved averaging steps",
      label: "R",
      resolvedFormula:
        `${formatExactCurrency(balanceSummary.reserved)} = ` +
        "remaining reserved averaging steps",
      value: balanceSummary.reserved,
      visible,
    },
    {
      description: "Locked is the total margin of active open positions.",
      formula: "balance.locked = sum of active position margin",
      label: "L",
      resolvedFormula:
        `${formatExactCurrency(balanceSummary.locked)} = ` +
        "active position margins",
      value: balanceSummary.locked,
      visible,
    },
    {
      description:
        "Safe haven is virtual protected capital taken from spendable balance by config. It is reserved for capital protection and auto-withdrawal.",
      formula: "balance.safeHaven = protected virtual reserve",
      label: "H",
      resolvedFormula:
        `${formatExactCurrency(balanceSummary.safeHaven)} = ` +
        "protected virtual reserve",
      value: balanceSummary.safeHaven,
      visible,
    },
  ].filter((item) => {
    if (item.label === "R" || item.label === "H") {
      return item.value > 0;
    }

    return true;
  });

  return (
    <Box
      sx={(theme) => ({
        borderLeft: `5px solid ${theme.palette.warning.main}`,
        p: 0.5,
        display: "flex",
        gap: 1,
        alignItems: "center",
        flex: { xs: "1 1 100%", sm: "0 1 auto" },
        maxWidth: "100%",
        borderRadius: 1,
        minWidth: "100px",
      })}
    >
      <Box
        sx={{
          alignItems: "flex-start",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <BalanceValueTooltip
          title={
            <BalanceValueTooltipText
              description="Total asset shown in the navbar. It is the current available quote balance plus margin locked in active open positions. It does not include floating PnL."
              formula="total asset = balance.available + balance.locked"
              resolvedFormula={
                `${formatExactCurrency(balanceSummary.total)} = ` +
                `${formatExactCurrency(balanceSummary.available)} + ` +
                formatExactCurrency(balanceSummary.locked)
              }
              value={balanceSummary.total}
              visible={visible}
            />
          }
        >
          <Typography variant="body1" sx={{ cursor: "help", lineHeight: 1.2 }}>
            {visible
              ? formatCompactCurrency(balanceSummary.total)
              : MASKED_VALUE}
          </Typography>
        </BalanceValueTooltip>

        <IconButton
          aria-label={visible ? "Hide balance numbers" : "Show balance numbers"}
          color="inherit"
          onClick={() => setVisible((current) => !current)}
          size="small"
          sx={{ mt: 0.25, p: 0.1 }}
          title={visible ? "Hide balance numbers" : "Show balance numbers"}
        >
          {visible ? (
            <VisibilityOffIcon sx={{ fontSize: 14 }} />
          ) : (
            <VisibilityIcon sx={{ fontSize: 14 }} />
          )}
        </IconButton>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "row", sm: "column" },
          flexWrap: "wrap",
          fontSize: "0.8rem",
          lineHeight: 1.2,
          opacity: 0.8,
          gap: { xs: 0.75, sm: 0.2 },
          minWidth: 0,
        }}
      >
        {items.map((item) => (
          <BalanceMetric key={item.label} {...item} />
        ))}
      </Box>
    </Box>
  );
}
