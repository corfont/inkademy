import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ScormService } from "./scorm.service";

const scormProgressSchema = z.object({
  completionStatus: z.string().optional(),
  scoreRaw: z.number().nullable().optional(),
});

/**
 * "player"/"content" quedan bajo /scorm y son deliberadamente públicos
 * (@Public(), sin JwtAuthGuard): un iframe no manda el Authorization header
 * del alumno, así que la autorización real es el `token` de sesión firmado
 * y de alcance acotado que emite scorm-session (ver ScormService.createSession) —
 * cualquiera con ese token puede reproducir ESA lección durante 6h y nada más.
 */
@ApiTags("scorm")
@Controller()
export class ScormController {
  constructor(private readonly scorm: ScormService) {}

  @Post("me/enrollments/:enrollmentId/lessons/:lessonId/scorm-session")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Crea una sesión de reproducción SCORM para esta lección (token de alcance acotado, 6h)" })
  async createSession(@CurrentUser() user: RequestUser, @Param("enrollmentId") enrollmentId: string, @Param("lessonId") lessonId: string) {
    const { token } = await this.scorm.createSession(user.id, enrollmentId, lessonId);
    return { token, playerUrl: `/scorm/player/${encodeURIComponent(token)}` };
  }

  @Public()
  @Get("scorm/player/:token")
  @ApiOperation({ summary: "Página envoltorio con el shim de la API SCORM + el contenido embebido" })
  async player(@Param("token") token: string, @Res() res: Response) {
    const html = await this.scorm.getPlayerHtml(token);
    res.set({
      "Content-Type": "text/html; charset=utf-8",
      // 'unsafe-inline'/'unsafe-eval' porque el paquete SCORM (y nuestro
      // propio shim) no pasan por nuestro bundler — es contenido de
      // terceros ejecutando JS por diseño. 'self' en default-src igual
      // evita que ese JS cargue o llame a orígenes externos arbitrarios.
      "Content-Security-Policy": "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors *",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(html);
  }

  // El token va como segmento de ruta (no query) para que las referencias
  // RELATIVAS del propio paquete (img/css/js/otras páginas) resuelvan bajo
  // el mismo prefijo — ver el comentario en ScormService.getPlayerHtml.
  // path-to-regexp expone el resto de la ruta capturado por "*" en
  // req.params[0] (Express 4, el motor de rutas de Nest acá).
  @Public()
  @Get("scorm/content/:token/*")
  @ApiOperation({ summary: "Sirve un archivo del paquete SCORM (html/js/css/imágenes/etc.), por su ruta relativa dentro del paquete" })
  async content(@Param("token") token: string, @Req() req: Request, @Res() res: Response) {
    const path = (req.params as Record<string, string>)["0"] ?? "";
    const { buffer, contentType } = await this.scorm.getContentFile(token, path);
    res.set({
      "Content-Type": contentType,
      "Content-Security-Policy": "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors *",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    });
    res.send(buffer);
  }

  @Public()
  @Post("scorm/progress")
  @ApiOperation({ summary: "El paquete SCORM reporta avance/nota (llamado por el shim, no por el alumno directamente)" })
  async progress(@Query("token") token: string, @Body(new ZodValidationPipe(scormProgressSchema)) dto: z.infer<typeof scormProgressSchema>) {
    await this.scorm.reportProgress(token, dto);
    return { ok: true };
  }
}
