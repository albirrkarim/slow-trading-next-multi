"use client";

import { Autocomplete, TextField } from "@mui/material";
import type { MouseEvent } from "react";
import CoinTagChip from "./CoinTagChip";

export default function CoinTagSelect({
  allowCreate = true,
  label = "",
  onChange,
  options,
  tagColors = {},
  tagDescriptions = {},
  value,
}: {
  allowCreate?: boolean;
  label?: string;
  onChange: (tags: string[]) => void;
  options: string[];
  tagColors?: Record<string, string>;
  tagDescriptions?: Record<string, string>;
  value: string[];
}) {
  return (
    <Autocomplete
      disableClearable
      filterSelectedOptions
      freeSolo={allowCreate}
      // limitTags={4}
      multiple
      onChange={(_event, nextValue) => {
        const normalized = new Map<string, string>();
        for (const nextTag of nextValue) {
          const tag = nextTag.trim().replace(/\s+/g, " ").slice(0, 64);
          const key = tag.toLocaleLowerCase();
          if (tag && !normalized.has(key)) normalized.set(key, tag);
        }
        onChange(Array.from(normalized.values()));
      }}
      options={options}
      renderTags={(tags, getTagProps) =>
        tags.map((tag, index) => {
          const { key, ...chipProps } = getTagProps({ index });
          const confirmDelete = (event: MouseEvent<HTMLElement>) => {
            if (!window.confirm(`Remove tag "${tag}"?`)) return;
            chipProps.onDelete?.(event);
          };

          return (
            <CoinTagChip
              {...chipProps}
              description={tagDescriptions[tag.toLocaleLowerCase()]}
              key={key}
              label={tag}
              onDelete={confirmDelete}
              size="small"
              tagColor={tagColors[tag.toLocaleLowerCase()]}
            />
          );
        })
      }
      size="small"
      value={value}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Tags"
          variant="standard"
        />
      )}
    />
  );
}
