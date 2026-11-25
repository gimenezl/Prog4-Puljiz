from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["GET"])
def health(request):
    """Indica que el servicio está vivo (liveness).

    No consulta nada externo: si responde, el proceso anda. Es el mismo
    formato que el /health de la API de Node, para que se parezcan.
    """
    return Response({"estado": "ok", "tipo": "liveness"})