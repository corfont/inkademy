-- El modelo "gemini-1.5-flash" ya no está disponible para claves nuevas de
-- Google AI Studio (confirmado probando contra la API real) — el default
-- pasa a "gemini-2.5-flash".
ALTER TABLE "ChatbotSettings" ALTER COLUMN "model" SET DEFAULT 'gemini-2.5-flash';
