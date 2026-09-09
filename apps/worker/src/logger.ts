export const logger = {
  info: (...args: unknown[]) => console.log("[worker]", ...args),
  warn: (...args: unknown[]) => console.warn("[worker]", ...args),
  error: (...args: unknown[]) => console.error("[worker]", ...args),
};
