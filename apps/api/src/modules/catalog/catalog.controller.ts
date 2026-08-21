import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CatalogFilters } from "@inkademy/shared";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { catalogFiltersSchema } from "../../common/validation/local-schemas";
import { CatalogService } from "./catalog.service";

@ApiTags("catalog")
@Public()
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("areas")
  @ApiOperation({ summary: "Lista las áreas del catálogo" })
  listAreas() {
    return this.catalogService.listAreas();
  }

  @Get("courses")
  @ApiOperation({ summary: "Lista cursos publicados con filtros y paginación" })
  listCourses(@Query(new ZodValidationPipe(catalogFiltersSchema)) query: CatalogFilters) {
    return this.catalogService.listCourses(query);
  }

  @Get("catalog/sections")
  @ApiOperation({ summary: "Secciones curadas para la home del catálogo" })
  getSections() {
    return this.catalogService.getSections();
  }

  @Get("courses/:slug")
  @ApiOperation({ summary: "Detalle de un curso por slug" })
  getCourse(@Param("slug") slug: string) {
    return this.catalogService.getCourseBySlug(slug);
  }

  @Get("programs/:slug")
  @ApiOperation({ summary: "Detalle de un programa/diplomado por slug" })
  getProgram(@Param("slug") slug: string) {
    return this.catalogService.getProgramBySlug(slug);
  }
}
