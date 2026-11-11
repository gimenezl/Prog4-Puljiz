/**
 * Envuelve handlers async para que cualquier promesa rechazada llegue al
 * middleware global de errores. Express 5 ya lo hace, pero el wrapper deja
 * la intención explícita y protege si se migra de versión.
 */
export function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
