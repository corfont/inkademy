// Logger minimalista basado en console — suficiente para un worker de
// background; en producción se puede redirigir stdout/stderr a un colector
// (ver docs/DEPLOYMENT.md, sección de monitoreo/logs).

type LogFields = Record<string, unknown> | undefined;

function format(level: string, scope: string, message: string, fields?: LogFields) {
  const base = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(fields ?? {}),
  };
  return JSON.stringify(base);
}

export function createLogger(scope: string) {
  return {
    info: (message: string, fields?: LogFields) => console.log(format("info", scope, message, fields)),
    warn: (message: string, fields?: LogFields) => console.warn(format("warn", scope, message, fields)),
    error: (message: string, fields?: LogFields) => console.error(format("error", scope, message, fields)),
  };
}

export type Logger = ReturnType<typeof createLogger>;
