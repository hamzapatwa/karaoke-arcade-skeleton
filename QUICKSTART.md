# 🎤 Karaoke Arcade - Quick Start Guide

## TL;DR

1. Install dependencies
2. Add a song (karaoke video + original audio)
3. Wait for preprocessing (~90s)
4. Sing and get scored!

---

## Prerequisites

- **macOS 12.3+** (for Metal Performance Shaders)
- **Python 3.10+**
- **Node.js 20+**
- **ffmpeg** (`brew install ffmpeg`)

---

## Installation

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd karaoke-arcade-skeleton
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

### 4. Install Python Dependencies

```bash
cd ../python
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 5. Verify MPS (Apple Silicon Acceleration)

```bash
python separate.py --check-mps
```

**Expected output**: ✅ MPS is available and ready to use!

If you see an error, check:
- macOS version (must be 12.3+)
- PyTorch installation: `pip install --upgrade torch torchvision torchaudio`

---

## Usage

### Start the Server

```bash
cd backend
node server.js
```

**Expected output**:
```
🎤 Karaoke Arcade Server v2 running on port 8080
   - Upload videos: POST /songs/upload
   - Check status: GET /songs/:id/status
   - Start session: POST /sessions/start
   - Refine results: POST /sessions/:id/refine
```

### Open the Web App

Open your browser to: **http://localhost:8080**

---

## Adding Your First Song

### Option 1: Via Web UI (Recommended)

1. Click "UPLOAD SONG"
2. Fill in song name
3. Select karaoke video (MP4/WebM with lyrics)
4. Select original audio (WAV/MP3 studio version)
5. Click "START PREPROCESSING"
6. Wait ~90 seconds (progress bar shows status)
7. Song appears in library when ready!

### Option 2: Via Command Line

```bash
# Upload
curl -X POST http://localhost:8080/songs/upload \
  -F "song_name=My Favorite Song" \
  -F "karaoke_video=@/path/to/karaoke.mp4" \
  -F "original_audio=@/path/to/original.wav"

# Response: {"song_id": "abc-123", "status": "processing"}

# Check status
curl http://localhost:8080/songs/abc-123/status

# Response: {"status": "complete", "progress": 1.0}
```

---

## Performing

### 1. Select Song

Browse the song library and click on a song to select it.

### 2. Mic Check

- Allow microphone access when prompted
- Speak/sing to test audio levels
- Optional: Enable motion tracking for bonus points
- Click "START SESSION"

### 3. Sing!

- Video plays with karaoke lyrics
- Live HUD shows real-time scoring:
  - **Note Lane**: Visual pitch tracking
  - **Cents Error Bar**: How close you are to reference
  - **Beat LEDs**: Rhythm indicator
  - **Combo Counter**: Sustained accuracy streak
  - **Scores**: Pitch (65%), Rhythm (25%), Energy (10%)

### 4. View Results

- Overall grade (A+, A, B, etc.)
- Per-phrase breakdown
- Pitch timeline chart
- Earned badges:
  - 🎵 **Smooth Operator**: Perfect pitch
  - 🥁 **On-Beat Bandit**: Perfect rhythm
  - 🔥 **Mic Melter**: High energy
  - 👑 **Combo King**: Longest streak

### 5. (Optional) Refine Results

Click "REFINE RESULTS" to trigger post-run DTW analysis for more accurate phrase-level scoring.

### 6. Submit to Leaderboard

Enter your name and submit your score!

---

## Troubleshooting

### "MPS not available"

**Solution**:
```bash
# Check PyTorch MPS support
python -c "import torch; print(torch.backends.mps.is_available())"

