import pino from "pino";
import { env } from "@/config/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "password_hash",
      "token",
      "csrf_token",
      "cookie",
      "headers.cookie",
      "*.password",
      "*.password_hash",
      "*.token",
      "*.csrf_token",
    ],
    censor: "[REDACTED]",
  },
  base: {
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
