#!/bin/bash
# Karaoke Arcade v2.0 Startup Script

echo "🎤 Starting Karaoke Arcade v2.0..."
echo "===================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.10+ first."
    exit 1
fi

# Check macOS version (required for MPS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    MACOS_VERSION=$(sw_vers -productVersion | cut -d'.' -f1)
    if [ "$MACOS_VERSION" -lt 12 ]; then
        echo "⚠️  macOS version $MACOS_VERSION detected. macOS 12.3+ required for MPS acceleration."
    fi
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Node.js version $NODE_VERSION detected. Node.js 20+ is recommended."
fi

# Check Python version
PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
    echo "⚠️  Python version $PYTHON_VERSION detected. Python 3.10+ is recommended."
fi

echo "✅ Prerequisites check passed"
echo ""

# Setup backend
echo "🔧 Setting up backend..."
cd backend

if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install backend dependencies"
        exit 1
    fi
fi

echo "✅ Backend setup complete"
echo ""

# Setup Python environment
echo "🐍 Setting up Python environment..."
cd ../python

if [ ! -d ".venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv .venv
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create Python virtual environment"
        exit 1
    fi
fi

echo "📦 Activating virtual environment..."
source .venv/bin/activate

echo "📦 Installing Python dependencies..."
pip install -q -r requirements.txt
if [ $? -ne 0 ]; then
    echo "❌ Failed to install Python dependencies"
    exit 1
fi

# Verify MPS availability
echo "🍎 Checking Apple Silicon (MPS) availability..."
python separate.py --check-mps
if [ $? -ne 0 ]; then
    echo "⚠️  MPS not available. Preprocessing will use CPU (slower)."
fi

echo "✅ Python environment setup complete"
echo ""

# Setup frontend
echo "⚛️  Setting up frontend..."
cd ../frontend

if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install frontend dependencies"
        exit 1
    fi
fi

# Build frontend for production
echo "🔨 Building frontend..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build frontend"
    exit 1
fi

echo "✅ Frontend setup complete"
echo ""

# Create necessary directories
echo "📁 Creating directories..."
cd ..
mkdir -p songs
mkdir -p sessions
mkdir -p backend/uploads
mkdir -p backend/references

echo ""
echo "🚀 Starting server..."
echo ""

# Start backend (serves built frontend)
echo "🔧 Starting Karaoke Arcade v2.0 on port 8080..."
cd backend
node server.js &
SERVER_PID=$!

# Wait a moment for server to start
sleep 3

echo ""
echo "🎉 Karaoke Arcade v2.0 is running!"
echo ""
echo "🌐 Open in browser: http://localhost:8080"
echo ""
echo "📖 Documentation:"
echo "   - Quick Start: ../QUICKSTART.md"
echo "   - Architecture: ../ARCHITECTURE.md"
echo ""
echo "Press Ctrl+C to stop the server"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping server..."
    kill $SERVER_PID 2>/dev/null
    echo "✅ Server stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for process
wait
