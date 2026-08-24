import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Course, PrismaClient } from "@inkademy/db";
import type {
  AreaSummary,
  CatalogFilters,
  CourseCardDTO,
  CourseDetailDTO,
  ProgramDetailDTO,
} from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { StorageService } from "../../storage/storage.service";
import { decimalToString } from "../../common/utils/money";
import { normalizePage } from "../../common/utils/pagination";

const courseCardInclude = {
  area: true,
  staff: { include: { user: true } },
  liveSessions: { where: { status: "SCHEDULED" as const }, orderBy: { startsAt: "asc" as const } },
} as const;

type CourseWithRelations = Course & {
  area: { slug: string };
  staff: { role: string; user: { firstName: string; lastName: string } }[];
  liveSessions: { startsAt: Date }[];
};

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  toCourseCard(course: CourseWithRelations): CourseCardDTO {
    const teacher = course.staff.find((s) => s.role === "TEACHER")?.user;
    const nextLive = course.liveSessions.find((s) => s.startsAt.getTime() > Date.now());

    // Descuento vigente: % configurado por el admin y (si tiene vencimiento)
    // todavía no vencido — se trata como "ya no hay oferta" sin necesidad de
    // un job que lo "apague" solo, simplemente deja de aplicarse acá.
    const isOnSale = Boolean(
      course.discountPercent && course.discountPercent > 0 && (!course.discountExpiresAt || course.discountExpiresAt.getTime() > Date.now()),
    );
    const originalPriceAmount = Number(course.priceAmount);
    const effectivePriceAmount = isOnSale
      ? Math.round(originalPriceAmount * (1 - course.discountPercent! / 100) * 100) / 100
      : originalPriceAmount;

    return {
      id: course.id,
      slug: course.slug,
      title: course.title as Record<string, string>,
      subtitle: (course.subtitle as Record<string, string> | null) ?? null,
      modality: course.modality,
      type: course.type,
      level: course.level,
      areaSlug: course.area.slug,
      durationHours: course.durationHours,
      coverImageUrl: course.coverImageAssetId
        ? this.storage.getPublicUrl(course.coverImageAssetId)
        : null,
      teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : null,
      nextLiveSessionAt: nextLive ? nextLive.startsAt.toISOString() : null,
      certificationIncluded: course.certificationIncluded,
      // priceAmount sigue siendo el precio EFECTIVO (lo que se cobra) — así
      // ningún consumidor existente (checkout, CourseCard, etc.) necesitó
      // cambiar. originalPriceAmount/isOnSale/etc. son aditivos, solo para
      // mostrar el tachado + la insignia de oferta.
      priceAmount: decimalToString(effectivePriceAmount),
      priceCurrency: course.priceCurrency,
      b2bAvailable: course.b2bAvailable,
      isOnSale,
      originalPriceAmount: isOnSale ? decimalToString(originalPriceAmount) : null,
      discountPercent: isOnSale ? course.discountPercent : null,
      discountExpiresAt: isOnSale && course.discountExpiresAt ? course.discountExpiresAt.toISOString() : null,
    };
  }

  /** Usado por otros módulos (p.ej. enrollment/recomendaciones) para mapear cursos a CourseCardDTO. */
  async getCourseCardsByIds(ids: string[]): Promise<CourseCardDTO[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.course.findMany({
      where: { id: { in: ids } },
      include: courseCardInclude,
    });
    return rows.map((r) => this.toCourseCard(r as unknown as CourseWithRelations));
  }

  async listAreas(): Promise<AreaSummary[]> {
    const areas = await this.prisma.area.findMany({ orderBy: { order: "asc" } });
    return areas.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name as Record<string, string>,
      icon: a.icon,
    }));
  }

  async listCourses(filters: CatalogFilters) {
    const { page, pageSize, skip, take } = normalizePage(filters);
    const where: Record<string, unknown> = { status: "PUBLISHED" };
    if (filters.areaSlug) where.area = { slug: filters.areaSlug };
    if (filters.modality) where.modality = filters.modality;
    if (filters.level) where.level = filters.level;
    if (filters.type) where.type = filters.type;
    if (filters.language) where.language = filters.language;
    if (filters.certificationOnly) where.certificationIncluded = true;
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.priceAmount = {
        ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
        ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
      };
    }
    if (filters.q) {
      where.OR = [
        { slug: { contains: filters.q, mode: "insensitive" } },
        // title/description son Json (LocalizedText): Postgres permite filtrar por
        // texto plano dentro del JSON de forma limitada; se documenta como
        // búsqueda simplificada (no full-text) en IMPLEMENTATION-NOTES.md.
      ];
    }

    // "Más vendidos" ordena por cantidad de matrículas (Course.enrollments,
    // relación directa) — Prisma soporta orderBy por _count de una relación
    // one-to-many nativamente, sin agregación manual. "Más vistos"/"con más
    // reseñas" no están disponibles todavía: no existe tracking de vistas ni
    // un modelo de Review — se documenta como pendiente en IMPLEMENTATION-NOTES.md.
    // priceAsc/priceDesc ordenan por el precio NOMINAL (columna priceAmount),
    // no por el precio con descuento aplicado — ordenar por el precio
    // efectivo exigiría un ORDER BY calculado en SQL crudo o traer todo a
    // memoria (rompe la paginación); para los descuentos moderados que se
    // esperan acá, la diferencia de orden es marginal.
    const orderBy: Record<string, unknown> =
      filters.sort === "priceAsc"
        ? { priceAmount: "asc" }
        : filters.sort === "priceDesc"
          ? { priceAmount: "desc" }
          : filters.sort === "bestSelling"
            ? { enrollments: { _count: "desc" } }
            : { createdAt: "desc" };

    const [rows, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        include: courseCardInclude,
        skip,
        take,
        orderBy: orderBy as never,
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toCourseCard(r as unknown as CourseWithRelations)),
      total,
      page,
      pageSize,
    };
  }

  async getCourseBySlug(slug: string): Promise<CourseDetailDTO> {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        ...courseCardInclude,
        modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } },
        liveSessions: { orderBy: { startsAt: "asc" } },
      },
    });
    if (!course) throw new NotFoundException("Curso no encontrado");

    const card = this.toCourseCard(course as unknown as CourseWithRelations);
    return {
      ...card,
      description: (course.description as Record<string, string> | null) ?? null,
      accessDurationPolicy: course.accessDurationPolicy,
      subtitleLanguages: course.subtitleLanguages,
      prerequisiteCourseIds: course.prerequisiteCourseIds,
      nextRecommendedCourseIds: course.nextRecommendedCourseIds,
      modules: course.modules.map((m) => ({
        id: m.id,
        order: m.order,
        title: m.title as Record<string, string>,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          order: l.order,
          title: l.title as Record<string, string>,
          durationMinutes: l.durationMinutes,
          isFreePreview: l.isFreePreview,
        })),
      })),
      liveSessions: course.liveSessions.map((s) => ({
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        timezone: s.timezone,
      })),
    };
  }

  async getProgramBySlug(slug: string): Promise<ProgramDetailDTO> {
    const program = await this.prisma.program.findUnique({
      where: { slug },
      include: {
        courses: {
          orderBy: { order: "asc" },
          include: { course: { include: courseCardInclude } },
        },
      },
    });
    if (!program) throw new NotFoundException("Programa no encontrado");

    let separatePriceTotal = 0;
    const courses = program.courses.map((pc) => {
      separatePriceTotal += Number(pc.course.priceAmount);
      return {
        courseId: pc.courseId,
        order: pc.order,
        isRequired: pc.isRequired,
        course: this.toCourseCard(pc.course as unknown as CourseWithRelations),
      };
    });
    const savings = Math.max(0, separatePriceTotal - Number(program.priceAmount));

    return {
      id: program.id,
      slug: program.slug,
      title: program.title as Record<string, string>,
      description: (program.description as Record<string, string> | null) ?? null,
      priceAmount: decimalToString(program.priceAmount),
      priceCurrency: program.priceCurrency,
      certificationIncluded: program.certificationIncluded,
      courses,
      separatePriceTotal: separatePriceTotal.toFixed(2),
      savingsAmount: savings.toFixed(2),
    };
  }

  /**
   * Secciones curadas de la home del catálogo. El schema no define un campo
   * explícito de curaduría manual (p.ej. Course.featured), así que se usan
   * heurísticas documentadas en IMPLEMENTATION-NOTES.md:
   *  - featured: cursos publicados con más inscripciones (proxy de calidad/demanda)
   *  - upcomingLive: cursos con la próxima sesión en vivo más cercana
   *  - new: cursos publicados más recientes
   *  - recommendedPaths: cursos que son punto de partida de una ruta
   *    (aparecen en nextRecommendedCourseIds de otro curso)
   *  - mostDemanded: cursos con más inscripciones en los últimos 90 días
   */
  async getSections() {
    const publishedWhere = { status: "PUBLISHED" as const };

    const [featuredRaw, newRaw, allPublished] = await Promise.all([
      this.prisma.course.findMany({
        where: publishedWhere,
        include: { ...courseCardInclude, _count: { select: { enrollments: true } } },
        orderBy: { enrollments: { _count: "desc" } },
        take: 8,
      }),
      this.prisma.course.findMany({
        where: publishedWhere,
        include: courseCardInclude,
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      this.prisma.course.findMany({ where: publishedWhere, include: courseCardInclude }),
    ]);

    const upcomingLiveRaw = allPublished
      .filter((c) => (c as unknown as CourseWithRelations).liveSessions.length > 0)
      .sort((a, b) => {
        const aNext = (a as unknown as CourseWithRelations).liveSessions[0]?.startsAt.getTime() ?? Infinity;
        const bNext = (b as unknown as CourseWithRelations).liveSessions[0]?.startsAt.getTime() ?? Infinity;
        return aNext - bNext;
      })
      .slice(0, 8);

    const recommendedIds = new Set(allPublished.flatMap((c) => c.nextRecommendedCourseIds));
    const recommendedPathsRaw = allPublished.filter((c) => recommendedIds.has(c.id)).slice(0, 8);

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const mostDemandedCounts = await this.prisma.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { not: null }, enrolledAt: { gte: ninetyDaysAgo } },
      _count: { courseId: true },
      orderBy: { _count: { courseId: "desc" } },
      take: 8,
    });
    const mostDemandedIds = mostDemandedCounts.map((c) => c.courseId).filter(Boolean) as string[];
    const mostDemandedRaw = allPublished.filter((c) => mostDemandedIds.includes(c.id));

    return {
      featured: featuredRaw.map((c) => this.toCourseCard(c as unknown as CourseWithRelations)),
      upcomingLive: upcomingLiveRaw.map((c) => this.toCourseCard(c as unknown as CourseWithRelations)),
      new: newRaw.map((c) => this.toCourseCard(c as unknown as CourseWithRelations)),
      recommendedPaths: recommendedPathsRaw.map((c) => this.toCourseCard(c as unknown as CourseWithRelations)),
      mostDemanded: mostDemandedRaw.map((c) => this.toCourseCard(c as unknown as CourseWithRelations)),
    };
  }
}
