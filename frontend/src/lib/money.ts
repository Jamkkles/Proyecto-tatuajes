/**
 * Pesos chilenos: formato y lectura. El CLP no usa decimales, así que todo se
 * trabaja con enteros. Lo usan la agenda (precios de proyectos y sesiones) y
 * el inventario (costo de los insumos).
 */

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

/** 150000 → "$150.000" */
export const formatCLP = (amount: number) => clp.format(amount)

/**
 * Lee un monto escrito a mano: "150.000", "$150.000" o "150000" → 150000.
 * Todo lo que no es dígito se ignora.
 */
export function parseCLP(text: string): number {
  const digits = text.replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

/** 150000 → "150.000", para rellenar un input de monto. */
export const formatAmountInput = (amount: number) =>
  amount ? new Intl.NumberFormat('es-CL').format(amount) : ''
