"use client";

import { DEFAULT_COLORS } from "@/components/client/constants";
import CoinTagChip from "@/components/dev/Coins/CoinTagChip";
import { Box, Typography } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const UNTAGGED_COLOR = "#9ca3af";
const UNTAGGED_LABEL = "Untagged";

export interface CoinTagCompositionItem {
  [key: string]: number | string | undefined;
  color: string;
  count: number;
  label?: string;
  name: string;
}

export interface CoinTagCompositionGroup {
  items: CoinTagCompositionItem[];
  name: string;
  total: number;
}

interface CoinTagFamily {
  key: string;
  label: string;
  name: string;
  number?: number;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function getNumberedTagFamily(tagName: string) {
  const numberMatch = tagName.match(/\d+/);
  if (!numberMatch || !/[a-z]/i.test(tagName)) return null;

  const name = tagName.replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return null;

  return {
    key: name.toLocaleLowerCase(),
    name,
    number: Number(numberMatch[0]),
  };
}

function getColonTagFamily(tagName: string): CoinTagFamily | null {
  const separatorIndex = tagName.indexOf(":");
  if (separatorIndex < 1) return null;

  const name = tagName.slice(0, separatorIndex).trim();
  const label = tagName.slice(separatorIndex + 1).trim();
  if (!name || !label) return null;

  return {
    key: name.toLocaleLowerCase(),
    label,
    name,
  };
}

function getTagFamily(tagName: string): CoinTagFamily | null {
  const colonFamily = getColonTagFamily(tagName);
  if (colonFamily) return colonFamily;

  const numberedFamily = getNumberedTagFamily(tagName);
  if (!numberedFamily) return null;

  return {
    key: numberedFamily.key,
    label: String(numberedFamily.number),
    name: numberedFamily.name,
    number: numberedFamily.number,
  };
}

function sortGroupedTagItems(
  items: CoinTagCompositionItem[],
  metadata: Map<string, { label: string; number?: number }>,
) {
  return [...items].sort((left, right) => {
    const leftNumber = metadata.get(left.name)?.number;
    const rightNumber = metadata.get(right.name)?.number;
    if (leftNumber !== undefined && rightNumber !== undefined) {
      const byNumber = leftNumber - rightNumber;
      return byNumber === 0 ? left.name.localeCompare(right.name) : byNumber;
    }
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    const byCount = right.count - left.count;
    return byCount === 0 ? left.name.localeCompare(right.name) : byCount;
  });
}

function applyGroupedTagLabels(
  items: CoinTagCompositionItem[],
  metadata: Map<string, { label: string; number?: number }>,
) {
  return items.map((item) => {
    const label = metadata.get(item.name)?.label;
    return label === undefined ? item : { ...item, label };
  });
}

/** Counts tag assignments for the configured SLOW coin universe. */
export function buildConfiguredCoinTagComposition({
  coinTags,
  configuredSymbols,
  tagColors,
}: {
  coinTags: Record<string, string[]>;
  configuredSymbols: string[];
  tagColors: Record<string, string>;
}): CoinTagCompositionItem[] {
  const configured = Array.from(
    new Set(configuredSymbols.map(normalizeSymbol).filter(Boolean)),
  );
  const normalizedCoinTags = Object.fromEntries(
    Object.entries(coinTags).map(([symbol, tags]) => [
      normalizeSymbol(symbol),
      tags,
    ]),
  );
  const counts = new Map<string, number>();

  for (const symbol of configured) {
    const tags = Array.from(
      new Set(
        (normalizedCoinTags[symbol] ?? [])
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    );

    if (tags.length === 0) {
      counts.set(UNTAGGED_LABEL, (counts.get(UNTAGGED_LABEL) ?? 0) + 1);
      continue;
    }

    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map<CoinTagCompositionItem>(([name, count], index) => ({
      color:
        name === UNTAGGED_LABEL
          ? UNTAGGED_COLOR
          : (tagColors[name.toLocaleLowerCase()] ??
            DEFAULT_COLORS[index % DEFAULT_COLORS.length]),
      count,
      name,
    }))
    .sort((left, right) => {
      const byCount = right.count - left.count;
      return byCount === 0 ? left.name.localeCompare(right.name) : byCount;
    });
}

/** Splits repeated numbered tag families into separate chart groups. */
export function buildConfiguredCoinTagCompositionGroups({
  coinTags,
  configuredSymbols,
  tagColors,
}: {
  coinTags: Record<string, string[]>;
  configuredSymbols: string[];
  tagColors: Record<string, string>;
}): CoinTagCompositionGroup[] {
  const composition = buildConfiguredCoinTagComposition({
    coinTags,
    configuredSymbols,
    tagColors,
  });
  const tagGroups = new Map<
    string,
    CoinTagCompositionGroup & {
      metadata: Map<string, { label: string; number?: number }>;
    }
  >();
  const otherItems: CoinTagCompositionItem[] = [];

  for (const item of composition) {
    const family = getTagFamily(item.name);
    if (!family) {
      otherItems.push(item);
      continue;
    }

    const group = tagGroups.get(family.key) ?? {
      items: [],
      name: family.name,
      metadata: new Map<string, { label: string; number?: number }>(),
      total: 0,
    };
    group.items.push(item);
    group.metadata.set(item.name, {
      label: family.label,
      number: family.number,
    });
    group.total += item.count;
    tagGroups.set(family.key, group);
  }

  const groups = [...tagGroups.values()]
    .flatMap((group) =>
      group.items.length < 2
        ? []
        : [
          {
            items: applyGroupedTagLabels(
              sortGroupedTagItems(group.items, group.metadata),
              group.metadata,
            ),
            name: group.name,
            total: group.total,
          },
        ],
    )
    .sort((left, right) => {
      const byTotal = right.total - left.total;
      return byTotal === 0 ? left.name.localeCompare(right.name) : byTotal;
    });

  for (const group of tagGroups.values()) {
    if (group.items.length === 1) {
      otherItems.push(group.items[0]);
    }
  }

  if (otherItems.length > 0) {
    groups.push({
      items: otherItems,
      name: "Other",
      total: otherItems.reduce((sum, item) => sum + item.count, 0),
    });
  }

  return groups;
}

function CoinTagCompositionChart({
  group,
  tagDescriptions,
}: {
  group: CoinTagCompositionGroup;
  tagDescriptions: Record<string, string>;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography fontWeight={700} variant="body2">
        {group.name} ({group.total.toLocaleString()})
      </Typography>
      <Box sx={{ height: 190, mt: 0.5, minWidth: 0 }}>
        <ResponsiveContainer height="100%" minWidth={0} width="100%">
          <PieChart>
            <Pie
              data={group.items}
              dataKey="count"
              innerRadius="48%"
              nameKey="name"
              outerRadius="78%"
              paddingAngle={1}
            >
              {group.items.map((item) => (
                <Cell fill={item.color} key={item.name} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                `${Number(value).toLocaleString()} (${(
                  (Number(value) / group.total) *
                  100
                ).toFixed(1)}%)`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      <Box
        sx={{
          alignContent: "flex-start",
          display: "flex",
          flexWrap: "wrap",
          gap: 0.75,
        }}
      >
        {group.items.map((item) => (
          <CoinTagChip
            key={item.name}
            label={`${item.label ?? item.name}: ${item.count.toLocaleString()}`}
            description={tagDescriptions[item.name.toLocaleLowerCase()]}
            size="small"
            sx={{
              borderColor: item.color,
              borderWidth: 2,
            }}
            tagColor={item.color}
            variant="outlined"
          />
        ))}
      </Box>
    </Box>
  );
}

export default function CoinTagComposition({
  coinTags,
  configuredSymbols,
  tagColors,
  tagDescriptions,
}: {
  coinTags: Record<string, string[]>;
  configuredSymbols: string[];
  tagColors: Record<string, string>;
  tagDescriptions: Record<string, string>;
}) {
  const groups = buildConfiguredCoinTagCompositionGroups({
    coinTags,
    configuredSymbols,
    tagColors,
  });

  if (configuredSymbols.length === 0 || groups.length === 0) return null;

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: {
          md: "repeat(auto-fit, minmax(240px, 1fr))",
          xs: "1fr",
        },
      }}
    >
      {groups.map((group) => (
        <CoinTagCompositionChart
          group={group}
          key={group.name}
          tagDescriptions={tagDescriptions}
        />
      ))}
    </Box>
  );
}
