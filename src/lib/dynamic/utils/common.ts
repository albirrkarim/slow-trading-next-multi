interface RangeLevel {
  top: number;
  bottom: number;
}

export function onRangeLevel(level: number, ranged: RangeLevel) {
  return level <= ranged.top && level >= ranged.bottom;
}
