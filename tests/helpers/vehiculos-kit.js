let siguiente = 0;

/**
 * Datos de vehículo con una patente distinta en cada llamada (formato
 * AB123CD), para que los tests no choquen con la restricción de patente única.
 */
export function datosDeVehiculoDePrueba() {
  siguiente += 1;
  const letras = String.fromCharCode(65 + (Math.floor(siguiente / 1000) % 26));
  const numero = String(siguiente % 1000).padStart(3, '0');

  return { patente: `AA${numero}A${letras}`, marca: 'Toyota', modelo: 'Etios' };
}
