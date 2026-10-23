# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Stage 1: Build the React / Vite PWA production bundle
# -----------------------------------------------------------------------------
FROM node:22-alpine AS frontend-builder
WORKDIR /app

# Copy lockfile and package manifest for clean reproducible install
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build static assets
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Runtime image with FastAPI ML backend + static SPA frontend
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS runner
WORKDIR /app

# Set secure Python execution flags
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HOST=0.0.0.0 \
    ENVIRONMENT=production

# Install Python dependencies from locked specification
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Create an unprivileged non-root user and group (least privilege)
RUN groupadd -g 10001 voxplan \
    && useradd -u 10001 -g voxplan -s /bin/bash -m voxplan

# Copy application source code and pre-trained baseline model
COPY backend ./backend

# Copy built frontend assets from builder stage into dist
COPY --from=frontend-builder --chown=voxplan:voxplan /app/dist ./dist

# Change ownership of application directory to unprivileged user
RUN chown -R voxplan:voxplan /app

USER voxplan

EXPOSE 8000

# Container healthcheck querying FastAPI /health endpoint using native Python runtime (no curl dependency required)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).getcode() == 200 else 1)"

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
