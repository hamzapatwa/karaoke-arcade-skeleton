# 🎤 Karaoke Arcade - Architecture Documentation

## System Overview

This is a **local, offline karaoke web application** designed for MacBook Pro (Apple Silicon) that plays downloaded YouTube karaoke videos with real-time vocal scoring.

### Core Design Principles

1. **Video Playback**: Karaoke videos (MP4/WebM) with baked-in lyrics
2. **Audio-Only Scoring**: Microphone captures vocals; reference extracted from studio track
3. **Offline Processing**: Full songs preprocessed locally (no cloud dependency)
4. **Apple Silicon Optimized**: PyTorch MPS, TF-Metal, CoreML for ML workloads
5. **Speaker Playback**: NLMS adaptive echo cancellation in AudioWorklet
6. **Fixed Difficulty**: Easy mode (generous tolerances)

---

## Architecture Components

### 1. Frontend (Browser)

**Stack**: React 18 + Vite + Web Audio API + Canvas/WebGL

**Key Files**:
- `VideoKaraokePlayer.jsx`: Video playback with `requestVideoFrameCallback`
- `LiveHUD.jsx`: Real-time scoring HUD (65% pitch, 25% rhythm, 10% energy)
- `pitch-processor-aec.js`: AudioWorklet with NLMS echo cancellation

**Video Playback**:
```javascript
// Frame-accurate timing via requestVideoFrameCallback
video.requestVideoFrameCallback((now, metadata) => {
  const time = metadata.mediaTime;
  onTimeUpdate(time);  // Sync to LiveHUD
});
```

**Audio Processing Pipeline**:
```
Microphone Input
  ↓ (getUserMedia with echoCancellation: true)
AudioContext (48kHz)
  ↓
AudioWorklet (pitch-processor-aec.js)
  ↓ [NLMS Adaptive Filter]
  ├─ Reference Signal (karaoke playback)
  └─ Mic Signal → Echo Removal
  ↓ [YIN Pitch Detection]
  ↓ [RMS Energy + Spectral Centroid]
  ↓
PostMessage → LiveHUD
  ↓ [Scoring Engine]
  └─ Display (Canvas HUD)
```

**HUD Visualization**:
- **Note Lane**: Visual pitch tracking with reference line
- **Cents Error Bar**: ±50 cents tolerance indicator
- **Beat LEDs**: 8 LEDs synced to beat grid
- **Combo Counter**: Streak display for sustained accuracy

---

### 2. Backend (Node.js)

**Stack**: Express + SQLite + WebSocket + Child Process Spawning

**Key Files**:
- `server.js`: Main server with video uploads and preprocessing queue

**Database Schema**:
```sql
-- Songs table
CREATE TABLE songs (
  id TEXT PRIMARY KEY,
  name TEXT,
  preprocessing_status TEXT,  -- 'pending', 'processing', 'complete', 'error'
  preprocessing_progress REAL,
  duration REAL,
  tempo REAL,
  key TEXT
);

-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  song_id TEXT,
  results TEXT,              -- JSON blob
  refined_results TEXT       -- Post-run DTW refinement
);

-- Leaderboard table
CREATE TABLE leaderboard (
  session_id TEXT,
  player_name TEXT,
  total_score REAL,
  pitch_score REAL,
  rhythm_score REAL,
  energy_score REAL,
  badges TEXT
);
```

**API Endpoints**:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/songs/upload` | Upload karaoke video + original audio |
| `GET` | `/songs/:id/status` | Check preprocessing progress |
| `GET` | `/songs` | Get song library (ready songs) |
| `GET` | `/video/:song_id/:filename` | Stream video with range support |
| `POST` | `/sessions/start` | Create new session |
| `POST` | `/sessions/:id/finish` | Save performance results |
| `POST` | `/sessions/:id/refine` | Trigger post-run DTW refinement |
| `GET` | `/sessions/:id/results` | Get results (raw + refined) |
| `POST` | `/leaderboard/submit` | Submit to leaderboard |
| `GET` | `/leaderboard` | Get top scores |

---

### 3. Python Microservice (macOS)

**Stack**: PyTorch (MPS) + librosa + essentia + DTW

**Key Scripts**:

#### `separate.py` - Vocal Separation
```python
# Uses Demucs v4 (htdemucs_ft model) with MPS backend
def separate_with_demucs(input_path, output_dir, device='mps'):
    model = get_model('htdemucs_ft')
    model.to('mps')  # Metal Performance Shaders

    # Separate into: vocals, accompaniment, drums, bass
    sources = apply_model(model, wav, device='mps')

    # Output: vocals.wav, accompaniment.wav
