-- "Si el worker se reinicia a la mitad del envío de una campaña, el
-- siguiente sweep la recoge otra vez y la reenvía completa a todos" —
-- SENDING es un estado transitorio para "reclamar" la campaña de forma
-- atómica antes de empezar a enviar, así un sweep concurrente/reintentado
-- no la vuelve a tomar mientras está en curso.
ALTER TYPE "EmailCampaignStatus" ADD VALUE 'SENDING';
