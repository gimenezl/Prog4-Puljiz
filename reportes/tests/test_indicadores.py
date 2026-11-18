"""Tests del cálculo de indicadores (docs/python.md, sección 7)."""

from app.indicadores import calcular_indicadores


def test_sin_viajes_no_hay_promedios():
    resultado = calcular_indicadores([])

    assert resultado["viajesFinalizados"] == 0
    assert resultado["sumaTarifasCentavos"] == 0
    assert resultado["duracionPromedioS"] is None
    assert resultado["multiplicadorPromedio"] is None
    assert resultado["porcentajeConMultiplicador"] is None


def test_un_viaje_sin_precio_dinamico():
    viajes = [{"duracionS": 600, "tarifaFinalCentavos": 200000, "multiplicador": "1.00"}]

    resultado = calcular_indicadores(viajes)

    assert resultado["viajesFinalizados"] == 1
    assert resultado["sumaTarifasCentavos"] == 200000
    assert resultado["duracionPromedioS"] == 600
    assert resultado["multiplicadorPromedio"] == "1.00"
    assert resultado["porcentajeConMultiplicador"] == 0.0


def test_varios_viajes_coincide_con_el_ejemplo_del_contrato():
    viajes = [
        {"duracionS": 840, "tarifaFinalCentavos": 297500, "multiplicador": "1.25"},
        {"duracionS": 960, "tarifaFinalCentavos": 250000, "multiplicador": "1.00"},
        {"duracionS": 915, "tarifaFinalCentavos": 264500, "multiplicador": "1.26"},
    ]

    resultado = calcular_indicadores(viajes)

    assert resultado["viajesFinalizados"] == 3
    assert resultado["sumaTarifasCentavos"] == 812000          # 297500 + 250000 + 264500
    assert resultado["duracionPromedioS"] == 905               # (840 + 960 + 915) / 3
    assert resultado["multiplicadorPromedio"] == "1.17"        # (1.25 + 1.00 + 1.26) / 3 = 1.17
    assert resultado["porcentajeConMultiplicador"] == 66.7     # 2 de 3 tienen más de 1