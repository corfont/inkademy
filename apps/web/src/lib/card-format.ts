// Formato y validación de los datos de tarjeta del checkout: solo dígitos, con el largo que corresponde a cada campo.
// (La tarjeta real la procesa el proveedor de pago; esto evita enviar datos imposibles y guía a quien escribe.)

const soloDigitos = (v: string) => v.replace(/\D/g, "");

/** American Express empieza con 34 o 37 y tiene 15 dígitos (4-6-5); el resto, hasta 19 en grupos de 4. */
export const esAmex = (numero: string) => /^3[47]/.test(soloDigitos(numero));

export function formatearNumeroTarjeta(raw: string): string {
  const d = soloDigitos(raw);
  if (esAmex(d)) {
    const a = d.slice(0, 15);
    return [a.slice(0, 4), a.slice(4, 10), a.slice(10, 15)].filter(Boolean).join(" ");
  }
  return d.slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
}

/** MM/AA: inserta la barra sola, solo acepta meses 01–12. */
export function formatearVencimiento(raw: string): string {
  let d = soloDigitos(raw).slice(0, 4);
  if (d.length >= 1 && Number(d[0]) > 1) d = `0${d}`.slice(0, 4); // «5» → «05»
  if (d.length >= 2 && Number(d.slice(0, 2)) > 12) d = `12${d.slice(2)}`;
  if (d.length >= 2 && Number(d.slice(0, 2)) === 0) d = `01${d.slice(2)}`;
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function formatearCvc(raw: string, numeroTarjeta: string): string {
  return soloDigitos(raw).slice(0, esAmex(numeroTarjeta) ? 4 : 3);
}

function luhn(numero: string): boolean {
  let suma = 0;
  let doble = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let n = Number(numero[i]);
    if (doble) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
    doble = !doble;
  }
  return suma % 10 === 0;
}

/** Devuelve el primer problema encontrado (en español) o null si los datos tienen forma válida. */
export function validarTarjeta(card: { number: string; expiry: string; cvc: string }, ahora = new Date()): string | null {
  const numero = soloDigitos(card.number);
  if (numero.length < 13 || numero.length > 19 || !luhn(numero)) return "El número de tarjeta no es válido. Revísalo.";
  const m = /^(\d{2})\/(\d{2})$/.exec(card.expiry);
  if (!m) return "Escribe el vencimiento como MM/AA (por ejemplo 12/29).";
  const mes = Number(m[1]);
  const anio = 2000 + Number(m[2]);
  if (mes < 1 || mes > 12) return "El mes de vencimiento debe estar entre 01 y 12.";
  if (anio < ahora.getFullYear() || (anio === ahora.getFullYear() && mes < ahora.getMonth() + 1)) return "La tarjeta está vencida.";
  const cvc = soloDigitos(card.cvc);
  const largo = esAmex(numero) ? 4 : 3;
  if (cvc.length !== largo) return `El CVC debe tener ${largo} dígitos.`;
  return null;
}
