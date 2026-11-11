/**
 * Puerto de salida: AlmacenamientoDeArchivos.
 *
 * Contrato:
 *   guardar(archivo): Promise<{ referencia }>
 *   obtener(referencia): Promise<Archivo | null>
 *   eliminar(referencia): Promise<void>
 *
 * Se usa solo si el alcance incorpora documentación (por ejemplo, vehículo).
 * El adaptador real debe validar tipo y tamaño antes de persistir.
 */
export {};
