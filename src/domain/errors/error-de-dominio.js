/**
 * Error base del dominio. No conoce HTTP ni Express: solo expone un código
 * lógico y un mensaje seguro para el cliente.
 */
export class ErrorDeDominio extends Error {
  constructor(codigo, mensaje, opciones) {
    super(mensaje, opciones);
    this.name = 'ErrorDeDominio';
    this.codigo = codigo;
  }
}
