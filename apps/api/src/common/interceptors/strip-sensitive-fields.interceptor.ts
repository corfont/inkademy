import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

/**
 * Varios endpoints devuelven filas de Prisma con `include: { user: true }`
 * (miembros de empresa, cola de revisión de exámenes, reportes, ...) porque
 * es cómodo para armar el resto de la respuesta — pero eso incluye TODO el
 * modelo `User`, incluido `passwordHash`. En vez de recordar excluirlo campo
 * por campo en cada `select`/mapeo (y volver a olvidarlo la próxima vez que
 * se agregue un `include: { user: true }`), este interceptor global recorre
 * recursivamente cualquier respuesta JSON y elimina las claves sensibles
 * conocidas antes de que salga de la API. Es una defensa en profundidad:
 * la corrección real sigue siendo no pedir `passwordHash` de la BD para
 * datos que van al cliente, pero esto evita que un futuro `include: { user:
 * true }` filtre el hash por descuido.
 */
const SENSITIVE_KEYS = new Set(["passwordHash"]);

function stripSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value; // evita loops en estructuras circulares
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => stripSensitive(item, seen));
  }
  if (value instanceof Date) return value;

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    result[key] = stripSensitive(val, seen);
  }
  return result;
}

@Injectable()
export class StripSensitiveFieldsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => stripSensitive(data)));
  }
}
