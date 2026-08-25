import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PDFParse } from "pdf-parse";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { StorageService } from "../../storage/storage.service";

// Tamaño máximo de contexto que se le manda a Gemini junto con el mensaje
// del usuario — suficiente para varios documentos de ayuda medianos sin
// disparar el costo/latencia de cada respuesta. Si algún día hace falta
// más, lo correcto es pasar a una búsqueda por embeddings en vez de
// concatenar todo; para el caso de uso actual (manual de ayuda, FAQ) esto
// alcanza de sobra.
const MAX_CONTEXT_CHARS = 12000;

/**
 * Documentos que el admin sube para que el asistente de IA los use como
 * fuente real (p.ej. el manual de ayuda de la plataforma) en vez de
 * responder de forma genérica — antes no existía ninguna forma de darle
 * contexto propio al chatbot.
 */
@Injectable()
export class ChatbotDocumentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  async list() {
    const docs = await this.prisma.chatbotDocument.findMany({ orderBy: { createdAt: "desc" } });
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      mimeType: d.mimeType,
      active: d.active,
      createdAt: d.createdAt.toISOString(),
      charCount: d.extractedText.length,
      url: this.storage.getPublicUrl(d.assetId),
    }));
  }

  async create(file: { originalname: string; buffer: Buffer; mimetype: string }, title?: string) {
    const extractedText = await this.extractText(file.buffer, file.mimetype, file.originalname);
    if (!extractedText.trim()) {
      throw new BadRequestException("No pudimos extraer texto de este archivo — prueba con un PDF con texto real (no escaneado) o un .txt/.md");
    }

    const key = `chatbot-docs/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await this.storage.uploadBuffer(key, file.buffer, file.mimetype);

    const doc = await this.prisma.chatbotDocument.create({
      data: { title: title || file.originalname, assetId: key, mimeType: file.mimetype, extractedText },
    });
    return { id: doc.id, title: doc.title, charCount: extractedText.length };
  }

  async update(id: string, input: { active?: boolean }) {
    return this.prisma.chatbotDocument.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    const doc = await this.prisma.chatbotDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    await this.prisma.chatbotDocument.delete({ where: { id } });
    return { deleted: true };
  }

  /** Concatena el texto de los documentos activos, recortado a un tamaño razonable — usado por ChatbotService.sendMessage. */
  async getActiveContextText(): Promise<string> {
    const docs = await this.prisma.chatbotDocument.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
    if (docs.length === 0) return "";
    let combined = "";
    for (const doc of docs) {
      const chunk = `\n\n--- ${doc.title} ---\n${doc.extractedText}`;
      if (combined.length + chunk.length > MAX_CONTEXT_CHARS) {
        combined += chunk.slice(0, MAX_CONTEXT_CHARS - combined.length);
        break;
      }
      combined += chunk;
    }
    return combined;
  }

  private async extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }
    // .txt / .md / cualquier otro texto plano
    return buffer.toString("utf-8");
  }
}
