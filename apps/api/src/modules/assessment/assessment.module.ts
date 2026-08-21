import { Module } from "@nestjs/common";
import { CertificateModule } from "../certificate/certificate.module";
import { AssessmentController, AttemptsController } from "./assessment.controller";
import { AssessmentService } from "./assessment.service";

@Module({
  imports: [CertificateModule],
  controllers: [AssessmentController, AttemptsController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
