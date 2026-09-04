import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

/**
 * Normaliza todas las excepciones a la forma estándar documentada en
 * docs/API-CONTRACT.md: `{ statusCode, message, error }`.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let error = "Internal Server Error";

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
        error = exception.name;
      } else if (typeof body === "object" && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? exception.message;
        error = (b.error as string) ?? HttpStatus[statusCode] ?? exception.name;
      }
    } else if (exception instanceof Error) {
      // Hallazgo de auditoría (REVIEW.md #2.5): antes esto reenviaba
      // exception.message TAL CUAL al cliente — para un error no controlado
      // (p.ej. PrismaClientKnownRequestError/PrismaClientValidationError)
      // eso filtra detalles internos (nombres de columnas, forma exacta de
      // la query) en una respuesta 500 pública. El detalle real se sigue
      // logueando completo server-side; el cliente solo ve un mensaje
      // genérico, igual que para cualquier otro 500 no anticipado.
      error = exception.name;
      this.logger.error(exception.message, exception.stack);
    }

    response.status(statusCode).json({ statusCode, message, error });
  }
}
