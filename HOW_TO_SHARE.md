# How to Share Your Karaoke Arcade with Friends

## 🎯 The Easiest Way to Share

Your app is now Docker-ready! Share it with friends who can run it on **any computer** without installing anything.

## 📤 What to Share

Send your friend these files/folders:

### Required Files
```
✅ Dockerfile
✅ docker-compose.yml
✅ .dockerignore
✅ docker-start.sh
✅ DOCKER_README.txt
✅ DOCKER.md
```

### Required Directories
```
✅ backend/
✅ frontend/
✅ python/
✅ schemas/
```

### Optional (for preprocessed songs)
```
📁 songs/    (if you want to include preprocessed songs)
```

### Don't Need to Share
```
❌ node_modules/     (will be installed in Docker)
❌ .venv/            (will be installed in Docker)
❌ dist/             (will be built in Docker)
❌ *.db              (will be created fresh)
```

## 🚀 What Your Friend Needs

1. **Install Docker Desktop** from https://www.docker.com/products/docker-desktop/
2. **Get the project files** (zip, git clone, USB drive, etc.)
3. **Run the startup script**: `./docker-start.sh`
4. **Done!** Open http://localhost:8080

## 💬 What to Tell Your Friend

```
Hey! I've set up my karaoke app in Docker. Here's how to run it:

1. Install Docker Desktop (https://www.docker.com/products/docker-desktop/)
2. Download/unzip the project
3. Open terminal in the project folder
4. Run: ./docker-start.sh
5. Wait 10-15 minutes for the first build
6. Open http://localhost:8080 in your browser
7. Start singing! 🎤

No need to install Node.js, Python, or anything else - Docker handles it all!

Note: Preprocessing will be a bit slower (4-6 min per song) but everything works!

Questions? Read DOCKER.md for details.
```

## 🎁 Quick Start (One-Liner)

Your friend can copy-paste this into their terminal:

```bash
# Assuming they're on Mac/Linux with Docker installed
git clone <your-repo-url> karaoke-arcade
cd karaoke-arcade
./docker-start.sh
```

## ⚠️ Important Notes

1. **First build takes 10-15 minutes** (downloading all dependencies)
2. **Preprocessing is slower** (~4-6 min per song in CPU mode vs 90 sec with MPS)
3. **RAM**: Docker needs at least 4GB RAM assigned
4. **Disk**: ~5GB free space recommended
5. **Port 8080** must be available

## 🎵 Sharing Songs

Want to share preprocessed songs with your friend?

```bash
# Zip up a specific song
cd songs
zip -r favorite-song.zip <song-id>/
```

Your friend can unzip it into their `songs/` directory and it will appear in the library!

## 🐛 If Something Goes Wrong

Your friend should:
1. Check Docker is running
2. Read logs: `docker-compose logs`
3. Read DOCKER.md for troubleshooting
4. Try: `docker-compose down && docker-compose up --build`

## 🎉 That's It!

Your friend now has a fully functional karaoke app with zero dependency hell!

