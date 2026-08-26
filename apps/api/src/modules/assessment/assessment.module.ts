import { Module } from "@nestjs/common";
import { CertificateModule } from "../certificate/certificate.module";
import { StorageModule } from "../../storage/storage.module";
import { EnrollmentModule } from "../enrollment/enrollment.module";
import { AssessmentController, AttemptsController } from "./assessment.controller";
import { AssessmentService } from "./assessment.service";

@Module({
  imports: [CertificateModule, StorageModule, EnrollmentModule],
  controllers: [AssessmentController, AttemptsController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
