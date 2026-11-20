import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';

import { aplicarMigraciones } from '../../../scripts/migrate.js';
import { PostgresDatabase } from '../../../src/infrastructure/adapters/out/persistence/postgres-database.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describirPostgres = TEST_DATABASE_URL ? describe : describe.skip;

const POLIGONO_A = 'POLYGON((0 0, 0 0.01, 0.01 0.01, 0.01 0, 0 0))';
const POLIGONO_B = 'POLYGON((0.005 0.005, 0.005 0.015, 0.015 0.015, 0.015 0.005, 0.005 0.005))';
const POLIGONO_C = 'POLYGON((1 1, 1 2, 2 2, 2 1, 1 1))';

function fechaFutura() {
  return new Date(Date.now() + 60_000);
}

function fechaPasada() {
  return new Date(Date.now() - 60_000);
}

async function crearAdministrador(baseDeDatos) {
  const id = randomUUID();

  await baseDeDatos.query(
    `INSERT INTO usuarios (id, email, nombre, credencial, rol, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      `admin-${id}@configuracion.test`,
      'Administrador',
      'credencial',
      'ADMINISTRADOR',
      fechaPasada(),
    ],
  );

  return id;
}

async function crearZona(baseDeDatos, { nombre = 'Microcentro', poligono = POLIGONO_A } = {}) {
  const id = randomUUID();

  await baseDeDatos.query(
    `INSERT INTO zonas_de_demanda (id, nombre, area, creada_en)
     VALUES ($1, $2, ST_GeogFromText($3), $4)`,
    [id, nombre, `SRID=4326;${poligono}`, fechaPasada()],
  );

  return id;
}

async function crearBorradorTarifa(baseDeDatos, { baseCentavos = 100000 } = {}) {
  const id = randomUUID();

  await baseDeDatos.query(
    `INSERT INTO tarifas (
       id, base_centavos, por_km_centavos, por_minuto_centavos,
       precio_maximo_centavos, creada_en
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, baseCentavos, 50000, 2000, 1000000, fechaPasada()],
  );

  return id;
}

async function publicarTarifa(baseDeDatos, id, administradorId, vigenteDesde = fechaFutura()) {
  const { rows } = await baseDeDatos.query(
    `UPDATE tarifas
        SET estado = 'PUBLICADA',
            publicada_por_id = $2,
            vigente_desde = $3
      WHERE id = $1
      RETURNING version, publicada_en`,
    [id, administradorId, vigenteDesde],
  );

  return rows[0];
}

async function crearBorradorRegla(baseDeDatos) {
  const id = randomUUID();

  await baseDeDatos.query(
    `INSERT INTO reglas_multiplicador (
       id, umbral_inferior, umbral_superior, multiplicador_minimo,
       multiplicador_maximo, escala_multiplicador, creada_en
     ) VALUES ($1, 1.00, 3.00, 1.00, 2.50, 2, $2)`,
    [id, fechaPasada()],
  );

  return id;
}

async function publicarRegla(baseDeDatos, id, administradorId, vigenteDesde = fechaFutura()) {
  const { rows } = await baseDeDatos.query(
    `UPDATE reglas_multiplicador
        SET estado = 'PUBLICADA',
            publicada_por_id = $2,
            vigente_desde = $3,
            motivo = 'Publicación de prueba'
      WHERE id = $1
      RETURNING version, publicada_en`,
    [id, administradorId, vigenteDesde],
  );

  return rows[0];
}

