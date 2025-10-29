#!/bin/bash
# Helper script to start Karaoke Arcade with Docker

echo "🎤 Karaoke Arcade - Docker Edition"
echo "=================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running!"
    echo ""
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed!"
    exit 1
fi

# Use 'docker compose' (v2) if available, fallback to 'docker-compose' (v1)
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "🚀 Building and starting Karaoke Arcade..."
echo ""

# Check if image exists, if not build it
if [ "$1" == "--build" ] || ! docker images | grep -q karaoke-arcade; then
    echo "📦 Building Docker image (this may take 10-15 minutes on first run)..."
    $COMPOSE_CMD build
    if [ $? -ne 0 ]; then
        echo "❌ Build failed!"
        exit 1
    fi
    echo ""
fi

# Start the container
echo "🎵 Starting container..."
$COMPOSE_CMD up -d

if [ $? -ne 0 ]; then
    echo "❌ Failed to start container!"
    exit 1
fi

echo ""
echo "✅ Karaoke Arcade is running!"
echo ""
echo "🌐 Open in browser: http://localhost:8080"
echo ""
echo "📖 Useful commands:"
echo "   docker-compose logs -f    # View logs"
echo "   docker-compose down       # Stop the app"
echo "   docker-compose restart    # Restart the app"
echo ""
echo "Press Ctrl+C to stop viewing logs (container will keep running)"

# Show logs
$COMPOSE_CMD logs -f

