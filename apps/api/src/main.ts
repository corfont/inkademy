import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import * as express from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  // bodyParser deshabilitado para poder capturar el rawBody crudo (necesario
  // para verificar la firma del webhook de Stripe) y luego parsear JSON manualmente.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  app.use(
    express.json({
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  // Hallazgo de auditoría (REVIEW.md #2.4): fuera de las rutas SCORM (que ya
  // setean su propio CSP a mano, ver scorm.controller.ts), el resto de la
  // API no mandaba ningún header de seguridad — dependía 100% de que el
  // hosting/CDN de producción los agregara. CSP explícitamente desactivado
  // acá: Swagger UI y el resto de la app no están preparados para un CSP
  // global estricto (queda como mejora aparte, no se improvisa a medias).
  app.use(helmet({ contentSecurityPolicy: false }));

  app.enableCors({
    origin: config.get<string>("APP_URL", "http://localhost:3000"),
    credentials: true,
  });

  // Hallazgo de auditoría (REVIEW.md #2.8): /docs quedaba público sin
  // autenticación (Swagger UI se monta fuera del router de Nest, el
  // JwtAuthGuard global no lo cubre) — expone el mapa completo de la API
  // (rutas, DTOs, qué es admin-only) a cualquiera sin sesión. Se restringe
  // a entornos no-productivos.
  if (config.get<string>("NODE_ENV") !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Inkademy API")
      .setDescription("API backend de Inkademy — plataforma LMS B2C + B2B (Perú/LatAm)")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  const port = config.get<number>("API_PORT", 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 Inkademy API escuchando en http://localhost:${port} — Swagger en /docs`);
}

bootstrap();
