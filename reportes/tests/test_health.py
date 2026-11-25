"""Tests del endpoint /health del servicio de reportes."""

from rest_framework.test import APIClient


def test_health_responde_200_y_estado_ok():
    cliente = APIClient()

    respuesta = cliente.get("/health")

    assert respuesta.status_code == 200
    assert respuesta.json() == {"estado": "ok", "tipo": "liveness"}


def test_health_no_acepta_post():
    cliente = APIClient()

    respuesta = cliente.post("/health")

    assert respuesta.status_code == 405


def test_health_no_exige_credencial(settings):
    settings.REPORTES_SERVICE_TOKEN = "token-de-prueba"

    respuesta = APIClient().get("/health")

    assert respuesta.status_code == 200