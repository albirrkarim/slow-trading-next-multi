import { tradeLog } from "@/lib/trading/helper/log";
// This file contains function that used when TTS is playing
const stackTimeout: Record<string, number | undefined> = {
  global: undefined,
};

/**
 * Delay execution of function
 *
 * When the function is called multiple times, it will only execute the last call
 * after the delay time has passed.
 *
 * The param "id" is for differentiating between different stacks of timeouts.
 *
 * @param func
 * @param delayTime
 * @param id - its like a scope
 */
export function delayExecution(
  func: () => any,
  delayTime: number = 50,
  id = "global"
): void {
  if (stackTimeout[id]) {
    clearTimeout(stackTimeout[id]);
  }

  stackTimeout[id] = setTimeout(() => {
    func();
  }, delayTime) as unknown as number;
}

const executionQueues: Record<string, Promise<void>> = {};

export function queueExecution(
  func: () => any,
  delayTime: number = 50,
  id: string = "global"
): void {
  // Ensure an entry for the given `id` exists in the executionQueues
  if (executionQueues[id] === undefined) {
    executionQueues[id] = Promise.resolve();
  }

  // Chain the execution of the new function onto the existing queue
  executionQueues[id] = executionQueues[id]
    .then(async () => {
      await new Promise((resolve) => setTimeout(resolve, delayTime));
      await func();
    })
    .catch((err) => {
      tradeLog.error(`Error in queueExecution (id: ${id}):`, err);
    });
}

/**
 * Sometimes we need to deep copy an object
 * so we can modify the object without affecting the original object
 * @param item
 * @returns
 */
export function deepCopy<T>(item: T): T {
  return JSON.parse(JSON.stringify(item));
}
