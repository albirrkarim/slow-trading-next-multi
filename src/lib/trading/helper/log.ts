export const DEFAULT_LOG_CATEGORIES = ["log", "warn", "error", "info"];

type LogSessionOptions = {
  categories?: string | string[];
  muted?: boolean;
  verbose?: boolean;
};

type LogSession = {
  categories: string[];
  ended: boolean;
  id: number;
  muted: boolean;
  verbose: boolean;
};

function normalizeLogCategories(categories: string | string[]) {
  const categoryList = Array.isArray(categories) ? categories : [categories];

  return categoryList
    .flatMap((category) => category.split(","))
    .map((category) => category.trim())
    .filter(Boolean);
}

function mergeLogCategories(
  currentCategories: string[],
  nextCategories: string | string[],
) {
  const normalizedCategories = normalizeLogCategories(nextCategories);

  return Array.from(new Set([...currentCategories, ...normalizedCategories]));
}

class TradeLogger {
  logPrefix = "tradeLog";

  verbose = true;

  categories = [...DEFAULT_LOG_CATEGORIES];

  muted = false;

  private nextSessionId = 1;

  private sessions: LogSession[] = [];

  private delayedTimeout?: ReturnType<typeof setTimeout>;

  endSession(sessionId: number) {
    const session = this.sessions.find((item) => item.id === sessionId);

    if (!session) {
      return;
    }

    session.ended = true;

    while (this.sessions.at(-1)?.ended) {
      const endedSession = this.sessions.pop();

      if (endedSession) {
        this.verbose = endedSession.verbose;
        this.categories = endedSession.categories;
        this.muted = endedSession.muted;
      }
    }
  }

  startSession(options: LogSessionOptions = {}) {
    const sessionId = this.nextSessionId;
    this.nextSessionId += 1;

    this.sessions.push({
      categories: [...this.categories],
      ended: false,
      id: sessionId,
      muted: this.muted,
      verbose: this.verbose,
    });

    if (typeof options.muted === "boolean") {
      this.setMuted(options.muted);
    }

    if (typeof options.verbose === "boolean") {
      this.setVerbose(options.verbose);
    }

    if (options.categories) {
      this.setCategories(options.categories);
    }

    return sessionId;
  }

  setPrefix(v: string) {
    this.logPrefix = v;
  }

  setMuted(v: boolean) {
    this.muted = v;
  }

  setVerbose(v: boolean) {
    this.verbose = v;
  }

  setCategories(v: string | string[]) {
    this.categories = mergeLogCategories(this.categories, v);
  }

  shouldDebug(method: string): boolean {
    if (this.muted) {
      return false;
    }

    if (!this.categories.includes(method)) {
      return false;
    }

    return (
      Boolean(process.env.VERBOSE || process.env.NEXT_PUBLIC_VERBOSE) ||
      this.verbose
    );
  }

  /**
   * Helper method to log with a stack trace.
   * @param method - The console method to use (only callable methods).
   * @param args - The arguments to pass to the console method.
   */
  private logWithStack(
    method: "log" | "warn" | "debug" | "error" | "info",
    args: unknown[],
  ): void {
    if (this.shouldDebug(method)) {
      // const error = new Error()
      // const stack = error.stack ? error.stack.split('\n').slice(3, 10).join('\n') : ''
      // console[method]('[ttsDebug]', ...args, stack)
      console[method](`[${this.logPrefix}]`, ...args);
    }
  }

  delayed(...args: unknown[]): void {
    if (this.delayedTimeout) {
      clearTimeout(this.delayedTimeout);
    }

    this.delayedTimeout = setTimeout(() => {
      this.logWithStack("log", args);
    }, 1000);
  }

  log(...args: unknown[]): void {
    this.logWithStack("log", args);
  }

  warn(...args: unknown[]): void {
    this.logWithStack("warn", args);
  }

  debug(...args: unknown[]): void {
    this.logWithStack("debug", args);
  }

  error(...args: unknown[]): void {
    this.logWithStack("error", args);
  }

  info(...args: unknown[]): void {
    this.logWithStack("info", args);
  }
}

export const tradeLog = new TradeLogger();
