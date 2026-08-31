import dotenv from "dotenv";

dotenv.config();

// async function resaveJsonFilesRecursively(rootDir: string) {
//   const entries = await fs.readdir(rootDir, { withFileTypes: true });

//   for (const entry of entries) {
//     const fullPath = path.join(rootDir, entry.name);

//     if (entry.isDirectory()) {
//       await resaveJsonFilesRecursively(fullPath);
//       continue;
//     }

//     if (!entry.isFile()) continue;
//     if (!entry.name.toLowerCase().endsWith(".json")) continue;

//     const data = await fs.readJSON(fullPath);
//     await fs.writeJSON(fullPath, data);
//   }
// }

async function main() {
  // binanceTest()
  // okxTest()
  // list file on dir storage/backtest/test_case
  // const files = await fs.readdir(path.join("storage/backtest/test_case"));
  // console.log(files.length);
  // for (const file of files) {
  //   const datasets = await fs.readJSON(
  //     path.join("storage/backtest/test_case", file),
  //   );
  //   for (const dataset of datasets) {
  //     dataset.netProfitPercentHistory = (
  //       dataset.netProfitPercentHistory ?? []
  //     ).map((i: any) => ({
  //       t: i.t ?? i.timeMs ?? 0,
  //       pct: parseFloat((i.pct ?? i.percent ?? 0).toFixed(3)),
  //     }));
  //   }
  //   await fs.writeJSON(path.join("storage/backtest/test_case", file), datasets);
  //   console.log(file);
  //   // break;
  // }
  // make it efficient using like this (resave). doit reqursively.
  // await fs.writeJSON("storage/tmp/state.json", state);
  // await resaveJsonFilesRecursively(path.join("storage/backtest/history"));
  // const leverageFromProbability = Math.floor(mapScaleValue(0.3, 1, 0.75, 3, 5));
  // console.log("leverageFromProbability", leverageFromProbability);
}

main();
