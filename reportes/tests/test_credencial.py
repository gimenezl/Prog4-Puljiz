"""Tests de la credencial de servicio (docs/python.md, sección 5)."""

import pytest
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory


@api_view(["GET"])
def vista_protegida(request):
    """Vista de prueba que usa la configuración por defecto (con credencial)."""
    return Response({"ok": True})


@pytest.fixture
def pedir(settings):
    settings.REPORTES_SERVICE_TOKEN = "token-de-prueba"
    fabrica = APIRequestFactory()

    def _pedir(**encabezados):
        return vista_protegida(fabrica.get("/protegida", **encabezados))

    return _pedir


def test_sin_encabezado_responde_401(pedir):
    assert pedir().status_code == 401


def test_con_token_incorrecto_responde_401(pedir):
    assert pedir(HTTP_AUTHORIZATION="Bearer otro-token").status_code == 401


def test_con_token_correcto_responde_200(pedir):
    assert pedir(HTTP_AUTHORIZATION="Bearer token-de-prueba").status_code == 200


def test_sin_token_configurado_rechaza_todo(settings):
    settings.REPORTES_SERVICE_TOKEN = ""
    respuesta = vista_protegida(
        APIRequestFactory().get("/protegida", HTTP_AUTHORIZATION="Bearer ")
    )
    assert respuesta.status_code == 401