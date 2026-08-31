/**
 * Formats the user-facing summary for one completed averaging step.
 */
function format(params: {
  adaptiveMessageSuffix?: string;
  marginUsdt: number;
  stepLevel: number;
}): string {
  return (
    `AVERAGED: margin $${params.marginUsdt.toFixed(2)} ` +
    `(watch step ${params.stepLevel})${params.adaptiveMessageSuffix ?? ""}`
  );
}

const averagingMessage = {
  format,
} as const;

export default averagingMessage;
