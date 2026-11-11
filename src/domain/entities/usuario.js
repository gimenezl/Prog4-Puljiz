import { ErrorDeDominio } from '../errors/error-de-dominio.js';
import { normalizarEmail } from '../value-objects/email.js';

export const ROLES = Object.freeze({
  PASAJERO: 'PASAJERO',
  CHOFER: 'CHOFER',
  OPERADOR_SOPORTE: 'OPERADOR_SOPORTE',
  ADMINISTRADOR: 'ADMINISTRADOR',
});

/** Roles que una persona puede elegir al registrarse por su cuenta. */
export const ROLES_AUTORREGISTRO = Object.freeze([ROLES.PASAJERO, ROLES.CHOFER]);

const ROLES_VALIDOS = new Set(Object.values(ROLES));
const NOMBRE_MAXIMO = 100;
const ID_MAXIMO = 100;

function validarId(valor) {
  if (typeof valor !== 'string' || valor.trim().length === 0 || valor.length > ID_MAXIMO) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El identificador del usuario no es válido.');
  }

  return valor;
}

function validarNombre(valor) {
  if (typeof valor !== 'string') {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El nombre es obligatorio.');
  }

  const normalizado = valor.trim();

  if (normalizado.length === 0 || normalizado.length > NOMBRE_MAXIMO) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      `El nombre debe tener entre 1 y ${NOMBRE_MAXIMO} caracteres.`,
    );
  }

  return normalizado;
}

function validarCredencial(valor) {
  if (typeof valor !== 'string' || valor.length === 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'La credencial del usuario no es válida.');
  }

  return valor;
}

function validarFecha(valor) {
  if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'La fecha de creación no es válida.');
  }

  return new Date(valor);
}

/**
 * Cuenta de la plataforma. La credencial es siempre un hash: la contraseña en
 * texto plano nunca entra al dominio ni se persiste.
 */
export class Usuario {
  #id;
  #email;
  #nombre;
  #credencial;
  #rol;
  #creadoEn;

  constructor({ id, email, nombre, credencial, rol, creadoEn }) {
    this.#id = validarId(id);
    this.#email = normalizarEmail(email);
    this.#nombre = validarNombre(nombre);
    this.#credencial = validarCredencial(credencial);

    if (!ROLES_VALIDOS.has(rol)) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El rol del usuario no es válido.');
    }

    this.#rol = rol;
    this.#creadoEn = validarFecha(creadoEn);
  }

  get id() {
    return this.#id;
  }

  get email() {
    return this.#email;
  }

  get nombre() {
    return this.#nombre;
  }

  get credencial() {
    return this.#credencial;
  }

  get rol() {
    return this.#rol;
  }

  get creadoEn() {
    return new Date(this.#creadoEn);
  }

  /** Devuelve una copia con el nombre actualizado, sin mutar la instancia. */
  conNombre(nombre) {
    return new Usuario({
      id: this.#id,
      email: this.#email,
      nombre,
      credencial: this.#credencial,
      rol: this.#rol,
      creadoEn: this.#creadoEn,
    });
  }

  /** Representación segura para respuestas HTTP: nunca incluye la credencial. */
  aVistaPublica() {
    return {
      id: this.#id,
      email: this.#email,
      nombre: this.#nombre,
      rol: this.#rol,
      creadoEn: this.#creadoEn.toISOString(),
    };
  }

  toJSON() {
    return this.aVistaPublica();
  }
}
