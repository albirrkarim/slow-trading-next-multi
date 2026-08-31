"use client";

import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import {
    Box,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Tooltip,
    Typography,
} from "@mui/material";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import CrisisAlertIcon from "@mui/icons-material/CrisisAlert";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const drawerWidth = 260;

const sidebarSections = [
    {
        title: "Slow Trading",
        items: [
            {
                text: "Precision Trade (Slow)",
                href: "/slow",
                icon: <DashboardIcon />,
                description: "Live dashboard for the standalone slow trading workflow.",
            },
        ],
    },
    {
        title: "Development",
        items: [
            {
                text: "Black Swan Backtest",
                href: "/dev/black-swan",
                icon: <CrisisAlertIcon />,
                description: "Replay portfolio crash protection from raw closed one-minute candles.",
            },
            {
                text: "Good Coin Finder",
                href: "/dev/coins",
                icon: <TravelExploreIcon />,
                description: "Compare Binance coin volatility levels across cached two- and five-year datasets.",
            },
            {
                text: "Backtest Agent Live Trade History",
                href: "/dev/dynamic-trade",
                icon: <ShowChartIcon />,
                description: "Inspect one symbol with chart context, volatility rails, and simulated trade behavior for debugging.",
            },
        ],
    },
] as const;

export default function SidebarButton() {
    const [open, setOpen] = React.useState(false);
    const pathname = usePathname();

    const toggleDrawer = () => setOpen(!open);

    const drawerContent = (
        <Box sx={{ width: drawerWidth }}>
            <Box sx={{ p: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                    Slow Trading
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    All Time is in UTC
                </Typography>
            </Box>

            <Divider />

            <Box sx={{ p: 2 }}>
                {sidebarSections.map((section, sectionIndex) => (
                    <React.Fragment key={section.title}>
                        <Typography variant="subtitle1" fontWeight={600}>
                            {section.title}
                        </Typography>

                        <List>
                            {section.items.map((item) => (
                                <ListItem key={item.text} disablePadding>
                                    <Tooltip
                                        placement="right"
                                        arrow
                                        title={
                                            <Typography variant="body2">
                                                {item.description}
                                            </Typography>
                                        }
                                    >
                                        <ListItemButton
                                            component={Link}
                                            href={item.href}
                                            onClick={() => setOpen(false)}
                                            selected={
                                                pathname === item.href ||
                                                pathname?.startsWith(`${item.href}/`)
                                            }
                                        >
                                            <ListItemIcon>{item.icon}</ListItemIcon>
                                            <ListItemText primary={item.text} />
                                        </ListItemButton>
                                    </Tooltip>
                                </ListItem>
                            ))}
                        </List>

                        {sectionIndex < sidebarSections.length - 1 ? (
                            <Divider sx={{ my: 2 }} />
                        ) : null}
                    </React.Fragment>
                ))}
            </Box>
        </Box>
    );

    return (
        <>
            <IconButton color="inherit" onClick={toggleDrawer} size="small">
                <MenuIcon />
            </IconButton>

            {/* Sidebar Drawer */}
            <Drawer
                anchor="left"
                open={open}
                onClose={toggleDrawer}
                sx={{
                    "& .MuiDrawer-paper": {
                        width: drawerWidth,
                        boxSizing: "border-box",
                    },
                }}
            >
                {drawerContent}
            </Drawer>
        </>
    );
}