```

**Optimization**:
- PyTorch with MPS backend (4-8x faster than CPU on M3 Pro)
- Batch processing with memory-efficient chunking

---

#### `preprocess_full.py` - Comprehensive Preprocessing

**Pipeline Steps**:

1. **Extract Karaoke Audio from Video**
   ```python
   import av
   audio = extract_audio_from_video('karaoke.mp4', sr=48000)
   ```

2. **Separate Original Audio**
   ```python
   vocals, accompaniment = separate_with_demucs('original.wav')
   ```

3. **Extract Chroma Features**
   ```python
   chroma_k = librosa.feature.chroma_cqt(karaoke_audio)
   chroma_ref = librosa.feature.chroma_cqt(accompaniment)
   ```

4. **DTW Alignment**
   ```python
   from dtaidistance import dtw

   # Align karaoke instrumental to reference accompaniment
   tk_aligned, tref_aligned = align_with_dtw(
       chroma_k, chroma_ref,
       band_width=0.1  # Sakoe-Chiba band
   )
   ```

5. **Piecewise Linear Mapping**
   ```python
   # Handle tempo changes and arrangement differences
   segments = fit_piecewise_linear(tk_aligned, tref_aligned, window=200)

   # Each segment: tref = a * tk + b
   # Quality score (R²) tracks alignment confidence
   ```

6. **Pitch Extraction (torch-crepe with MPS)**
   ```python
   import torchcrepe

   pitch, periodicity = torchcrepe.predict(
       vocals_tensor,
       sr=48000,
       hop_length=1024,
       fmin=50,
       fmax=1000,
       model='full',
       device='mps',
       decoder=torchcrepe.decode.viterbi
   )
   ```

7. **Warp Reference Pitch to Karaoke Timeline**
   ```python
   # For each karaoke frame, map to reference time
   for tk in karaoke_timeline:
       tref = segment.map_time(tk)  # Using alignment segments
       f0_warped[tk] = interpolate(f0_ref, tref)

   # Smooth with median filter + EMA
   ```

8. **Create Note Bins**
   ```python
   # Segment pitch into discrete notes
   note_bins = [
       {
           'start': 12.40,
           'end': 12.78,
           'f0': 220.5,      # Median pitch (Hz)
           'tol_cents': 40   # ±40 cents tolerance
       },
       # ...
   ]
   ```

9. **Extract Beats, Phrases, Loudness**
   ```python
   beats_k = librosa.beat.beat_track(karaoke_audio)
   phrases_k = detect_phrases(karaoke_audio, beats_k)
   loudness_ref = calculate_loudness_profile(vocals)
   ```

**Output**: `reference.json`

---

#### `refine_results.py` - Post-Run Refinement

**Purpose**: Improve per-phrase accuracy using DTW on actual performance

```python
def refine_results(reference, performance):
    for phrase in reference['phrases_k']:
        # Extract phrase pitch contours
        ref_pitch = extract_phrase_pitch(reference, phrase)
        singer_pitch = extract_phrase_pitch(performance, phrase)

        # DTW alignment
        cost, ref_idx, singer_idx = align_phrase_dtw(ref_pitch, singer_pitch)

        # Calculate metrics on aligned frames
        cents_errors = [
            1200 * log2(singer_pitch[i] / ref_pitch[j])
            for i, j in zip(singer_idx, ref_idx)
        ]

        accuracy = percent_within_tolerance(cents_errors, 50)
        median_error = median(cents_errors)

        # Timing offset
        timing_offset = mean(singer_times[i] - ref_times[j])