# If False, reinstall PyTorch
pip install --upgrade torch torchvision torchaudio
```

### "Preprocessing failed"

**Possible causes**:
1. Video file corrupt (try re-downloading)
2. Audio file not in WAV/MP3 format (convert with ffmpeg)
3. Insufficient disk space
4. Python dependency missing

**Check logs**:
```bash
# Backend console shows Python stderr
# Look for error messages in terminal
```

### "Microphone access denied"

**Solution**:
- Browser prompts for mic permission → Click "Allow"
- macOS System Settings → Privacy & Security → Microphone → Allow browser
- Refresh page and try again

### "Echo cancellation not working"

**Symptoms**: Pitch detection unstable, high aecReduction values

**Solutions**:
1. **Reduce karaoke volume** (most effective)
2. **Increase distance** from speakers
3. **Use headphones** (disables echo cancellation, but eliminates problem)
4. **Adjust AEC step size** (in LiveHUD.jsx, increase from 0.01 to 0.02)

### "Alignment quality low" (quality < 0.7)

**Possible causes**:
- Karaoke and original are different arrangements
- Karaoke is in different key
- Tempo significantly different

**Solutions**:
1. Verify songs match (same artist, same version)
2. Try increasing DTW band width:
   ```bash
   python preprocess_full.py \
     --karaoke-video karaoke.mp4 \
     --original-audio original.wav \
     --output-dir output \
     --device mps \
     --dtw-band-width 0.2  # Increase from 0.1
   ```
3. Manual verification: Listen to `vocals_ref.wav` vs `karaoke_audio.wav`

### "Video playback stuttering"

**Solutions**:
1. Close other apps (free up CPU/GPU)
2. Re-encode video to lower bitrate:
   ```bash
   ffmpeg -i input.mp4 -b:v 2M -c:a copy output.mp4
   ```
3. Use MP4 instead of WebM (better browser support)

### "Score seems inaccurate"

**Possible causes**:
1. Low pitch confidence (mumbling, background noise)
2. Misalignment (karaoke/original out of sync)
3. Key-shift not detected (singing in different octave)

**Solutions**:
1. Sing louder and clearer
2. Reduce background noise
3. Use "Refine Results" for better accuracy
4. Check alignment quality in reference.json

---

## Tips for Best Results

### Recording Your Songs

1. **Download high-quality karaoke videos**:
   - 1080p minimum
   - Clear, readable lyrics
   - Good instrumental quality

2. **Use studio versions for original audio**:
   - WAV format (lossless) preferred
   - MP3 320kbps acceptable
   - Same artist/version as karaoke

3. **Check sync before uploading**:
   - Play both files side-by-side
   - Verify they're in the same key
   - Confirm tempo matches

### Performance Setup

1. **Environment**:
   - Quiet room (minimize background noise)
   - Good lighting (if using motion tracking)
   - Comfortable distance from screen

2. **Audio**:
   - External USB mic recommended (better quality)
   - Built-in Mac mic works fine for casual use
   - Speakers: Medium volume (reduces echo issues)
   - Headphones: Use if echo cancellation fails

3. **Singing**:
   - Warm up your voice!
   - Stay close to reference pitch (don't transpose octaves)
   - Follow beat indicators
   - Maintain consistent volume

---

## Advanced: Manual Preprocessing

For power users who want more control:

```bash
cd python
source .venv/bin/activate

# 1. Separate vocals manually
python separate.py \
  --input /path/to/original.wav \
  --output-dir /path/to/output \
  --device mps \
  --model htdemucs_ft

# 2. Run full preprocessing
python preprocess_full.py \
  --song-id my-song-123 \
  --karaoke-video /path/to/karaoke.mp4 \
  --original-audio /path/to/original.wav \
  --output-dir /songs/my-song-123 \
  --device mps

# 3. Verify reference.json
cat /songs/my-song-123/reference.json | jq '.warp_T.quality'
# Should be > 0.7 for good alignment

# 4. Manually add to database
sqlite3 backend/karaoke.db
INSERT INTO songs (id, name, preprocessing_status, duration, tempo, key)
VALUES ('my-song-123', 'My Song', 'complete', 180.5, 120.0, 'C major');
```

---

## Demo Tracks

Test the system with included demo tracks:

```bash
cd python
source .venv/bin/activate

# Preprocess demo ballad
python preprocess_full.py \
  --song-id demo-ballad \
  --karaoke-video ../demo_tracks/demo_ballad.mp4 \
  --original-audio ../demo_tracks/demo_ballad_full.wav \
  --output-dir ../songs/demo-ballad \
  --device mps
```

---

## Performance Benchmarks

**On MacBook Pro M3 Pro**:

| Task | Time |
|------|------|
| Upload (100MB video) | ~10s |
| Preprocessing (3min song) | ~90s |
| - Vocal separation | ~45s |
| - DTW alignment | ~5s |
| - Pitch extraction | ~8s |
| Real-time scoring | <10ms latency |
| Post-run refinement | ~3s |

---

## File Locations

```
📁 karaoke-arcade-skeleton/
├── 📁 songs/
│   └── 📁 <song_id>/
│       ├── karaoke.mp4              # Karaoke video
│       ├── karaoke_audio.wav        # Extracted audio
│       ├── original_audio.wav       # Studio audio
│       ├── vocals_ref.wav           # Separated vocals
│       ├── accompaniment_ref.wav    # Instrumental
│       └── reference.json           # Scoring reference
├── 📁 sessions/
│   └── 📁 <session_id>/
│       ├── performance.json         # Your performance
│       └── refined.json             # Refined results
├── 📁 backend/
│   └── karaoke.db                   # Database
└── 📁 frontend/
    └── dist/                        # Built web app
```

---

## Updating

```bash
# Update code
git pull

# Update dependencies
cd backend && npm install
cd ../frontend && npm install
cd ../python && source .venv/bin/activate && pip install --upgrade -r requirements.txt
```

---

## Support

**Issues**:
- Check ARCHITECTURE.md for detailed docs
- Review troubleshooting section above
- Check backend console for Python errors
- Inspect browser console for frontend errors

**Performance**:
- Preprocessing too slow? Check MPS availability
- Real-time scoring laggy? Close other apps
- Echo issues? Reduce volume or use headphones

---

## What's Next?

After your first successful performance:

1. **Upload more songs** and build your library
2. **Compete on leaderboard** with friends
3. **Try different genres** (system adapts to all styles)
4. **Experiment with settings** (adjust tolerances, weights)
5. **Share feedback** for future improvements!

---

**🎉 Happy singing! 🎤✨**

For detailed technical documentation, see `ARCHITECTURE.md`.

