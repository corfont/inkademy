import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ChatbotDocumentsService } from "./chatbot-documents.service";

@ApiTags("chatbot")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("admin/chatbot-documents")
export class ChatbotDocumentsController {
  constructor(private readonly documents: ChatbotDocumentsService) {}

  @Get()
  @Roles("ADMIN")
  @ApiOperation({ summary: "Lista los documentos de referencia del asistente de IA" })
  list() {
    return this.documents.list();
  }

  @Post()
  @Roles("ADMIN")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Sube un documento (PDF/TXT/MD) como fuente de información para el asistente de IA" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(@UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string }, @Query("title") title?: string) {
    return this.documents.create(file, title);
  }

  @Patch(":id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Activa/desactiva un documento (sin borrarlo)" })
  update(@Param("id") id: string, @Body() dto: { active?: boolean }) {
    return this.documents.update(id, dto);
  }

  @Delete(":id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina un documento de referencia" })
  remove(@Param("id") id: string) {
    return this.documents.remove(id);
  }
}
