"use client";

import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useState } from "react";

import ButtonDialog from "@/components/ui/ButtonDialog";

import SettingsInfoField from "./SettingsInfoField";
import type { WithdrawalWalletDraft } from "./types";
import WithdrawalNetworkAutocomplete from "./WithdrawalNetworkAutocomplete";

function createWalletId(): string {
  return `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultWallet(index: number): WithdrawalWalletDraft {
  return {
    id: "",
    name: `Wallet ${index + 1}`,
    network: "TRX",
    address: "",
  };
}

function WithdrawalWalletForm(props: {
  initialWallet: WithdrawalWalletDraft;
  onClose: () => void;
  onSubmit: (wallet: WithdrawalWalletDraft) => void;
  submitLabel: string;
}) {
  const { initialWallet, onClose, onSubmit, submitLabel } = props;
  const [wallet, setWallet] = useState<WithdrawalWalletDraft>({
    ...initialWallet,
  });

  const patchWallet = (patch: Partial<WithdrawalWalletDraft>) => {
    setWallet((current) => ({ ...current, ...patch }));
  };

  const canSubmit =
    wallet.name.trim().length > 0 &&
    wallet.network.trim().length > 0 &&
    wallet.address.trim().length > 0;

  return (
    <Stack spacing={2}>
      <SettingsInfoField
        label="Wallet Name"
        size="small"
        fullWidth
        value={wallet.name}
        onChange={(event) => patchWallet({ name: event.target.value })}
        info="Friendly name, for example Redotpay or Hosting Wallet."
      />

      <WithdrawalNetworkAutocomplete
        label="Network"
        value={wallet.network}
        onChange={(network) => patchWallet({ network })}
        helperText="Saved as a Binance network code, for example TRX or BSC."
      />

      <SettingsInfoField
        label="Wallet Address"
        size="small"
        fullWidth
        value={wallet.address}
        onChange={(event) => patchWallet({ address: event.target.value })}
        info="External wallet address for this network."
      />

      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          disabled={!canSubmit}
          onClick={() => {
            onSubmit({
              ...wallet,
              id: wallet.id || createWalletId(),
              name: wallet.name.trim(),
              network: wallet.network.trim().toUpperCase(),
              address: wallet.address.trim(),
            });
            onClose();
          }}
          variant="contained"
        >
          {submitLabel}
        </Button>
      </Stack>
    </Stack>
  );
}

export function WithdrawalWalletCreateDialog(props: {
  onCreate: (wallet: WithdrawalWalletDraft) => void;
  walletCount: number;
}) {
  const { onCreate, walletCount } = props;

  return (
    <ButtonDialog
      title="Add Wallet"
      titleLong="Add Wallet Book Entry"
      variant="outlined"
      startIcon={<AddCircleOutlineIcon />}
    >
      {(handleClose) => (
        <WithdrawalWalletForm
          initialWallet={createDefaultWallet(walletCount)}
          onClose={handleClose}
          onSubmit={onCreate}
          submitLabel="Add Wallet"
        />
      )}
    </ButtonDialog>
  );
}

export function WithdrawalWalletUpdateDialog(props: {
  onUpdate: (wallet: WithdrawalWalletDraft) => void;
  wallet: WithdrawalWalletDraft;
}) {
  const { onUpdate, wallet } = props;

  return (
    <ButtonDialog
      title="Update"
      titleLong={`Update ${wallet.name}`}
      customButton={(handleOpen) => (
        <Button
          onClick={handleOpen}
          size="small"
          startIcon={<EditOutlinedIcon />}
        >
          Update
        </Button>
      )}
    >
      {(handleClose) => (
        <WithdrawalWalletForm
          initialWallet={wallet}
          onClose={handleClose}
          onSubmit={onUpdate}
          submitLabel="Update Wallet"
        />
      )}
    </ButtonDialog>
  );
}

export function WithdrawalWalletDeleteDialog(props: {
  onDelete: (walletId: string) => void;
  usedByScheduleNames: string[];
  wallet: WithdrawalWalletDraft;
}) {
  const { onDelete, usedByScheduleNames, wallet } = props;

  return (
    <ButtonDialog
      title="Delete"
      titleLong={`Delete ${wallet.name}`}
      customButton={(handleOpen) => (
        <Button
          color="error"
          onClick={handleOpen}
          size="small"
          startIcon={<DeleteOutlineIcon />}
        >
          Delete
        </Button>
      )}
    >
      {(handleClose) => (
        <Stack spacing={2}>
          <Alert severity={usedByScheduleNames.length > 0 ? "warning" : "info"}>
            Delete wallet &quot;{wallet.name}&quot;?
          </Alert>
          {usedByScheduleNames.length > 0 && (
            <Typography variant="body2">
              Used by: {usedByScheduleNames.join(", ")}. These schedules will
              keep this wallet&apos;s current network and address as custom
              fallback values.
            </Typography>
          )}
          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              color="error"
              onClick={() => {
                onDelete(wallet.id);
                handleClose();
              }}
              variant="contained"
            >
              Delete Wallet
            </Button>
          </Stack>
        </Stack>
      )}
    </ButtonDialog>
  );
}
