FROM python:3.12-alpine

WORKDIR /app

RUN apk add --no-cache \
    ca-certificates \
    docker-cli \
    docker-cli-compose \
    git \
    && pip install --no-cache-dir fastapi==0.115.0 uvicorn[standard]==0.32.0

COPY app.py .

EXPOSE 8010

CMD ["uvicorn", "--app-dir", "/app", "app:app", "--host", "0.0.0.0", "--port", "8010"]
