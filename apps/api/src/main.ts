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
  // Detrás de Caddy: sin esto todas las peticiones parecen venir de la IP del proxy y el límite de velocidad (login, registro...) se comparte entre TODOS los usuarios.
  app.set("trust proxy", 1);
  app.set("case sensitive routing", true);
  app.use(cookieParser());
  // Hallazgo de auditoría (REVIEW.md #2.4): fuera de las rutas SCORM (que ya
  // setean su propio CSP a mano, ver scorm.controller.ts), el resto de la
  // API no mandaba ningún header de seguridad — dependía 100% de que el
  // hosting/CDN de producción los agregara. CSP explícitamente desactivado
  // acá: Swagger UI y el resto de la app no están preparados para un CSP
  // global estricto (queda como mejora aparte, no se improvisa a medias).
  app.use(helmet({ contentSecurityPolicy: false }));

  // BUG REAL encontrado el 23-sep-2026: `origin` como string único exige una
  // coincidencia EXACTA del header Origin — pero Caddy enruta TANTO
  // "inkademy.lat" COMO "www.inkademy.lat" al mismo frontend (ver
  // ../../../Caddyfile), y ambos tienen certificado TLS válido propio. Una
  // persona que entra por www. (autocompletado del navegador, un marcador
  // viejo) manda `Origin: https://www.inkademy.lat`, la API sigue
  // devolviendo `Access-Control-Allow-Origin: https://inkademy.lat` (el
  // valor fijo de APP_URL) — el navegador bloquea CUALQUIER fetch/XHR (el
  // login incluido) con un error de CORS, aunque una navegación simple (GET
  // de página completa, sin preflight) cargue perfecto — exactamente el
  // síntoma reportado ("no puedo entrar" pese a que el sitio carga). Se
  // detectó comparando el header real devuelto para ambos orígenes con
  // `curl`, no solo leyendo el código. Fix: aceptar tanto la variante con
  // "www." como sin ella del mismo APP_URL, en vez de un string único.
  const appUrl = config.get<string>("APP_URL", "http://localhost:3000");
  const allowedOrigins = new Set([appUrl]);
  try {
    const { protocol, hostname } = new URL(appUrl);
    const altHost = hostname.startsWith("www.") ? hostname.slice(4) : `www.${hostname}`;
    allowedOrigins.add(`${protocol}//${altHost}`);
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  APP_URL="${appUrl}" no es una URL válida — CORS solo admite ese valor tal cual, sin variante www.`);
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Sin header Origin (curl, server-to-server, health checks) no aplica
      // CORS en absoluto — se deja pasar, igual que el comportamiento previo.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error(`Origin no permitido por CORS: ${origin}`), false);
    },
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
