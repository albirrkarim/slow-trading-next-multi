"use client";

import { COLORS_BG } from "@/components/client/constants";
import type { CoinFinderResult } from "@/lib/devBacktest/coins/types";
import { Box, useTheme } from "@mui/material";
import ForceGraph3D, {
  type ForceGraphMethods,
} from "react-force-graph-3d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SpriteText from "three-spritetext";
import {
  buildCorrelationGraphData,
  type CorrelationGraphLink,
  type CorrelationGraphNode,
} from "./correlation-graph";

const HEIGHT = 560;
const VISIBLE_EDGE_THRESHOLD = 0.4;

export default function CoinCorrelationGraph3D({
  results,
}: {
  results: CoinFinderResult[];
}) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<
    ForceGraphMethods<CorrelationGraphNode, CorrelationGraphLink> | undefined
  >(undefined);
  const forcesConfiguredRef = useRef(false);
  const [width, setWidth] = useState(900);
  const graphData = useMemo(
    () => buildCorrelationGraphData(results, COLORS_BG),
    [results],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateWidth = () => setWidth(Math.max(320, element.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    forcesConfiguredRef.current = false;
  }, [graphData]);

  const configureForces = useCallback(() => {
    if (forcesConfiguredRef.current) return;

    const linkForce = graphRef.current?.d3Force("link");
    linkForce?.distance?.(
      (link: CorrelationGraphLink) => 35 + (1 - link.score) * 240,
    );
    linkForce?.strength?.(
      (link: CorrelationGraphLink) => 0.2 + link.score * 0.8,
    );
    graphRef.current?.d3Force("charge")?.strength?.(-90);
    forcesConfiguredRef.current = true;
  }, []);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height: HEIGHT,
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
      }}
    >
      <ForceGraph3D<CorrelationGraphNode, CorrelationGraphLink>
        ref={graphRef}
        backgroundColor={theme.palette.mode === "dark" ? "#070b16" : "#eef2f7"}
        cooldownTicks={220}
        graphData={graphData}
        height={HEIGHT}
        linkColor={(link) =>
          link.score >= 0.75
            ? "#22c55e"
            : link.score >= VISIBLE_EDGE_THRESHOLD
              ? "#f59e0b"
              : "#64748b"
        }
        linkLabel={(link) => {
          const source =
            typeof link.source === "object" ? link.source.symbol : link.source;
          const target =
            typeof link.target === "object" ? link.target.symbol : link.target;
          return `${source} ↔ ${target}: ${link.score.toFixed(3)}`;
        }}
        linkOpacity={0.72}
        linkVisibility={(link) => link.score >= VISIBLE_EDGE_THRESHOLD}
        linkWidth={(link) => 0.5 + link.score * 4}
        nodeColor={(node) => node.color}
        nodeLabel={(node) =>
          `${node.symbol}<br/>Average: ${node.averageScore?.toFixed(3) ?? "—"}`
        }
        nodeOpacity={0.92}
        nodeResolution={18}
        nodeThreeObject={(node: CorrelationGraphNode) => {
          const label = new SpriteText(node.symbol);
          label.color = "#ffffff";
          label.backgroundColor = "rgba(15, 23, 42, 0.78)";
          label.padding = 2;
          label.textHeight = 5;
          return label;
        }}
        nodeThreeObjectExtend
        nodeVal={(node) => node.val}
        numDimensions={3}
        onEngineTick={configureForces}
        onEngineStop={() => graphRef.current?.zoomToFit(500, 70)}
        showNavInfo
        warmupTicks={80}
        width={width}
      />
    </Box>
  );
}
