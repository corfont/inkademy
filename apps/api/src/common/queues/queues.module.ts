import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ALL_QUEUE_NAMES } from "./queue.constants";

/**
 * Registra la conexión a Redis y declara las colas BullMQ que la API puede
 * encolar. La API SOLO encola jobs — el procesamiento real vive en
 * apps/worker (no se toca en este proyecto).
 *
 * @Global() para que cualquier módulo pueda usar @InjectQueue(...) sin tener
 * que re-importar este módulo explícitamente.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>("REDIS_URL", "redis://localhost:6379"),
        },
      }),
    }),
    ...ALL_QUEUE_NAMES.map((name) => BullModule.registerQueue({ name })),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
