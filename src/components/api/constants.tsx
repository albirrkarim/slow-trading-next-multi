
export const UI_TEMP = "storage/datasets/UI_TEMP";
export const COMMON_TIME = `${UI_TEMP}/COMMON_TIME`;
export const KLINES_FOLDER = `${UI_TEMP}/KLINES`;
export const BACKTEST_FOLDER = `${UI_TEMP}/BACKTEST`;
export const VOLATILITY_FOLDER = `${UI_TEMP}/VOLATILITY`;
// export const CHUNKS_FOLDER = `${UI_TEMP}/CHUNKS`;

export function makeScopedFolder({ range, interval, baseFolder = KLINES_FOLDER }: {
    range?: string,
    interval: string,
    baseFolder: string,
}) {
    return `${baseFolder}/${range}_${interval}`
}
