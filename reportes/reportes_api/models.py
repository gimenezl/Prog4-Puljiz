from django.db import models


class Reporte(models.Model):
    """Último reporte calculado para una zona de demanda.

    Hay una sola fila por zona: cada vez que se actualiza, se reemplaza.
    Los números salen de calcular_indicadores (app/indicadores.py).
    """

    # Identificador de la zona tal como lo da Node. No asumimos que sea un UUID.
    zona_id = models.CharField(max_length=64, unique=True)

    # Período que cubre el reporte.
    desde = models.DateTimeField()
    hasta = models.DateTimeField()

    viajes_finalizados = models.PositiveIntegerField()
    # Dinero siempre en centavos enteros, nunca con decimales.
    suma_tarifas_centavos = models.BigIntegerField()
    # Con cero viajes no hay promedios: por eso estos tres admiten null.
    duracion_promedio_s = models.PositiveIntegerField(null=True)
    multiplicador_promedio = models.DecimalField(
        max_digits=6, decimal_places=2, null=True
    )
    porcentaje_con_multiplicador = models.FloatField(null=True)

    # Cuándo se calculó, para saber qué tan viejo es el dato.
    calculado_en = models.DateTimeField()