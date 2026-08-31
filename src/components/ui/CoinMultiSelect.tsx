"use client";

import * as React from "react";
import {
    Autocomplete,
    TextField,
    Typography,
    Chip,
    Button,
} from "@mui/material";
import { COINS_DETAIL } from "../constants";
import { CopyText } from "./CopyText";

interface CoinMultiAutocompleteProps {
    value: string[];
    onChange: (selected: string[]) => void;
    label?: string;
    showLength?: number;
}

export default function CoinMultiAutocomplete({
    value,
    onChange,
    label = "Symbols",
    showLength = 5,
}: CoinMultiAutocompleteProps) {
    const [focused, setFocused] = React.useState(false);

    const handleChange = (_: any, newValue: string[]) => {
        const sorted = [...newValue].sort((a, b) => a.localeCompare(b));
        onChange(sorted);
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
        const pasted = event.clipboardData.getData("text");
        if (pasted) {
            event.preventDefault();
            const parsed = pasted
                .split(/[\s,;\n]+/)
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);

            const unique = Array.from(new Set([...value, ...parsed]));
            const sorted = unique.sort((a, b) => a.localeCompare(b));
            onChange(sorted);
        }
    };

    // const displayedValues = focused ? value : value.slice(0, 2);
    const remainingCount =
        !focused && value.length > showLength ? value.length - showLength : 0;

    return (
        <Autocomplete
            multiple
            freeSolo
            open={focused}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            options={[...COINS_DETAIL.map((coin) => coin.symbol)].sort()}
            value={value}
            onChange={handleChange}
            filterSelectedOptions
            renderValue={(tagValue, getTagProps) =>
                !focused ? (
                    <Typography variant="body2" sx={{ pl: 1, py: 0.5 }}>
                        {value.slice(0, showLength).join(", ")}
                        {remainingCount > 0 ? `, and ${remainingCount} more` : ""}
                    </Typography>
                ) : (
                    tagValue.map((option, index) => {
                        const { key, ...chipProps } = getTagProps({ index });
                        return (
                            <Chip
                                key={key}
                                label={option}
                                size="small"
                                {...chipProps} // ✅ enables onDelete
                            />
                        );
                    })
                )
            }
            renderOption={(props, option) => {
                const coin = COINS_DETAIL.find((c) => c.symbol === option);
                return (
                    <li {...props} key={option}>
                        <Button title={coin?.description || ""}>{option}</Button>
                    </li>
                );
            }}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={label}
                    size="small"
                    placeholder="Type or paste symbols (comma-separated)"
                    onPaste={handlePaste}
                    slotProps={{
                        input: {
                            ...params.InputProps,
                            endAdornment: (
                                <>
                                    <CopyText text={value.join(", ")} />
                                    {params.InputProps.endAdornment}
                                </>
                            ),
                        },
                    }}
                />
            )}
        />
    );
}
