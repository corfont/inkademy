import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Pipe genérico que valida el body/query/params de una request contra un
 * esquema zod importado de @inkademy/shared (o definido localmente en
 * apps/api/src cuando el contrato no define uno compartido).
 *
 * Uso: `@Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput`
 */
@Injectable()
export class ZodValidationPipe<T = unknown> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message = result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      );
      throw new BadRequestException(message);
    }
    return result.data;
  }
}
