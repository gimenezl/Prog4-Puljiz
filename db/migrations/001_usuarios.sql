CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  credencial TEXT NOT NULL,
  rol VARCHAR(20) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL,
  CONSTRAINT usuarios_rol_check CHECK (
    rol IN ('PASAJERO', 'CHOFER', 'OPERADOR_SOPORTE', 'ADMINISTRADOR')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_lower_idx ON usuarios (LOWER(email));
