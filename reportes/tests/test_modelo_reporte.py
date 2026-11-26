"""Tests del modelo Reporte (último reporte guardado por zona)."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from django.db import IntegrityError

from reportes_api.models import Reporte

pytestmark = pytest.mark.django_db


def datos_de_reporte(**cambios):
    datos = {
        "zona_id": "zona-centro",
        "desde": datetime(2026, 11, 1, tzinfo=timezone.utc),
        "hasta": datetime(2026, 11, 8, tzinfo=timezone.utc),
        "viajes_finalizados": 3,
        "suma_tarifas_centavos": 812000,
        "duracion_promedio_s": 905,
        "multiplicador_promedio": Decimal("1.17"),
        "porcentaje_con_multiplicador": 66.7,
        "calculado_en": datetime(2026, 11, 8, 10, 0, tzinfo=timezone.utc),
    }
    datos.update(cambios)
    return datos


def test_guarda_y_recupera_un_reporte():
    Reporte.objects.create(**datos_de_reporte())

    reporte = Reporte.objects.get(zona_id="zona-centro")

    assert reporte.viajes_finalizados == 3
    assert reporte.suma_tarifas_centavos == 812000
    assert reporte.multiplicador_promedio == Decimal("1.17")


def test_un_reporte_sin_viajes_admite_promedios_vacios():
    Reporte.objects.create(
        **datos_de_reporte(
            viajes_finalizados=0,
            suma_tarifas_centavos=0,
            duracion_promedio_s=None,
            multiplicador_promedio=None,
            porcentaje_con_multiplicador=None,
        )
    )

    reporte = Reporte.objects.get(zona_id="zona-centro")

    assert reporte.duracion_promedio_s is None
    assert reporte.multiplicador_promedio is None


def test_no_puede_haber_dos_reportes_para_la_misma_zona():
    Reporte.objects.create(**datos_de_reporte())

    with pytest.raises(IntegrityError):
        Reporte.objects.create(**datos_de_reporte())