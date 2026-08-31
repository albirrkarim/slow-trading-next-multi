"use client";

import ButtonDialog from "@/components/ui/ButtonDialog";
import {
  pruneCoinFilterConfig,
  type CoinFilterConfig,
} from "@/lib/devBacktest/coins/filter-config";
import {
  DEFAULT_COIN_TAG_COLOR,
  type CoinTag,
  type CoinTagState,
} from "@/lib/devBacktest/coins/tag-types";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import CoinTagChip from "./CoinTagChip";
import { CopyText } from "@/components/ui/CopyText";

export interface TagData {
  tagId?: number;
  text: string;
  color: string;
  description: string;
  filters: string;
}

interface CoinTagManagerDialogProps {
  onCreate: (data: TagData) => Promise<void>;
  onCoinTagsChange: (symbol: string, tags: string[]) => Promise<void> | void;
  onDelete: (tagId: number) => Promise<void>;
  onUpdate: (data: TagData) => Promise<void>;
  state: CoinTagState;
}

function stringifyTagFilters(filters: CoinFilterConfig | null | undefined) {
  return filters ? JSON.stringify(pruneCoinFilterConfig(filters), null, 2) : "";
}

function TagEditor({
  onDelete,
  onUpdate,
  tag,
}: {
  onDelete: CoinTagManagerDialogProps["onDelete"];
  onUpdate: CoinTagManagerDialogProps["onUpdate"];
  tag: CoinTag;
}) {
  const [text, setText] = useState(tag.text);
  const [color, setColor] = useState(tag.color);
  const [description, setDescription] = useState(tag.description);
  const [filtersJson, setFiltersJson] = useState(() =>
    stringifyTagFilters(tag.filters),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(tag.text);
    setColor(tag.color);
    setDescription(tag.description);
    setFiltersJson(stringifyTagFilters(tag.filters));
  }, [tag.color, tag.description, tag.filters, tag.text]);

  const changed =
    text.trim() !== tag.text ||
    color !== tag.color ||
    description.trim() !== tag.description ||
    filtersJson.trim() !== stringifyTagFilters(tag.filters);

  return (
    <Box
      sx={{
        alignItems: "start",
        display: "grid",
        gap: 1,
        gridTemplateColumns: {
          xs: "1fr",
          sm: "minmax(140px, 1fr) 50px minmax(180px, 2fr) minmax(220px, 1.3fr) auto auto",
        },
      }}
    >
      <TextField
        label="Tag"
        onChange={(event) => setText(event.target.value)}
        size="small"
        value={text}
      />
      <TextField
        aria-label={`${tag.text} color`}
        onChange={(event) => setColor(event.target.value)}
        size="small"
        sx={{
          width: "50px",
        }}
        slotProps={{ htmlInput: { style: { cursor: "pointer", padding: 4 } } }}
        type="color"
        value={color}
      />
      <TextField
        label="Description"
        multiline
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Shown when hovering this tag"
        size="small"
        slotProps={{ htmlInput: { maxLength: 1_000 } }}
        value={description}
      />
      <TextField
        label="Filters JSON"
        multiline
        onChange={(event) => setFiltersJson(event.target.value)}
        placeholder='{"maxLevelAbsolute":"5"}'
        size="small"
        slotProps={{ htmlInput: { spellCheck: false } }}
        value={filtersJson}
      />
      <Button
        disabled={!changed || !text.trim() || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onUpdate({
              tagId: tag.tagId,
              text,
              color,
              description,
              filters: filtersJson,
            });
          } finally {
            setSaving(false);
          }
        }}
        size="small"
      >
        Save
      </Button>
      <IconButton
        color="error"
        disabled={saving}
        onClick={async () => {
          if (!window.confirm(`Delete tag “${tag.text}” from all coins?`)) {
            return;
          }
          setSaving(true);
          try {
            await onDelete(tag.tagId);
          } finally {
            setSaving(false);
          }
        }}
        size="small"
        title={`Delete ${tag.text}`}
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

