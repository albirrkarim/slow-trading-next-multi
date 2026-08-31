"use client";

import {
  Alert,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";

import type {
  WithdrawalScheduleDraft,
  WithdrawalWalletDraft,
} from "./types";
import {
  WithdrawalWalletDeleteDialog,
  WithdrawalWalletUpdateDialog,
} from "./WithdrawalWalletDialogs";

function maskWalletAddress(address: string): string {
  const normalized = address.trim();
  if (!normalized) {
    return "Missing address";
  }
  if (normalized.length <= 18) {
    return normalized;
  }
  return `${normalized.slice(0, 9)}…${normalized.slice(-8)}`;
}

export default function WithdrawalWalletTable(props: {
  onDelete: (walletId: string) => void;
  onUpdate: (wallet: WithdrawalWalletDraft) => void;
  schedules: WithdrawalScheduleDraft[];
  wallets: WithdrawalWalletDraft[];
}) {
  const { onDelete, onUpdate, schedules, wallets } = props;

  if (wallets.length === 0) {
    return (
      <Alert severity="info">
        No saved wallets yet. Add a wallet before assigning it to recurring
        schedules.
      </Alert>
    );
  }

  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Network</TableCell>
            <TableCell>Wallet Address</TableCell>
            <TableCell>Used By</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {wallets.map((wallet) => {
            const usedBySchedules = schedules.filter(
              (schedule) => schedule.walletId === wallet.id,
            );
            const usedByNames = usedBySchedules.map(
              (schedule) => schedule.name,
            );

            return (
              <TableRow key={wallet.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={700}>
                    {wallet.name}
                  </Typography>
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <Chip
                    label={wallet.network || "Missing"}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title={wallet.address || "Missing address"}>
                    <Typography
                      component="span"
                      sx={{ whiteSpace: "nowrap" }}
                      variant="body2"
                    >
                      {maskWalletAddress(wallet.address)}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  {usedBySchedules.length > 0 ? (
                    <Stack
                      direction="row"
                      flexWrap="wrap"
                      gap={0.5}
                      sx={{ minWidth: 140 }}
                    >
                      {usedBySchedules.map((schedule) => (
                        <Chip
                          key={schedule.id}
                          label={schedule.name}
                          size="small"
                        />
                      ))}
                    </Stack>
                  ) : (
                    <Typography color="text.secondary" variant="caption">
                      Unused
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Stack
                    direction="row"
                    justifyContent="flex-end"
                    spacing={0.25}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    <WithdrawalWalletUpdateDialog
                      onUpdate={onUpdate}
                      wallet={wallet}
                    />
                    <WithdrawalWalletDeleteDialog
                      onDelete={onDelete}
                      usedByScheduleNames={usedByNames}
                      wallet={wallet}
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
