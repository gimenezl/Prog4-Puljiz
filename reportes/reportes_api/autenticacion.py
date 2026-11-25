import hmac

from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


class ServicioAutenticado:
    """Representa al servicio que hizo el pedido (Node). No es una persona."""

    is_authenticated = True


class CredencialDeServicio(BaseAuthentication):
    """Exige el encabezado `Authorization: Bearer <token>` con el token de servicio."""

    def authenticate(self, request):
        esperado = settings.REPORTES_SERVICE_TOKEN
        cabecera = request.headers.get("Authorization", "")
        esquema, _, recibido = cabecera.partition(" ")

        # Fallar cerrado: sin token configurado no se acepta a nadie.
        if not esperado or esquema != "Bearer" or not recibido:
            raise AuthenticationFailed("Credencial de servicio ausente o inválida.")

        # compare_digest compara sin filtrar información por el tiempo que tarda.
        if not hmac.compare_digest(recibido.encode(), esperado.encode()):
            raise AuthenticationFailed("Credencial de servicio ausente o inválida.")

        return (ServicioAutenticado(), None)

    def authenticate_header(self, request):
        # Hace que DRF responda 401 (y no 403) cuando falla la autenticación.
        return "Bearer"