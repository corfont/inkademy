import { Module } from "@nestjs/common";
import { StorageModule } from "../../storage/storage.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CertificateModule } from "../certificate/certificate.module";
import { EnrollmentController } from "./enrollment.controller";
import { EnrollmentService } from "./enrollment.service";

@Module({
  imports: [StorageModule, CatalogModule, CertificateModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