function TagManagerContent({
  onCreate,
  onCoinTagsChange,
  onDelete,
  onUpdate,
  state,
}: CoinTagManagerDialogProps) {
  const [newText, setNewText] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COIN_TAG_COLOR);
  const [newDescription, setNewDescription] = useState("");
  const [newFiltersJson, setNewFiltersJson] = useState("");
  const [tab, setTab] = useState<"tags" | "attachments">("tags");
  const [saving, setSaving] = useState(false);
  const [savingAttachmentKey, setSavingAttachmentKey] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const perform = async (operation: () => Promise<void>) => {
    setError(null);
    try {
      await operation();
      return true;
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "Tag operation failed",
      );
      return false;
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <Tabs
        onChange={(_event, value: "tags" | "attachments") => setTab(value)}
        value={tab}
      >
        <Tab label="Tags CRUD" value="tags" />
        <Tab label="Coin attachments" value="attachments" />
      </Tabs>

      {tab === "tags" && (
        <Stack spacing={2}>
          <Box
            sx={{
              alignItems: "center",
              display: "grid",
              gap: 1,
              gridTemplateColumns: {
                xs: "1fr",
                sm: "minmax(140px, 1fr) 76px minmax(180px, 1.3fr) minmax(220px, 2fr) auto",
              },
            }}
          >
            <TextField
              autoFocus
              label="New tag"
              onChange={(event) => setNewText(event.target.value)}
              size="small"
              value={newText}
            />
            <TextField
              aria-label="New tag color"
              onChange={(event) => setNewColor(event.target.value)}
              size="small"
              slotProps={{
                htmlInput: { style: { cursor: "pointer", padding: 4 } },
              }}
              type="color"
              value={newColor}
            />
            <TextField
              label="Description"
              multiline
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="Shown on tag hover"
              size="small"
              slotProps={{ htmlInput: { maxLength: 1_000 } }}
              value={newDescription}
            />
            <TextField
              label="Filters JSON"
              multiline
              onChange={(event) => setNewFiltersJson(event.target.value)}
              placeholder='{"maxLevelAbsolute":"5"}'
              size="small"
              slotProps={{ htmlInput: { spellCheck: false } }}
              value={newFiltersJson}
            />
            <Button
              disabled={!newText.trim() || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const created = await perform(() =>
                    onCreate({
                      text: newText,
                      color: newColor,
                      description: newDescription,
                      filters: newFiltersJson,
                    }),
                  );
                  if (created) {
                    setNewText("");
                    setNewDescription("");
                    setNewFiltersJson("");
                  }
                } finally {
                  setSaving(false);
                }
              }}
              variant="contained"
            >
              Add
            </Button>
          </Box>

          <Stack spacing={1}>
            {state.tags.map((tag) => (
              <TagEditor
                key={tag.tagId}
                onDelete={async (tagId) => {
                  await perform(() => onDelete(tagId));
                }}
                onUpdate={async ({
                  tagId,
                  text,
                  color,
                  description,
                  filters,
                }) => {
                  await perform(() =>
                    onUpdate({ tagId, text, color, description, filters }),
                  );
                }}
                tag={tag}
              />
            ))}
            {state.tags.length === 0 && (
              <Typography color="text.secondary" variant="body2">
                No tags yet.
              </Typography>
            )}
          </Stack>
        </Stack>
      )}

      {tab === "attachments" && (
        <Stack spacing={1}>
          {state.tags.map((tag) => (
            <Paper key={tag.tagId} variant="outlined" sx={{ p: 1 }}>
              <Box
                sx={{ alignItems: "center", display: "flex", gap: 1, mb: 1 }}
              >
                <CoinTagChip
                  description={tag.description}
                  label={tag.text}
                  size="small"
                  tagColor={tag.color}
                />
                <Typography color="text.secondary" variant="body2">
                  {tag.coins.length} {tag.coins.length === 1 ? "coin" : "coins"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {tag.coins.map((coin) => (
                  <CoinTagChip
                    key={coin}
                    deleteIcon={<DeleteOutlineIcon />}
                    disabled={savingAttachmentKey === `${tag.tagId}:${coin}`}
                    label={coin}
                    onDelete={async () => {
                      const attachmentKey = `${tag.tagId}:${coin}`;
                      setSavingAttachmentKey(attachmentKey);
                      await perform(async () => {
                        const tagKey = tag.text.toLocaleLowerCase();
                        const currentTags = state.coinTags[coin] ?? [tag.text];
                        const nextTags = currentTags.filter(
                          (item) => item.toLocaleLowerCase() !== tagKey,
                        );
                        await onCoinTagsChange(coin, nextTags);
                      });
                      setSavingAttachmentKey((current) =>
                        current === attachmentKey ? null : current,
                      );
                    }}
                    size="small"
                    tagColor={tag.color}
                    title={`Remove ${coin} from ${tag.text}`}
                    variant="outlined"
                  />
                ))}

                <CopyText text={tag.coins.join(", ")} />

                {tag.coins.length === 0 && (
                  <Typography color="text.secondary" variant="caption">
                    Not attached to a coin.
                  </Typography>
                )}
              </Box>
            </Paper>
          ))}
          {state.tags.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              No tags yet.
            </Typography>
          )}
        </Stack>
      )}
    </Stack>
  );
}

export default function CoinTagManagerDialog(props: CoinTagManagerDialogProps) {
  return (
    <ButtonDialog
      maxWidth="lg"
      size="small"
      startIcon={<LocalOfferOutlinedIcon />}
      title="Tags"
      titleLong="Manage coin tags"
      variant="outlined"
    >
      {() => <TagManagerContent {...props} />}
    </ButtonDialog>
  );
}
