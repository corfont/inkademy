import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Clases usadas únicamente para generar la documentación Swagger de
 * request/response. La validación real de entrada corre por ZodValidationPipe
 * usando los esquemas de @inkademy/shared (fuente de verdad del contrato).
 */

export class RegisterDto {
  @ApiProperty() email!: string;
  @ApiProperty({ minLength: 8 }) password!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ enum: ["es", "en"] }) locale?: string;
  @ApiPropertyOptional() marketingConsentEmail?: boolean;
}

export class LoginDto {
  @ApiProperty() email!: string;
  @ApiProperty() password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty() email!: string;
}

export class ResetPasswordDto {
  @ApiProperty() token!: string;
  @ApiProperty({ minLength: 8 }) password!: string;
}

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional() displayName?: string | null;
  @ApiProperty({ enum: ["STUDENT", "TEACHER", "SUPPORT", "ADMIN"] }) globalRole!: string;
  @ApiProperty() locale!: string;
  @ApiProperty() timezone!: string;
  @ApiPropertyOptional() profileCompletedAt?: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
  @ApiProperty() accessToken!: string;
}

export class CompleteProfileDto {
  @ApiPropertyOptional() documentType?: string;
  @ApiPropertyOptional() documentNumber?: string;
  @ApiPropertyOptional() country?: string;
  @ApiPropertyOptional() city?: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() jobTitle?: string;
  @ApiPropertyOptional() companyFreeText?: string;
  @ApiPropertyOptional() sector?: string;
  @ApiPropertyOptional({ type: [String] }) interests?: string[];
  @ApiPropertyOptional({ enum: ["ENTRY", "MID", "SENIOR", "EXECUTIVE"] }) experienceLevel?: string;
  @ApiPropertyOptional() marketingConsentEmail?: boolean;
  @ApiPropertyOptional() marketingConsentWhatsapp?: boolean;
}
