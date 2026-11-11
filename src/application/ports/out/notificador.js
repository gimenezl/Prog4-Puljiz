/**
 * Puerto de salida: Notificador.
 *
 * Contrato:
 *   publicar(evento): Promise<void>
 *
 * Entrega cambios de estado en tiempo real (RF-11). El adaptador concreto
 * decide el transporte (SSE, WebSocket, etc.) y no debe bloquear el caso de uso
 * si la entrega falla.
 */
export {};