describirPostgres('configuración administrativa versionada (RF-23 + RF-16)', () => {
  let baseDeDatos;

  before(async () => {
    baseDeDatos = new PostgresDatabase({
      connectionString: TEST_DATABASE_URL,
      max: 25,
      connectionTimeoutMs: 5000,
      statementTimeoutMs: 15000,
    });

    await aplicarMigraciones(baseDeDatos);
  });

  after(async () => {
    await baseDeDatos?.cerrar();
  });

  beforeEach(async () => {
    await baseDeDatos.query(
      'TRUNCATE TABLE reglas_multiplicador, tarifas, zonas_de_demanda, usuarios CASCADE',
    );
  });

  test('las zonas usan PostGIS, no se borran y tienen nombre único', async () => {
    const zonaId = await crearZona(baseDeDatos);

    const zona = await baseDeDatos.query(
      `SELECT activa, ST_AsText(area::geometry) AS area
         FROM zonas_de_demanda
        WHERE id = $1`,
      [zonaId],
    );
    assert.equal(zona.rows[0].activa, true);
    assert.equal(zona.rows[0].area.includes('POLYGON'), true);

    await assert.rejects(
      () => crearZona(baseDeDatos, { nombre: 'MICROCENTRO', poligono: POLIGONO_C }),
      (error) => error.code === '23505',
    );

    await assert.rejects(
      () =>
        baseDeDatos.query(
          `INSERT INTO zonas_de_demanda (id, nombre, area, creada_en)
           VALUES ($1, 'Inválida', ST_GeogFromText($2), $3)`,
          [randomUUID(), 'SRID=4326;POLYGON((0 0, 1 1, 1 0, 0 1, 0 0))', fechaPasada()],
        ),
      (error) => error.code === '23514',
    );

    await baseDeDatos.query('UPDATE zonas_de_demanda SET activa = false WHERE id = $1', [zonaId]);
    const desactivada = await baseDeDatos.query(
      'SELECT activa FROM zonas_de_demanda WHERE id = $1',
      [zonaId],
    );
    assert.equal(desactivada.rows[0].activa, false);

    await assert.rejects(
      () => baseDeDatos.query('DELETE FROM zonas_de_demanda WHERE id = $1', [zonaId]),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        baseDeDatos.query('UPDATE zonas_de_demanda SET creada_en = NOW() WHERE id = $1', [zonaId]),
      (error) => error.code === '23514',
    );
  });

  test('I16: dos zonas activas no pueden solaparse ni compartir borde', async () => {
    await crearZona(baseDeDatos);

    await assert.rejects(
      () => crearZona(baseDeDatos, { nombre: 'Solapada', poligono: POLIGONO_B }),
      (error) => error.code === '23514',
    );

    const bordeCompartido = 'POLYGON((0.01 0, 0.01 0.01, 0.02 0.01, 0.02 0, 0.01 0))';
    await assert.rejects(
      () => crearZona(baseDeDatos, { nombre: 'Borde', poligono: bordeCompartido }),
      (error) => error.code === '23514',
    );

    const zonaLejanaId = await crearZona(baseDeDatos, {
      nombre: 'Zona lejana',
      poligono: POLIGONO_C,
    });
    assert.notEqual(zonaLejanaId, null);

    const inactivaId = randomUUID();
    await baseDeDatos.query(
      `INSERT INTO zonas_de_demanda (id, nombre, area, activa, creada_en)
       VALUES ($1, 'Inactiva', ST_GeogFromText($2), false, $3)`,
      [inactivaId, `SRID=4326;${POLIGONO_B}`, fechaPasada()],
    );

    await assert.rejects(
      () =>
        baseDeDatos.query('UPDATE zonas_de_demanda SET activa = true WHERE id = $1', [inactivaId]),
      (error) => error.code === '23514',
    );
  });

  test('las tarifas nacen como borrador y cada publicación crea una versión inmutable', async () => {
    const administradorId = await crearAdministrador(baseDeDatos);
    const tarifaId = await crearBorradorTarifa(baseDeDatos);

    const borrador = await baseDeDatos.query(
      'SELECT estado, version, publicada_en FROM tarifas WHERE id = $1',
      [tarifaId],
    );
    assert.deepEqual(borrador.rows[0], {
      estado: 'BORRADOR',
      version: null,
      publicada_en: null,
    });

    await assert.rejects(
      () => crearBorradorTarifa(baseDeDatos, { baseCentavos: 2_000_000 }),
      (error) => error.code === '23514',
    );

    const primera = await publicarTarifa(baseDeDatos, tarifaId, administradorId);
    assert.equal(primera.version, 1);
    assert.notEqual(primera.publicada_en, null);

    await assert.rejects(
      () => baseDeDatos.query('UPDATE tarifas SET base_centavos = 1 WHERE id = $1', [tarifaId]),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () => baseDeDatos.query('DELETE FROM tarifas WHERE id = $1', [tarifaId]),
      (error) => error.code === '23514',
    );

    const segundaTarifaId = await crearBorradorTarifa(baseDeDatos);
    const segunda = await publicarTarifa(baseDeDatos, segundaTarifaId, administradorId);
    assert.equal(segunda.version, 2);

    await assert.rejects(
      () =>
        baseDeDatos.query(
          `INSERT INTO tarifas (
             id, estado, base_centavos, por_km_centavos, por_minuto_centavos,
             precio_maximo_centavos, creada_en
           ) VALUES ($1, 'PUBLICADA', 100000, 50000, 2000, 1000000, NOW())`,
          [randomUUID()],
        ),
      (error) => error.code === '23514',
    );

    const tarifaParaFechaInvalida = await crearBorradorTarifa(baseDeDatos);
    await assert.rejects(
      () =>
        publicarTarifa(
          baseDeDatos,
          tarifaParaFechaInvalida,
          administradorId,
          new Date(Date.now() - 60_000),
        ),
      (error) => error.code === '23514',
    );

    const siguiente = await baseDeDatos.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS version
         FROM tarifas
        WHERE estado = 'PUBLICADA'`,
    );
    assert.equal(siguiente.rows[0].version, 3);
  });

  test('las reglas validan umbrales y publican versiones inmutables', async () => {
    const administradorId = await crearAdministrador(baseDeDatos);
    const reglaId = await crearBorradorRegla(baseDeDatos);

    const publicada = await publicarRegla(baseDeDatos, reglaId, administradorId);
    assert.equal(publicada.version, 1);

    await assert.rejects(
      () =>
        baseDeDatos.query('UPDATE reglas_multiplicador SET umbral_superior = 1 WHERE id = $1', [
          reglaId,
        ]),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        baseDeDatos.query(
          `INSERT INTO reglas_multiplicador (
             id, umbral_inferior, umbral_superior, multiplicador_minimo,
             multiplicador_maximo, escala_multiplicador, creada_en
           ) VALUES ($1, 1.00, 3.00, 1.00, 2.50, 5, NOW())`,
          [randomUUID()],
        ),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        baseDeDatos.query(
          `INSERT INTO reglas_multiplicador (
             id, umbral_inferior, umbral_superior, multiplicador_minimo,
             multiplicador_maximo, escala_multiplicador, creada_en
           ) VALUES ($1, 3.00, 1.00, 1.00, 2.50, 2, NOW())`,
          [randomUUID()],
        ),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        baseDeDatos.query(
          `INSERT INTO reglas_multiplicador (
             id, umbral_inferior, umbral_superior, multiplicador_minimo,
             multiplicador_maximo, escala_multiplicador, creada_en
           ) VALUES ($1, 1.00, 3.00, 0.50, 2.50, 2, NOW())`,
          [randomUUID()],
        ),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        baseDeDatos.query(
          `INSERT INTO reglas_multiplicador (
             id, formula, umbral_inferior, umbral_superior, multiplicador_minimo,
             multiplicador_maximo, escala_multiplicador, creada_en
           ) VALUES ($1, 'OTRA', 1.00, 3.00, 1.00, 2.50, 2, NOW())`,
          [randomUUID()],
        ),
      (error) => error.code === '23514',
    );

    const segundaReglaId = await crearBorradorRegla(baseDeDatos);
    const segunda = await publicarRegla(baseDeDatos, segundaReglaId, administradorId);
    assert.equal(segunda.version, 2);

    const reglaSinPublicadorId = await crearBorradorRegla(baseDeDatos);
    await assert.rejects(
      () =>
        baseDeDatos.query(
          `UPDATE reglas_multiplicador
              SET estado = 'PUBLICADA',
                  publicada_por_id = NULL,
                  vigente_desde = $2
            WHERE id = $1`,
          [reglaSinPublicadorId, fechaFutura()],
        ),
      (error) => error.code === '23514',
    );
  });

  test('las publicaciones concurrentes obtienen versiones consecutivas', async () => {
    const administradorId = await crearAdministrador(baseDeDatos);
    const borradores = await Promise.all(
      Array.from({ length: 8 }, () => crearBorradorTarifa(baseDeDatos)),
    );

    const resultados = await Promise.all(
      borradores.map((id) => publicarTarifa(baseDeDatos, id, administradorId)),
    );

    assert.deepEqual(
      resultados.map((fila) => fila.version).sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );

    const publicadas = await baseDeDatos.query(
      `SELECT COUNT(*)::int AS total
         FROM tarifas
        WHERE estado = 'PUBLICADA'`,
    );
    assert.equal(publicadas.rows[0].total, 8);
  });

  test('dos altas concurrentes de zonas superpuestas dejan una sola activa', async () => {
    const intentos = await Promise.allSettled([
      crearZona(baseDeDatos, { nombre: 'Concurrente A' }),
      crearZona(baseDeDatos, { nombre: 'Concurrente B', poligono: POLIGONO_B }),
    ]);

    const exitos = intentos.filter((resultado) => resultado.status === 'fulfilled');
    const fallos = intentos.filter((resultado) => resultado.status === 'rejected');

    assert.equal(exitos.length, 1);
    assert.equal(fallos.length, 1);
    assert.equal(fallos[0].reason.code, '23514');

    const activas = await baseDeDatos.query(
      `SELECT COUNT(*)::int AS total
         FROM zonas_de_demanda
        WHERE activa`,
    );
    assert.equal(activas.rows[0].total, 1);
  });
});
