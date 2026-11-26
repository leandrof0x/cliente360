#!/usr/bin/env bash
# Aplica las migraciones en un PostgreSQL local (con un stub de Supabase) y
# ejecuta las pruebas de seguridad/RLS. Uso: npm run db:test
set -euo pipefail
DB=${TEST_DB:-cliente360_test}
PSQL="psql -v ON_ERROR_STOP=1 -q -X"
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d "$DB" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "→ migración $(basename "$f")"
  $PSQL -d "$DB" -f "$f"
done
for f in supabase/tests/[1-9]*.sql; do
  echo "→ prueba $(basename "$f")"
  $PSQL -d "$DB" -f "$f"
done
echo "✓ Migraciones y pruebas de base de datos OK"