```

**Output**: Enhanced results with phrase-level accuracy, timing charts

---

## File Layout Structure

```
/songs/<song_id>/
  ├── karaoke.mp4              # Original karaoke video (with lyrics)
  ├── karaoke_audio.wav        # Extracted audio (48kHz mono)
  ├── original_audio.wav       # Studio recording (provided by user)
  ├── vocals_ref.wav           # Separated vocals (Demucs output)
  ├── accompaniment_ref.wav    # Separated instrumental
  └── reference.json           # Comprehensive reference data

/sessions/<session_id>/
  ├── performance.json         # Raw performance data (timestamps, pitch, energy)
  └── refined.json             # Post-run DTW refinement results
```

---

## Reference JSON Schema v2.0

```json
{
  "version": "2.0",
  "song_id": "my-song-123",
  "fps": 50,                    // Frame rate (20ms resolution)
  "duration": 214.37,           // Karaoke duration (seconds)

  // Karaoke timeline features
  "beats_k": [0.58, 1.09, ...],
  "downbeats_k": [0.58, 5.32, ...],
  "tempo": 120.5,
  "phrases_k": [
    {"id": 1, "start": 12.40, "end": 15.10},
    // ...
  ],
  "key": "G# minor",

  // DTW Alignment Mapping
  "warp_T": {
    "tk": [0.0, 0.5, ...],           // Karaoke timeline grid
    "tref": [0.06, 0.61, ...],       // Corresponding reference times
    "quality": 0.93,                 // Overall R²
    "segments": [
      {
        "tk_start": 0.0,
        "tk_end": 10.0,
        "a": 1.02,                   // tref = 1.02 * tk + 0.05
        "b": 0.05,
        "quality": 0.95
      },
      // ... (handles tempo changes, arrangement diffs)
    ]
  },

  // Warped reference pitch on karaoke timeline
  "f0_ref_on_k": [
    {"t": 12.40, "f0": 220.5, "conf": 0.96},
    {"t": 12.42, "f0": 221.0, "conf": 0.97},
    // ... (50 fps = 5000 frames for 100s song)
  ],

  // Discrete note bins for scoring
  "note_bins": [
    {"start": 12.40, "end": 12.78, "f0": 220.5, "tol_cents": 40},
    {"start": 12.80, "end": 13.20, "f0": 246.9, "tol_cents": 40},
    // ...
  ],

  // Loudness reference (for energy scoring)
  "loudness_ref": [
    {"t": 12.40, "LUFS": -18.2},
    {"t": 12.42, "LUFS": -17.8},
    // ...
  ],

  // Preprocessing config
  "config": {
    "pitch_conf_threshold": 0.3,
    "note_tolerance_cents": 40,
    "min_note_duration": 0.2
  }
}
```

---

## Real-Time Scoring Engine

### Weights
- **Pitch**: 65%
- **Rhythm**: 25%
- **Energy**: 10%

### Pitch Scoring (65%)

**Algorithm**:
```javascript
function calculatePitchScore(singerFreq, refFreq, confidence) {
  // Calculate cents error
  let centsError = 1200 * Math.log2(singerFreq / refFreq);

  // Key-shift forgiveness (detect sustained offset)
  if (detectedKeyShift) {
    centsError -= keyShiftOffset;  // Transpose back
  }

  // Score tiers
  const absError = Math.abs(centsError);

  if (absError <= 10) return 1.00;      // Perfect
  if (absError <= 25) return 0.90;      // Good
  if (absError <= 50) return 0.70;      // Acceptable
  return Math.max(0, 0.50 - (absError - 50) * 0.005);
}
```

**Key-Shift Detection**:
```javascript
// Accumulate cents errors over 10 samples
keyShiftSamples.push(centsError);

