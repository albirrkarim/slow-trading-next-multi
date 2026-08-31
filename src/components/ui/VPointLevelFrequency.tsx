import { Box, Typography } from "@mui/material";

/** Maps absolute vPoint levels to their compact severity color. */
function getLevelFrequencyColor(level: string) {
  const absoluteLevel = Math.abs(Number(level));
  if (absoluteLevel === 0) return undefined;
  if (absoluteLevel >= 5) return "error.main";
  if (absoluteLevel >= 3) return "warning.main";
  return "success.main";
}

export default function VPointLevelFrequency({
  frequency,
}: {
  frequency: Record<string, number>;
}) {
  return (
    <Typography color="text.secondary" display="block" variant="caption">
      {Object.entries(frequency)
        .sort(([left], [right]) => Number(right) - Number(left))
        .map(([level, count], index) => (
          <Box
            component="span"
            key={level}
            sx={{ color: getLevelFrequencyColor(level) }}
          >
            {index > 0 && ", "}
            {level}[{count}]
          </Box>
        ))}
    </Typography>
  );
}
