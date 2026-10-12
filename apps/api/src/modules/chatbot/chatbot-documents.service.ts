import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PDFParse } from "pdf-parse";
import { inflateRawSync } from "node:zlib";
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

  /**
   * Guarda texto directo (sin archivo subido) como fuente del asistente —
   * usado para "guardar como fuente para la IA" desde un ticket de soporte
   * ya resuelto o una sugerencia ya respondida (ver SupportController /
   * SuggestionsController `saveAsKnowledge`). Se sube igual a S3/MinIO como
   * un .txt para que el documento aparezca y se pueda ver/descargar desde
   * /admin/asistente-ia como cualquier otro documento subido a mano.
   */
  async createFromText(title: string, text: string) {
    if (!text.trim()) throw new BadRequestException("No hay contenido para guardar como fuente");
    const key = `chatbot-docs/${Date.now()}-${title.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)}.txt`;
    await this.storage.uploadBuffer(key, Buffer.from(text, "utf-8"), "text/plain");
    const doc = await this.prisma.chatbotDocument.create({
      data: { title, assetId: key, mimeType: "text/plain", extractedText: text },
    });
    return { id: doc.id, title: doc.title, charCount: text.length };
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

  /**
   * Texto de referencia para la IA. Si todo cabe, va completo. Si la base de conocimiento es más grande que el tope, antes se cortaba SIN AVISO por
   * el final (los últimos documentos nunca se leían); ahora se parte en fragmentos y se eligen los más relevantes a la pregunta (coincidencia de
   * palabras), conservando el orden original.
   */
  async getActiveContextText(question?: string): Promise<string> {
    const docs = await this.prisma.chatbotDocument.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
    if (docs.length === 0) return "";
    const full = docs.map((d) => `\n\n--- ${d.title} ---\n${d.extractedText}`).join("");
    if (full.length <= MAX_CONTEXT_CHARS) return full;

    const chunks: { title: string; text: string; order: number }[] = [];
    let order = 0;
    for (const d of docs) {
      const paragraphs = d.extractedText.split(/\n{2,}/);
      let buf = "";
      for (const p of paragraphs) {
        if (buf.length + p.length > 1200 && buf) {
          chunks.push({ title: d.title, text: buf, order: order++ });
          buf = "";
        }
        buf += (buf ? "\n\n" : "") + p;
      }
      if (buf) chunks.push({ title: d.title, text: buf, order: order++ });
    }
    const words = new Set(
      (question ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3),
    );
    const score = (text: string) => {
      if (words.size === 0) return 0;
      const hay = new Set(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/));
      let n = 0;
      words.forEach((w) => hay.has(w) && n++);
      return n;
    };
    const ranked = [...chunks].sort((a, b) => score(b.text) - score(a.text) || a.order - b.order);
    const chosen: typeof chunks = [];
    let used = 0;
    for (const c of ranked) {
      const size = c.text.length + c.title.length + 12;
      if (used + size > MAX_CONTEXT_CHARS) continue;
      chosen.push(c);
      used += size;
    }
    return chosen
      .sort((a, b) => a.order - b.order)
      .map((c) => `\n\n--- ${c.title} ---\n${c.text}`)
      .join("");
  }

  /** Cuánto texto hay entre los documentos activos, para avisar en la pantalla si supera lo que se le envía a la IA en cada respuesta. */
  async knowledgeSize(): Promise<{ totalChars: number; limit: number }> {
    const docs = await this.prisma.chatbotDocument.findMany({ where: { active: true }, select: { extractedText: true } });
    return { totalChars: docs.reduce((s, d) => s + d.extractedText.length, 0), limit: MAX_CONTEXT_CHARS };
  }

  /** Texto de un .docx (Word moderno): se lee word/document.xml del zip, sin librerías externas. */
  private extractDocxText(buffer: Buffer): string {
    // Fin del directorio central del zip.
    let eocd = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new BadRequestException("El archivo no parece un documento de Word (.docx) válido.");
    const entries = buffer.readUInt16LE(eocd + 10);
    let pos = buffer.readUInt32LE(eocd + 16);
    for (let n = 0; n < entries; n++) {
      if (buffer.readUInt32LE(pos) !== 0x02014b50) break;
      const method = buffer.readUInt16LE(pos + 10);
      const compSize = buffer.readUInt32LE(pos + 20);
      const nameLen = buffer.readUInt16LE(pos + 28);
      const extraLen = buffer.readUInt16LE(pos + 30);
      const commentLen = buffer.readUInt16LE(pos + 32);
      const localOffset = buffer.readUInt32LE(pos + 42);
      const name = buffer.toString("utf-8", pos + 46, pos + 46 + nameLen);
      if (name === "word/document.xml") {
        const lhNameLen = buffer.readUInt16LE(localOffset + 26);
        const lhExtraLen = buffer.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + lhNameLen + lhExtraLen;
        const raw = buffer.subarray(start, start + compSize);
        const xml = (method === 8 ? inflateRawSync(raw) : raw).toString("utf-8");
        return xml
          .replace(/<w:tab\/>/g, "\t")
          .replace(/<\/w:p>/g, "\n\n")
          .replace(/<w:br\/>/g, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
      pos += 46 + nameLen + extraLen + commentLen;
    }
    throw new BadRequestException("No encontramos el texto dentro del documento de Word.");
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
    if (filename.toLowerCase().endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return this.extractDocxText(buffer);
    }
    if (filename.toLowerCase().endsWith(".doc") || mimeType === "application/msword") {
      throw new BadRequestException("El formato antiguo de Word (.doc) no se puede leer: guárdalo como .docx y vuelve a subirlo.");
    }
    // .txt / .md / cualquier otro texto plano
    return buffer.toString("utf-8");
  }
}