if (keyShiftSamples.length >= 10) {
  const medianOffset = median(keyShiftSamples);

  // If sustained offset ±100-200 cents, apply shift
  if (Math.abs(medianOffset) > 100 && Math.abs(medianOffset) < 200) {
    detectedKeyShift = medianOffset;
  }
}
```

**Chroma Folding** (Octave Error Correction):
- If error > 600 cents (half octave), fold to nearest octave
- Prevents octave jumps from destroying score

---

### Rhythm Scoring (25%)

**Algorithm**:
```javascript
function calculateRhythmScore(currentTime, nearestBeat) {
  const beatDistanceMs = Math.abs(currentTime - nearestBeat) * 1000;

  if (beatDistanceMs <= 50)  return 1.0;   // Perfect (±50ms)
  if (beatDistanceMs <= 100) return 0.8;   // Good (±100ms)
  if (beatDistanceMs <= 200) return 0.5;   // Acceptable (±200ms)
  return 0.2;
}
```

**On-Beat Detection**:
- Beat LEDs light up when rhythm score > 0.8
- Combo increments for sustained on-beat performance

---

### Energy Scoring (10%)

**Algorithm**:
```javascript
function calculateEnergyScore(singerRMS, refLoudness) {
  const singerDB = 20 * Math.log10(singerRMS);
  const loudnessDiff = Math.abs(singerDB - refLoudness);

  if (loudnessDiff <= 6) return 1.0;  // Within ±6dB
  return Math.max(0, 1.0 - (loudnessDiff - 6) * 0.05);
}
```

**Caps**:
- Prevents "shout to win" by capping energy contribution
- Spectral centroid (brightness) future enhancement

---

### Combo System

```javascript
function updateCombo(frameScore) {
  if (frameScore >= 0.7) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else if (frameScore < 0.3) {
    combo = 0;  // Break combo
  }
  // 0.3 <= frameScore < 0.7: maintain combo (grace period)
}
```

---

## Echo Cancellation (NLMS)

**Problem**: Speaker playback bleeds into microphone

**Solution**: Normalized Least Mean Squares adaptive filter

```javascript
class PitchProcessorAEC {
  applyNLMS(micSample, referenceSample) {
    // Add reference to buffer
    referenceBuffer[bufferIdx] = referenceSample;

    // Compute echo estimate
    let echoEstimate = 0;
    for (let i = 0; i < filterLength; i++) {
      echoEstimate += weights[i] * referenceBuffer[i];
    }

    // Error signal (mic - echo)
    const error = micSample - echoEstimate;

    // Normalize by reference power
    const refPower = sum(referenceBuffer^2) + regularization;
    const stepSize = μ / refPower;

    // Update filter weights
    for (let i = 0; i < filterLength; i++) {
      weights[i] += stepSize * error * referenceBuffer[i];
      weights[i] = clamp(weights[i], -1, 1);  // Stability
    }

    return error;  // Cleaned signal
  }
}
```

**Parameters**:
- Filter length: 512 taps (~10ms at 48kHz)
- Step size (μ): 0.01
- Regularization: 0.001

**Performance**:
- ~20-30dB echo reduction
- Low latency (<5ms added)

---

## Deployment Workflow

### 1. Setup

```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install
npm run build

# Python
cd python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Verify MPS availability
python separate.py --check-mps
```

### 2. Add Song

```bash
# Upload via web UI or API
curl -X POST http://localhost:8080/songs/upload \
  -F "song_name=My Song" \
  -F "karaoke_video=@karaoke.mp4" \
  -F "original_audio=@original.wav"

# Returns: {"song_id": "abc-123", "status": "processing"}

