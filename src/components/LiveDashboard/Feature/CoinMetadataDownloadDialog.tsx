"use client";

import { useState } from "react";

import { Alert, Box, Button, TextField } from "@mui/material";

import ButtonDialog from "@/components/ui/ButtonDialog";

const DEFAULT_ONLINE_BASE_URL = "https://fast.reinventwp.com";

/** Normalizes a valid HTTP(S) source URL for the metadata sync API. */
function normalizeOnlineBaseUrl(input: string): string | null {
  const trimmed = input.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return trimmed.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function CoinMetadataDownloadForm({
  closeDialog,
  downloading,
  onDownload,
}: {
  closeDialog: () => void;
  downloading: boolean;
  onDownload: (onlineBaseUrl: string) => Promise<boolean>;
}) {
  const [onlineBaseUrl, setOnlineBaseUrl] = useState(
    DEFAULT_ONLINE_BASE_URL,
  );
  const normalizedBaseUrl = normalizeOnlineBaseUrl(onlineBaseUrl);

  const handleDownload = async () => {
    if (!normalizedBaseUrl) {
      return;
    }

    const succeeded = await onDownload(normalizedBaseUrl);
    if (succeeded) {
      closeDialog();
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5, pt: 0.5 }}>
      <Alert severity="warning">
        This replaces the local coin tags, tag descriptions, coin descriptions,
        and coin assignments with data from the selected source.
      </Alert>
      <TextField
        autoFocus
        disabled={downloading}
        error={onlineBaseUrl.length > 0 && !normalizedBaseUrl}
        fullWidth
        helperText={
          onlineBaseUrl.length > 0 && !normalizedBaseUrl
            ? "Enter a complete HTTP or HTTPS URL."
            : "The app downloads from /api/slow-trading/coin-metadata on this domain."
        }
        label="Source domain"
        onChange={(event) => setOnlineBaseUrl(event.target.value)}
        size="small"
        value={onlineBaseUrl}
      />
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button disabled={downloading} onClick={closeDialog}>
          Cancel
        </Button>
        <Button
          disabled={downloading || !normalizedBaseUrl}
          onClick={() => void handleDownload()}
          variant="contained"
        >
          {downloading ? "Downloading..." : "Download and replace"}
        </Button>
      </Box>
    </Box>
  );
}

export default function CoinMetadataDownloadDialog({
  disabled,
  downloading,
  onDownload,
}: {
  disabled?: boolean;
  downloading: boolean;
  onDownload: (onlineBaseUrl: string) => Promise<boolean>;
}) {
  return (
    <ButtonDialog
      contentSx={{ p: 1.5, pt: 0.5 }}
      disabled={disabled || downloading}
      maxWidth="sm"
      size="small"
      title={
        downloading ? "Downloading..." : "Download online version to local"
      }
      titleLong="Download online coin metadata"
      variant="outlined"
    >
      {(closeDialog) => (
        <CoinMetadataDownloadForm
          closeDialog={closeDialog}
          downloading={downloading}
          onDownload={onDownload}
        />
      )}
    </ButtonDialog>
  );
}
