
// export function applyTimeWindow(
//   seriesArr: SeriesMinimal[][],
//   start: number,
//   end: number
// ) {
//   for (let i = 0, len = seriesArr.length; i < len; i++) {
//     const filtered = seriesArr[i]
//       // keep only data within range
//       .filter((p) => p.time >= start && p.time <= end);

//     // add bumpers
//     filtered.unshift({ time: start, level: 0 });
//     filtered.push({ time: end, level: 0 });

//     // ensure chronological order
//     filtered.sort((a, b) => a.time - b.time);

//     // replace back
//     seriesArr[i] = filtered;
//   }
// }

export function applyTimeWindow(
  seriesArr: { time: number; [key: string]: any }[][],
  start: number,
  end: number,
  justCut = false
) {
  for (let i = 0; i < seriesArr.length; i++) {
    // 1️⃣ Filter points within the window
    const filtered = seriesArr[i].filter(
      (p) => p.time >= start && p.time <= end
    );

    // 2️⃣ If no data in range — leave it empty (no bumpers)
    if (filtered.length === 0) {
      seriesArr[i] = [];
      continue;
    }

    if (justCut) {
      seriesArr[i] = filtered;
      continue;
    }

    // 3️⃣ Clone first & last items for smooth start/end bumpers
    const firstBumper = { ...filtered[0], time: start };
    const lastBumper = { ...filtered[filtered.length - 1], time: end };

    // 4️⃣ Insert bumpers and keep sorted
    const withBumpers = [firstBumper, ...filtered, lastBumper].sort(
      (a, b) => a.time - b.time
    );

    // 5️⃣ Replace back into the array
    seriesArr[i] = withBumpers;
  }
}
