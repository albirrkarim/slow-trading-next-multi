"use client";

import { Box, TextField } from "@mui/material";

import CoinTagSelect from "./CoinTagSelect";

interface CoinMetadataEditorProps {
  availableTags: string[];
  description: string;
  onDescriptionChange: (description: string) => void;
  onTagsChange: (tags: string[]) => void;
  tagColors: Record<string, string>;
  tagDescriptions: Record<string, string>;
  tags: string[];
}

export default function CoinMetadataEditor({
  availableTags,
  description,
  onDescriptionChange,
  onTagsChange,
  tagColors,
  tagDescriptions,
  tags,
}: CoinMetadataEditorProps) {
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <CoinTagSelect
        onChange={onTagsChange}
        options={availableTags}
        tagColors={tagColors}
        tagDescriptions={tagDescriptions}
        value={tags}
      />
      <TextField
        defaultValue={description}
        fullWidth
        key={description}
        minRows={2}
        multiline
        onBlur={(event) => {
          const normalized = event.target.value.trim();
          if (normalized !== description) onDescriptionChange(normalized);
        }}
        sx={{ my: 2 }}
        variant="standard"
        placeholder="Notes"
        size="small"
        slotProps={{ htmlInput: { maxLength: 1_000 } }}
      />
    </Box>
  );
}
