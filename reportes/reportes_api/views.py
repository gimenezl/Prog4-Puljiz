from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """Indica que el servicio está vivo (liveness).

    No consulta nada externo: si responde, el proceso anda. Es el mismo
    formato que el /health de la API de Node, para que se parezcan.
    No exige credencial: Docker y el monitoreo tienen que poder consultarlo.
    """
    return Response({"estado": "ok", "tipo": "liveness"})