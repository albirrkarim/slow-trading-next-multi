"use client";

import BackspaceIcon from "@mui/icons-material/Backspace";
import { Box, Button, Grid, IconButton, Paper, Typography } from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function PinClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => searchParams?.get("next") || "/slow",
    [searchParams],
  );

  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appendDigit = (d: string) => {
    if (loading) return;
    setError(null);
    setPin((prev) => `${prev}${d}`);
  };

  const backspace = () => {
    if (loading) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  const clear = () => {
    if (loading) return;
    setError(null);
    setPin("");
  };

  const handleSubmit = async () => {
    setError(null);

    if (!pin) {
      setError("Enter access code");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Invalid PIN");
        return;
      }

      router.replace(nextPath);
    } catch {
      setError("Failed to verify PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key >= "0" && e.key <= "9") {
          appendDigit(e.key);
          return;
        }

        if (e.key === "Backspace") {
          backspace();
          return;
        }

        if (e.key === "Escape") {
          clear();
          return;
        }

        if (e.key === "Enter") {
          void handleSubmit();
        }
      }}
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 420, p: 3 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5 }}>
          Enter Access Code
        </Typography>

        <Box
          sx={{
            minHeight: 48,
            borderRadius: 1.5,
            border: (theme) => `1px solid ${theme.palette.divider}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            letterSpacing: 4,
            bgcolor: "background.default",
            mb: 1.5,
            px: 2,
          }}
        >
          {pin ? "•".repeat(Math.min(pin.length, 24)) : ""}
        </Box>

        <Typography
          variant="caption"
          color={error ? "error" : "text.secondary"}
          sx={{ display: "block", minHeight: 18, mb: 1.5, textAlign: "center" }}
        >
          {error || "Type access code or use keypad"}
        </Typography>

        <Grid container spacing={1} sx={{ mb: 1.5 }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Grid key={d} size={4}>
              <Button
                fullWidth
                variant="outlined"
                color="inherit"
                disabled={loading}
                onClick={() => appendDigit(d)}
                sx={{ height: 52, fontSize: 18 }}
              >
                {d}
              </Button>
            </Grid>
          ))}
          <Grid size={4}>
            <Button
              fullWidth
              variant="outlined"
              color="inherit"
              disabled={loading}
              onClick={clear}
              sx={{ height: 52 }}
            >
              Clear
            </Button>
          </Grid>
          <Grid size={4}>
            <Button
              fullWidth
              variant="outlined"
              color="inherit"
              disabled={loading}
              onClick={() => appendDigit("0")}
              sx={{ height: 52, fontSize: 18 }}
            >
              0
            </Button>
          </Grid>
          <Grid size={4}>
            <Box
              sx={{
                height: 52,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconButton
                color="inherit"
                disabled={loading}
                onClick={backspace}
                aria-label="Backspace"
              >
                <BackspaceIcon />
              </IconButton>
            </Box>
          </Grid>
        </Grid>

        <Button
          fullWidth
          variant="contained"
          color="inherit"
          disabled={loading || !pin}
          onClick={() => void handleSubmit()}
        >
          {loading ? "Checking..." : "Unlock"}
        </Button>
      </Paper>
    </Box>
  );
}
