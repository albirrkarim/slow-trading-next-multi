import { Chip, Link, Typography } from "@mui/material";
import { useMemo } from "react";

interface DisplayCoinSymbolProps {
    symbol: string;
    borderBottom?: string;
    onlyLink?: boolean;
}

export default function DisplayCoinSymbol({
    symbol,
    borderBottom,
    onlyLink
}: DisplayCoinSymbolProps) {
    const links = useMemo(
        () => [
            {
                link: `https://id.tradingview.com/symbols/${symbol}USDT/`,
                label: "TV",
            },
            {
                link: `https://www.google.com/search?q=coingecko+${symbol}+profile`,
                label: "CG",
            },
            {
                link: `https://www.google.com/search?q=tokenomist.ai+${symbol}`,
                label: "TU",
            },
            {
                link: `https://www.binance.com/en/futures/${symbol}USDT`,
                label: "B",
            },
            {
                link: `https://www.coinglass.com/pro/futures/LiquidationHeatMapNew?coin=${symbol}&type=pair`,
                label: "LM",
            },
            {
                link: `https://www.google.com/search?q=market cap overtime+${symbol}`,
                label: "CMC",
            },
        ],
        [symbol],
    );
    return (
        <>
            {!onlyLink && (
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: "bold",
                        borderBottom,
                    }}
                >
                    {symbol}
                </Typography>
            )}
            {links.map((item, index) => (
                <Chip
                    key={index}
                    component={Link}
                    href={item.link}
                    target="_blank"
                    underline="hover"
                    label={item.label}
                    size="small"
                    sx={{
                        cursor: "pointer",
                    }}
                />
            ))}
        </>
    );
}
