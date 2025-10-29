# 🐳 Docker Setup for Karaoke Arcade

This guide will help you run Karaoke Arcade using Docker, making it easy to set up and run without installing dependencies manually.

## 📋 Prerequisites

- **Docker** installed ([Download Docker Desktop](https://www.docker.com/products/docker-desktop))
- **Docker Compose** (included with Docker Desktop)
- At least **8GB RAM** allocated to Docker
- At least **10GB disk space** available

## 🚀 Quick Start

### 1. Build and Run with Docker Compose

**Option A: Using the helper script (recommended)**

```bash
# Just run this!
./docker-start.sh

# Or to rebuild from scratch
./docker-start.sh --build
```

**Option B: Manual Docker Compose**

```bash
# Build and start the container
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

This will:
- Build the Docker image with all dependencies
- Start the container on port 8080
- Set up volumes to persist your songs and database

### 2. Access the Application

Open your browser and go to:
```
http://localhost:8080
```

### 3. Stop the Application

```bash
# Stop the container
docker-compose down

# Stop and remove volumes (⚠️ deletes all songs and data)
docker-compose down -v
```

## 🎵 Using the App

1. **Upload Songs**: Click "UPLOAD SONG" and select your karaoke video + original audio
2. **Wait for Processing**: Preprocessing runs in the container (CPU mode, slower but works)
3. **Sing**: Select a song and start singing!

## 📦 Managing Data

### Your Songs and Database

All data is stored in local directories on your host machine:

```
./songs/              # Your uploaded songs
./sessions/           # Session data
./backend/uploads/    # Temporary uploads
```

These are **persisted across container restarts** via Docker volumes.

### Backup Your Data

```bash
# Copy the entire project directory (includes songs)
cp -r /path/to/karaoke-arcade-skeleton /path/to/backup
```

### Reset Everything

```bash
# Stop and remove everything
docker-compose down -v

# Remove all song data
rm -rf songs/* sessions/* backend/uploads/*
```

## 🐛 Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs

# View real-time logs
docker-compose logs -f

# Restart the container
docker-compose restart
```

### Preprocessing is Slow

**Expected behavior!** Docker runs on CPU (no MPS/Metal acceleration), so preprocessing will take:
- **4-8 minutes** for a 3-minute song (vs 90 seconds on macOS with MPS)

This is normal and the app will still work perfectly!

### Port Already in Use

If port 8080 is already taken, edit `docker-compose.yml`:

```yaml
ports:
  - "8081:8080"  # Change 8081 to any available port
```

Then restart:
```bash
docker-compose up -d
```

### Run Out of Disk Space

```bash
# Clean up Docker system
docker system prune -a

# Remove old images
docker image prune -a
```

### View Container Console

```bash
# Enter the running container
docker exec -it karaoke-arcade /bin/bash

# Check logs
docker logs karaoke-arcade
```

## 🔧 Advanced Usage

### Build Image Manually

```bash
docker build -t karaoke-arcade .
```

### Run Without Docker Compose

```bash
docker run -d \
  --name karaoke-arcade \
  -p 8080:8080 \
  -v $(pwd)/songs:/app/songs \
  -v karaoke-db:/app/backend/karaoke.db \
  -v $(pwd)/sessions:/app/sessions \
  karaoke-arcade
```

### Update the Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up -d --build
```

### Check Resource Usage

```bash
# View container stats
docker stats karaoke-arcade

# View disk usage
docker system df
```

## 📝 Differences from Native Installation

### Performance

- **Preprocessing**: ~4-8x slower (CPU vs MPS)
- **Real-time scoring**: Same performance
- **Memory**: Requires more RAM (~2-4GB for container)

### Features

- ✅ All features work
- ✅ Song upload and processing
- ✅ Real-time scoring
- ✅ Leaderboard
- ⚠️ Slower preprocessing (CPU fallback)
- ⚠️ No GPU acceleration

### Files

- Songs are stored on your host machine
- Database persists across restarts
- All data is accessible outside the container

## 💡 Tips

1. **First run**: Building the image takes 10-15 minutes (downloading dependencies)
2. **Subsequent runs**: Only ~10 seconds to start
3. **Disk space**: Each song takes ~100-200MB (video + processed audio)
4. **Memory**: Give Docker at least 8GB RAM in settings

## 🆘 Getting Help

If you encounter issues:

1. Check the logs: `docker-compose logs`
2. Ensure Docker has enough resources (RAM, disk space)
3. Try rebuilding: `docker-compose up -d --build`
4. Check that ports are available

## 🎉 Sharing with Friends

Want to share your setup? Just send them:

1. The entire project directory (or a git clone)
2. These Docker files:
   - `Dockerfile`
   - `docker-compose.yml`
   - `.dockerignore`
3. Tell them to run: `docker-compose up -d --build`

That's it! No need to install Node.js, Python, or any dependencies.

---

**Enjoy singing! 🎤✨**

