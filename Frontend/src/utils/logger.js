const isProd = import.meta.env.PROD;

export const logger = {
  log: (...args) => {
    if (!isProd) {
      console.log(...args);
    }
  },
  warn: (...args) => {
    if (!isProd) {
      console.warn(...args);
    }
  },
  error: (...args) => {
    if (!isProd) {
      console.error(...args);
    } else {
      // In production, we might want to log this to an external service
      // e.g., Sentry.captureException(args);
      // But we prevent it from leaking into the browser console.
    }
  },
  info: (...args) => {
    if (!isProd) {
      console.info(...args);
    }
  }
};

export default logger;
