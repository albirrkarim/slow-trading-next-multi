"use client";

import CheckIcon from "@mui/icons-material/Check";
import PublicIcon from "@mui/icons-material/Public";
import { Chip, Tooltip } from "@mui/material";
import { useState } from "react";

import type { DashboardState } from "./types";

export default function NavbarInstanceIp({
  snapshot,
}: {
  snapshot: DashboardState["instanceIp"];
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  if (!snapshot) {
    return null;
  }

  const checkedAt = new Date(snapshot.t).toLocaleString();
  const tooltip =
    copyState === "copied"
      ? `Copied ${snapshot.ip}`
      : copyState === "failed"
        ? "Unable to copy IP"
        : `Last checked: ${checkedAt}. Click to copy.`;

  const copyIp = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.ip);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 1_500);
  };

  return (
    <Tooltip arrow placement="bottom-start" title={tooltip}>
      <Chip
        aria-label={`Copy instance IP ${snapshot.ip}`}
        clickable
        icon={
          copyState === "copied" ? (
            <CheckIcon fontSize="small" />
          ) : (
            <PublicIcon fontSize="small" />
          )
        }
        label={snapshot.ip}
        onClick={() => void copyIp()}
        size="small"
        variant="outlined"
      />
    </Tooltip>
  );
}
