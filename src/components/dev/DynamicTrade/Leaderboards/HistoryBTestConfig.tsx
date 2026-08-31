"use client";

import type { ReactNode } from "react";

import ButtonDialog from "@/components/ui/ButtonDialog";
import IconButtonTooltip from "@/components/ui/IconButtonTooltip";
import HistoryIcon from "@mui/icons-material/History";
import { Box, CircularProgress, type SxProps, Typography } from "@mui/material";
import type { Theme } from "@mui/material/styles";

import Leaderboards, { type LeaderboardsProps } from "./Leaderboards";

interface HistoryBTestConfigProps
    extends Omit<LeaderboardsProps, "handleClose"> {
    customButton?: (handleOpen: () => void, loading: boolean) => ReactNode;
    dialogTitle?: ReactNode;
    sx?: SxProps<Theme>;
}

export default function HistoryBTestConfig(props: HistoryBTestConfigProps) {
    const {
        customButton,
        dialogTitle,
        sx,
        ...leaderboardProps
    } = props;

    return (
        <ButtonDialog
            title={
                <Box
                    sx={{
                        display: "flex",
                        gap: 1,
                    }}
                >
                    <Typography variant="body1">
                        {dialogTitle ?? "Leaderboards"}
                    </Typography>
                </Box>
            }
            customButton={(handleOpen) =>
                customButton ? (
                    customButton(handleOpen, leaderboardProps.historyLoading)
                ) : (
                    <IconButtonTooltip
                        disabled={leaderboardProps.historyLoading}
                        onClick={async () => {
                            await leaderboardProps.loadHistory();
                            handleOpen();
                        }}
                    >
                        {leaderboardProps.historyLoading ? <CircularProgress size={18} /> : <HistoryIcon />}
                    </IconButtonTooltip>
                )
            }
            maxWidth={false}
            sx={sx ?? {
                width: "100%", // ⬅ force 100% width
                maxWidth: "100%", // ⬅ prevent shrinking
            }}
        >
            {(handleClose) => <Leaderboards {...leaderboardProps} handleClose={handleClose} />}
        </ButtonDialog>
    );
}
