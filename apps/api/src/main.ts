import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as cookieParser from "cookie-parser";
import * as express from "express";
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

  app.enableCors({
    origin: config.get<string>("APP_URL", "http://localhost:3000"),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Inkademy API")
    .setDescription("API backend de Inkademy — plataforma LMS B2C + B2B (Perú/LatAm)")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = config.get<number>("API_PORT", 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 Inkademy API escuchando en http://localhost:${port} — Swagger en /docs`);
}

bootstrap();