# Check status
curl http://localhost:8080/songs/abc-123/status
# {"status": "complete", "progress": 1.0}
```

### 3. Perform

```javascript
// Frontend flow
1. Select song from library
2. Mic check (AEC warmup)
3. Start session → play video
4. LiveHUD scores in real-time
5. Finish session → save results
6. (Optional) Refine results → DTW post-processing
7. View detailed results + leaderboard
```

---

## Performance Benchmarks (M3 Pro)

| Task | Time | Notes |
|------|------|-------|
| Vocal separation (3min song) | ~45s | Demucs htdemucs_ft on MPS |
| DTW alignment | ~5s | Chroma + dtaidistance |
| Pitch extraction (torch-crepe) | ~8s | MPS accelerated |
| Full preprocessing | ~90s | End-to-end pipeline |
| Real-time scoring | <10ms | AudioWorklet + Canvas |
| Post-run refinement | ~3s | Phrase-local DTW |

---

## Edge Cases & Fallbacks

### Low Alignment Quality (R² < 0.7)

**Problem**: Karaoke and original very different (key change, arrangement)

**Fallback**:
- Relative melody scoring (compare pitch deltas vs trend)
- Beat-only rhythm scoring
- Display warning: "Alignment uncertain—scores approximate"

### Rap/Speech (Low Pitch Confidence)

**Problem**: Rapid syllables, unclear pitch

**Solution**:
- Detect low-confidence spans (conf < 0.3 for >2s)
- Reweight: 30% pitch, 50% rhythm, 20% energy
- Display: "Rap mode activated"

### Section Re-arrangements

**Problem**: Chorus order different in karaoke vs original

**Solution**:
- Section-wise DTW (align chorus chunks independently)
- Stitch alignment paths
- May require manual section markers in future

### Intros/Outros (No Vocals)

**Solution**:
- Detect unvoiced regions in reference (f0 == 0 for >5s)
- Exclude from scoring
- UI: "Instrumental section—no scoring"

---

## Future Enhancements

1. **Multiplayer Duets**: Split-screen lanes, synchronized sessions
2. **Custom Difficulty Levels**: Tighten tolerances for "Hard" mode
3. **Genre-Specific Tuning**: Rock vs. Opera vs. R&B scoring profiles
4. **Mobile App**: iOS native app with Metal shaders
5. **Cloud Leaderboards**: Optional Firebase sync
6. **AI Coach**: Post-performance tips ("Try sliding up to high notes")

---

## Development Tips

### Testing Preprocessing

```bash
# Use demo tracks in demo_tracks/
python preprocess_full.py \
  --song-id demo-ballad \
  --karaoke-video demo_tracks/demo_ballad.mp4 \
  --original-audio demo_tracks/demo_ballad_full.wav \
  --output-dir songs/demo-ballad
```

### Debugging Real-Time Scoring

```javascript
// Enable debug mode in LiveHUD.jsx
const DEBUG = true;

// Logs every frame:
console.log({
  time: currentTime,
  singerF0: frequency,
  refF0: refData.f0,
  centsError,
  pitchScore,
  rhythmScore,
  energyScore
});
```

### Analyzing Alignment

```python
# In preprocess_full.py, save alignment debug plot
import matplotlib.pyplot as plt

plt.scatter(tk_aligned, tref_aligned, alpha=0.3)
plt.plot([0, max(tk)], [0, max(tref)], 'r--')  # Perfect alignment
plt.xlabel('Karaoke Time (s)')
plt.ylabel('Reference Time (s)')
plt.savefig('alignment_debug.png')
```

---

## Troubleshooting

### "MPS not available"

**Solution**:
```bash
python -c "import torch; print(torch.backends.mps.is_available())"
# If False, reinstall PyTorch:
pip install --upgrade torch torchvision torchaudio
```

### "Alignment quality low"

**Symptoms**: quality < 0.7 in reference.json

**Fixes**:
1. Check if karaoke and original are same song/key
2. Try increasing DTW band width (--dtw-band-width 0.2)
3. Manual verification: Listen to vocals_ref.wav vs karaoke_audio.wav

### "Echo cancellation not working"

**Symptoms**: High aecReduction values, pitch detection unstable

**Fixes**:
1. Reduce karaoke volume
2. Increase AEC step size (setAECStepSize(0.02))
3. Use headphones (disables AEC)
4. Check mic placement (distance from speakers)

---

## License & Credits

**License**: MIT

**Core Dependencies**:
- Demucs: Meta Research (hybrid transformer vocal separation)
- torch-crepe: Max Morrison (pitch tracking)
- librosa: AudioLab (music information retrieval)
- dtaidistance: Wannes Meert (DTW)

**Inspirations**:
- Smule: Mobile karaoke app
- Rocksmith: Real-time guitar scoring
- Clone Hero: Note highway visualization

---

**Built with ❤️ for karaoke enthusiasts**

