# Deploying JalRakshak

This guide covers running the platform on one machine for a demo, and the steps and safeguards for a real deployment. Be clear about what has and has not been tested: the **backend, the safeguards and the database initialiser are tested** (the test suite runs them). The **Docker files and the PostgreSQL path were written but not run** in the environment where they were produced (no Docker or PostgreSQL was installed there). Treat the first containerised run as a test.

## 1. One machine, for a demo (tested)

See the README: create the Python environment, run `python -m app.seed_loader`, start the API with uvicorn and the web app with `npm run dev`. This uses SQLite and the demo settings.

## 2. With Docker Compose (written, not yet run)

```bash
cp .env.example .env          # then fill in the secrets
docker compose up --build     # PostgreSQL + API + web app on http://localhost:8080
```

What starts:
- **db**: PostgreSQL 16 with a persistent volume.
- **api**: the FastAPI app. On start it runs `python -m app.init_db`, which creates missing tables and loads the demo seed only into an *empty* database (it never drops anything), then starts uvicorn with `JALRAKSHAK_WORKERS` processes.
- **web**: nginx serving the built web app, and forwarding `/api/` to the API.

Required in `.env`: `POSTGRES_PASSWORD`, `JALRAKSHAK_SECRET`, `JALRAKSHAK_DEMO_PASSWORD`, `JALRAKSHAK_DEVICE_KEYS`. The compose file refuses to start without them.

## 3. Production checklist

The API refuses to start with `JALRAKSHAK_ENV=production` (the container default) while any of these is wrong:

| Setting | Why |
|---|---|
| `JALRAKSHAK_SECRET` set | The token signing key. Without it every restart signs everyone out, and several workers would disagree. |
| `JALRAKSHAK_DEMO=0` | Demo mode enables the reset endpoint and scripted reports. |
| `JALRAKSHAK_DEMO_PASSWORD` changed | The default demo password is public. A real deployment replaces the demo users with its own. |
| `JALRAKSHAK_DEVICE_KEYS` changed | The default sensor keys are public. Give each node its own long random key. |
| `JALRAKSHAK_DB` is PostgreSQL | SQLite is for one demo machine. |

Also do these yourself (they are outside the application):
- **TLS.** Terminate HTTPS in front of nginx (Caddy, a cloud load balancer, or nginx with certificates). Citizens' sign-in tokens must never travel over plain HTTP.
- **Backups.** Back up PostgreSQL (`pg_dump` on a schedule) and the `uploads` volume (citizen photos). Test a restore.
- **Network.** Only the web container's port should be public. Keep PostgreSQL private.
- **Real users.** Create real accounts and remove the demo users. The API stores passwords as scrypt hashes; there is no self-service password reset yet.
- **Real villages.** Set `JALRAKSHAK_LOAD_SEED=0` and load your own villages, service areas, schemes, assets and users (a data-loading tool is future work; today it is a seed file).

## 4. Safeguards built into the API

- Sign-in with JWT, role checks on every endpoint, scoped by village, and a lockout after repeated failures.
- Per-client rate limit (`JALRAKSHAK_RATE_LIMIT`, default 900 requests a minute; sensor ingestion gets four times that) and a request-size limit.
- Security headers on every response; signed-in data is sent `Cache-Control: no-store`.
- Citizen photos: type and size limits, location data removed, viewable only by the owner, the Gram Panchayat and officers.
- Every write goes to an audit log that officers can read. Free text and photos are never stored in it.
- Data sent to the national platforms contains no names, phone numbers, complaint text or photos. Exports (CSV) are anonymised in the same way, and guard against spreadsheet formula injection.
- Old sensor readings are deleted after `JALRAKSHAK_READINGS_RETENTION_DAYS` (default 30). Alerts, incidents, complaints, tests and the audit log are kept.

## 5. Scalability

- The API keeps no state in memory except two small safeguards (the rate limiter and the login lockout). Run several workers, or several containers behind a load balancer. Use the proxy's own rate limit as well, because the in-memory limiter counts per process.
- The database connection pool is configured for PostgreSQL (pool of 10, 20 extra, with a liveness check).
- Sensor readings are indexed by sensor and time and trimmed by retention. The screens poll every 4 to 10 seconds; for many villages, move polling to server-sent events or add a cache.
- Photos are stored on a volume. For many servers, move them to object storage.
- Alert evaluation and the AI models run inside the request that brings new readings. For a large number of villages, move them to a background worker.
- Not yet done: database migrations (Alembic), a message queue for sensor ingestion, and a data-loading tool for real villages.

## 6. Interoperability

- **OpenAPI.** `docs/openapi.json` describes every endpoint; regenerate it with `scripts/export_openapi.py`. Interactive docs run at `/docs`.
- **GeoJSON.** `GET /api/v1/geo/villages.geojson` returns villages and their indicators for any GIS tool (positions are fictional in the demo).
- **CSV.** `GET /api/v1/export/{taps|alerts|complaints|water-quality|tasks}.csv`.
- **National platforms.** The IMIS, Sujal Gaon / Sujalam Bharat, JJM Dashboard, WQMIS and Meri Panchayat connectors are **simulated**. The message formats are illustrative, not the official schemas. A real integration needs authorised access and the official specifications; the work is replacing one function (`_log` in `backend/app/integrations.py`), because the IDs, message building and logs are already in place.
- **Sensors.** Any device that can send an HTTPS POST with its device key to `/api/v1/ingest/readings` can report, so real hardware or a gateway can replace the simulator without changing the API.
