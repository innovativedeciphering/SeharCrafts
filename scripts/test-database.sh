#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="sehar-db-test-$RANDOM-$$"
docker run --detach --rm --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null
trap 'docker rm --force "$container" >/dev/null 2>&1 || true' EXIT
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < tests/database-bootstrap.sql
docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "${SCHEMA_FILE:-supabase/schema.sql}"
if [[ "${APPLY_PAYMENT_UPGRADE:-0}" == "1" ]]; then
  docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < supabase/payment-upgrade.sql
  docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < supabase/tracking-upgrade.sql
fi
docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < tests/database.sql
docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < tests/tracking.sql
