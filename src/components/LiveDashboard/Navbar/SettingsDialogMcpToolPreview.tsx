import { Box, Chip, Tooltip, Typography } from "@mui/material";

import type { SlowTradingMcpPermission } from "@/lib/slowTrading/types";

export interface McpToolCatalogItem {
  description: string;
  name: string;
  permission: SlowTradingMcpPermission;
  readOnly: boolean;
}

interface SettingsDialogMcpToolPreviewProps {
  permissions: SlowTradingMcpPermission[];
  tools: McpToolCatalogItem[];
}

export default function SettingsDialogMcpToolPreview(
  props: SettingsDialogMcpToolPreviewProps,
) {
  const exposedTools = props.tools.filter((tool) =>
    props.permissions.includes(tool.permission),
  );

  return (
    <Box
      sx={(theme) => ({
        backgroundColor: theme.palette.action.hover,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        p: 1.25,
      })}
    >
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          mb: exposedTools.length > 0 ? 1 : 0,
        }}
      >
        <Typography fontWeight={700} variant="caption">
          Tools exposed by this token
        </Typography>
        <Chip
          label={`${exposedTools.length} ${exposedTools.length === 1 ? "tool" : "tools"}`}
          size="small"
          variant="outlined"
        />
      </Box>

      {exposedTools.length === 0 && (
        <Typography color="text.secondary" variant="caption">
          Select at least one permission to expose MCP tools.
        </Typography>
      )}

      {exposedTools.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {exposedTools.map((tool) => (
            <Tooltip
              key={tool.name}
              arrow
              placement="top"
              title={`${tool.readOnly ? "Read-only" : "Write"} · ${tool.description}`}
            >
              <Chip
                color={tool.readOnly ? "info" : "warning"}
                label={tool.name}
                size="small"
                variant="outlined"
              />
            </Tooltip>
          ))}
        </Box>
      )}
    </Box>
  );
}
