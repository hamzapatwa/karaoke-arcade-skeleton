# Multi-stage Dockerfile for Karaoke Arcade with GPU support
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    cmake \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY python/requirements.txt /app/python/requirements.txt
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118 \
    && pip install --no-cache-dir -r python/requirements.txt

# Build backend
COPY backend/package*.json /app/backend/
RUN cd /app/backend && npm ci --omit=dev

# Build frontend
COPY frontend/package*.json /app/frontend/
RUN cd /app/frontend && npm ci
COPY frontend/ /app/frontend/
RUN cd /app/frontend && npm run build

# Final stage
FROM python:3.11-slim

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    libsndfile1 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python dependencies
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY python/ /app/python/
COPY --from=builder /app/backend /app/backend
COPY --from=builder /app/frontend/dist /app/frontend/dist
COPY frontend/public /app/frontend/public
COPY schemas/ /app/schemas/

# Create directories
RUN mkdir -p /app/songs /app/sessions

# Expose port
EXPOSE 8080

# Set environment variables
ENV DEVICE=auto \
    PORT=8080 \
    NODE_ENV=production

# Create optimized startup script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "🎤 Starting Karaoke Arcade..."\n\
\n\
# Detect GPU\n\
if command -v nvidia-smi &> /dev/null && [ "$DEVICE" = "auto" ]; then\n\
    echo "✓ NVIDIA GPU detected - using CUDA"\n\
    export DEVICE=cuda\n\
elif [ "$DEVICE" = "auto" ]; then\n\
    echo "✓ Using CPU mode"\n\
    export DEVICE=cpu\n\
fi\n\
\n\
# Create Python venv symlink if needed\n\
if [ ! -d "/app/python/.venv" ]; then\n\
    python3 -m venv /app/python/.venv\n\
    ln -sf /usr/local/lib/python3.11/site-packages/* /app/python/.venv/lib/python3.11/site-packages/ 2>/dev/null || true\n\
fi\n\
\n\
echo "🚀 Starting server on port $PORT"\n\
cd /app/backend && exec node server.js\n\
' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"]

