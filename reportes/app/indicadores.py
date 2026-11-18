"""Indicadores del reporte de precio dinámico por zona.

Función pura: recibe los viajes y devuelve los números del reporte.
No usa la API, la base ni Node, así se puede testear sola.
"""

from decimal import ROUND_HALF_UP, Decimal

# Redondeos que usa el reporte
ENTERO = Decimal("1")
UN_DECIMAL = Decimal("0.1")
DOS_DECIMALES = Decimal("0.01")


def calcular_indicadores(viajes):
    """Calcula los indicadores a partir de la lista de viajes finalizados.

    Cada viaje viene de Node con este formato:
    {"duracionS": 840, "tarifaFinalCentavos": 297500, "multiplicador": "1.25"}
    """
    cantidad = len(viajes)

    # Sin viajes no hay promedios (sería dividir por cero)
    if cantidad == 0:
        return {
            "viajesFinalizados": 0,
            "sumaTarifasCentavos": 0,
            "duracionPromedioS": None,
            "multiplicadorPromedio": None,
            "porcentajeConMultiplicador": None,
        }

    # Totales
    suma_tarifas = sum(viaje["tarifaFinalCentavos"] for viaje in viajes)
    suma_duraciones = sum(viaje["duracionS"] for viaje in viajes)

    # El multiplicador llega como texto: uso Decimal para no perder precisión
    multiplicadores = [Decimal(viaje["multiplicador"]) for viaje in viajes]
    con_multiplicador = sum(1 for m in multiplicadores if m > 1)

    # Promedios y porcentaje, redondeados como en la escuela (0.5 sube)
    duracion_promedio = (Decimal(suma_duraciones) / cantidad).quantize(ENTERO, ROUND_HALF_UP)
    multiplicador_promedio = (sum(multiplicadores) / cantidad).quantize(DOS_DECIMALES, ROUND_HALF_UP)
    porcentaje = (Decimal(con_multiplicador) * 100 / cantidad).quantize(UN_DECIMAL, ROUND_HALF_UP)

    # Mismos nombres que el JSON del contrato (docs/python.md, sección 3.2)
    return {
        "viajesFinalizados": cantidad,
        "sumaTarifasCentavos": suma_tarifas,
        "duracionPromedioS": int(duracion_promedio),
        "multiplicadorPromedio": str(multiplicador_promedio),
        "porcentajeConMultiplicador": float(porcentaje),
    }