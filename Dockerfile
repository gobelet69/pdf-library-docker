FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY pdf_browser ./pdf_browser

RUN mkdir -p /app/library

EXPOSE 8765

CMD ["python", "-u", "pdf_browser/docker_entrypoint.py"]
