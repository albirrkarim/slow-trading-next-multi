let mutationQueue: Promise<unknown> = Promise.resolve();

/**
 * Serializes short SLOW persistence mutations that must not overwrite trading state.
 */
function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(task, task);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

const slowTradingMutationQueue = {
  runExclusive,
} as const;

export default slowTradingMutationQueue;
export { slowTradingMutationQueue };
