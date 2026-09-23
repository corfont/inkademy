import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import * as argon2 from "argon2";
import { PRISMA } from "../../common/prisma/prisma.module";

const ROLES_VALIDOS = ["STUDENT", "TEACHER", "SUPPORT", "ADMIN"] as const;
type RolValido = (typeof ROLES_VALIDOS)[number];

/** "José Luis Cortés" -> { firstName: "José Luis", lastName: "Cortés" } —
 * la última palabra es el apellido, el resto el nombre. Un solo nombre
 * (sin espacios) se usa para ambos campos: el modelo User exige los dos
 * como NOT NULL, y partir a la fuerza un nombre de una sola palabra
 * produciría un apellido vacío o inventado. */
function partirNombre(nombreCompleto: string): { firstName: string; lastName: string } {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) {
    const unico = partes[0] ?? nombreCompleto.trim();
    return { firstName: unico, lastName: unico };
  }
  return { firstName: partes.slice(0, -1).join(" "), lastName: partes[partes.length - 1] };
}

@Injectable()
export class PlatformCoreService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Da de alta (o actualiza la contraseña de) una cuenta de login — solo
   * la credencial, sin matricular a ningún curso ni asignar ninguna
   * empresa (eso sigue siendo un paso manual aparte en el panel propio de
   * Inkademy, mismo criterio que el resto de sistemas del portafolio con
   * este puente). `role` es opcional — sin él, una cuenta NUEVA cae en el
   * default del esquema (STUDENT); una cuenta YA EXISTENTE conserva el rol
   * que ya tenía (el CRM no debería poder degradar a un ADMIN real a
   * STUDENT solo por resetearle la clave sin querer).
   */
  async provisionarCuenta(params: { email: string; nombre: string; password: string; role?: string }) {
    const email = params.email.trim().toLowerCase();
    const { firstName, lastName } = partirNombre(params.nombre);
    const passwordHash = await argon2.hash(params.password);

    let globalRole: RolValido | undefined;
    if (params.role) {
      if (!ROLES_VALIDOS.includes(params.role as RolValido)) {
        throw new BadRequestException(`role inválido: "${params.role}" — valores válidos: ${ROLES_VALIDOS.join(", ")}`);
      }
      globalRole = params.role as RolValido;
    }

    const existente = await this.prisma.user.findUnique({ where: { email } });

    if (existente) {
      const actualizado = await this.prisma.user.update({
        where: { email },
        data: {
          passwordHash,
          firstName,
          lastName,
          ...(globalRole ? { globalRole } : {}),
        },
      });
      return { id: actualizado.id };
    }

    const creado = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        globalRole: globalRole ?? "STUDENT",
        status: "active",
        emailVerifiedAt: new Date(),
      },
    });
    return { id: creado.id };
  }

  /** Bloquea/desbloquea por correo — mismo campo `status` que ya respeta
   * AuthService.login y JwtStrategy (ver auth.service.ts:129,
   * jwt.strategy.ts:26), no un campo nuevo sin efecto real. */
  async bloquearCuenta(params: { email: string; bloquear: boolean }) {
    const email = params.email.trim().toLowerCase();
    const usuario = await this.prisma.user.findUnique({ where: { email } });
    if (!usuario) throw new BadRequestException("No existe una cuenta con ese correo");

    await this.prisma.user.update({
      where: { email },
      data: { status: params.bloquear ? "disabled" : "active" },
    });
    return { id: usuario.id };
  }
}
