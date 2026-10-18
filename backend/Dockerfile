# JalRakshak API. Build from the REPOSITORY ROOT so the seed file is included:
#   docker build -f backend/Dockerfile -t jalrakshak-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY backend/requirements.txt backend/requirements-postgres.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-postgres.txt

COPY backend/app ./backend/app
COPY seed ./seed

# Run as an ordinary user. Photos are written under /data/uploads (mount a volume there).
RUN useradd --create-home --uid 10001 jal && mkdir -p /data/uploads && chown -R jal /data
USER jal
WORKDIR /srv/backend
ENV JALRAKSHAK_UPLOADS=/data/uploads JALRAKSHAK_SEED=/srv/seed/ramapuram.json JALRAKSHAK_ENV=production

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health')" || exit 1

# Create missing tables (and load the demo seed only into an EMPTY database), then serve.
CMD ["sh", "-c", "python -m app.init_db && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${JALRAKSHAK_WORKERS:-2}"]
