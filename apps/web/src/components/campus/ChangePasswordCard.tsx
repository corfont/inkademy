"use client";

import { useState } from "react";
import { authApi, ApiError } from "@/lib/api-client";
import { setClientAccessToken } from "@/lib/auth";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * Antes no existía ninguna forma de cambiar la contraseña estando ya
 * autenticado — solo el flujo de "olvidé mi contraseña" por correo. Un
 * usuario que entraba con la contraseña temporal que le dio el admin (ver
 * /admin/usuarios) no tenía forma de ponerse una propia.
 */
export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }
    setBusy(true);
    try {
      // "Un usuario podría tenerlo abierto en más de un dispositivo" — el
      // cambio cierra la sesión en cualquier OTRO dispositivo; acá se
      // guarda el token fresco que devuelve la API para que ESTA pestaña
      // (la que hizo el cambio) siga conectada sin tener que reloguearse.
      const { accessToken } = await authApi.changePassword(currentPassword, newPassword);
      setClientAccessToken(accessToken);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cambiar tu contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Cambiar contraseña</h2>
        {success && <Callout variant="success">Tu contraseña se actualizó correctamente.</Callout>}
        {error && <Callout variant="danger">{error}</Callout>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="current-password">Contraseña actual</Label>
            <Input
              id="current-password"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-password">Contraseña nueva</Label>
              <Input
                id="new-password"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirmar contraseña nueva</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-ash-500">Mínimo 8 caracteres, con letras, números y un carácter especial (+ - * ! $ % &amp;).</p>
          <Button type="submit" disabled={busy} className="self-start">
            {busy ? "Guardando…" : "Cambiar contraseña"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
