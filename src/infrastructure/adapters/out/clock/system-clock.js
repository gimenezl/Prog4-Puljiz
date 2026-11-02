/**
 * Adaptador real del puerto Reloj: usa la hora del sistema.
 */
export class SystemClock {
  ahora() {
    return new Date();
  }
}
