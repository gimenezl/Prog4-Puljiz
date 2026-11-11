/**
 * Adaptador falso del puerto GeneradorDeIds para tests y ADAPTERS_MODE=fake.
 *
 * Genera UUID v4 válidos y predecibles para que las aserciones sean estables.
 */
export class InMemoryIdGenerator {
  #contador = 0;

  generar() {
    this.#contador += 1;
    const sufijo = String(this.#contador).padStart(12, '0');
    return `00000000-0000-4000-8000-${sufijo}`;
  }
}
