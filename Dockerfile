FROM python:3.12-slim

WORKDIR /app

# Set secure execution environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    HOST=0.0.0.0 \
    ENVIRONMENT=production

# Install Python backend dependencies from requirements specification
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Create an unprivileged non-root user and group (least privilege)
RUN groupadd -g 10001 voxplan \
    && useradd -u 10001 -g voxplan -s /bin/bash -m voxplan

# Copy application source code and pre-trained baseline model artifacts
COPY backend ./backend

# Change ownership of application directory to ensure model artifacts remain writable during retraining
RUN chown -R voxplan:voxplan /app && \
    chmod -R 775 /app/backend/models

USER voxplan

EXPOSE 8080

# Dynamic healthcheck querying FastAPI /health endpoint using the configurable PORT
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request, sys; port = os.getenv('PORT', '8080'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=3).getcode() == 200 else 1)"

# Start Uvicorn bound to 0.0.0.0 and the platform-injected PORT (defaulting to 8080)
# 'exec' ensures Uvicorn runs as PID 1 to gracefully receive SIGTERM / SIGINT shutdown signals
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
