# PitchPerfectly Karaoke Arcade - Complete Project Context

## High-Level Summary

PitchPerfectly (also referred to as "Karaoke Arcade") is a local, offline karaoke web application that provides professional-grade vocal analysis and scoring for karaoke performances. The system processes karaoke videos with baked-in lyrics alongside original studio audio to create reference data for real-time vocal scoring. Users can upload song pairs (karaoke video + original audio), perform karaoke with live feedback, and compete on local leaderboards.

### Core Features Implemented

- **Video Karaoke Playback**: Plays MP4/WebM karaoke videos with frame-accurate timing using `requestVideoFrameCallback` API (fallback to `timeupdate` event)
- **Advanced Audio Processing**: Demucs v4 vocal separation (htdemucs_ft model), torch-crepe pitch tracking (full model), DTW alignment for sync handling
- **Real-time Scoring System**: 30% pitch accuracy + 70% energy matching with live visual feedback (user-relative energy scoring)
- **Comprehensive Preprocessing Pipeline**: Automated reference data generation from uploaded content (vocal separation, alignment, pitch extraction, beat detection, key detection)
- **Performance Analytics**: Detailed phrase-level scoring with post-run DTW refinement (optional)
- **Local Leaderboard**: SQLite-based score tracking with badge system (Combo King, Mic Melter, Smooth Operator, On-Beat Bandit)
- **Retro Arcade UI**: Neon grid aesthetics with custom CSS styling (Press Start 2P font, CRT shader effects)
- **Docker Support**: Production and development Docker configurations with GPU support (CUDA) and CPU fallback

## Full Technical Architecture

### System Layers Overview

The application consists of four main layers:

1. **Frontend (React/Vite)**: Web interface with real-time audio processing
2. **Backend (Node.js/Express)**: API server, file handling, database management
3. **Python Processing Layer**: Audio analysis, vocal separation, alignment algorithms
4. **Storage Layer**: SQLite database, file system for media assets

### Inter-Layer Communication

- **Frontend ↔ Backend**: REST API calls for song management, session handling, leaderboard
- **Backend ↔ Python**: Child process spawning for preprocessing tasks
- **Frontend Audio Processing**: AudioWorklet for real-time pitch detection
- **File Streaming**: HTTP range requests for efficient video playback

### Design Patterns

- **MVC Architecture**: Clear separation between UI components, API routes, and data models
- **Pipeline Pattern**: Sequential preprocessing stages with progress tracking
- **Observer Pattern**: Real-time audio processing with event-driven updates
- **Strategy Pattern**: Device-specific optimization (MPS/CUDA/CPU fallbacks)

## Complete Directory + File Breakdown

### Root Level Configuration Files

- **`.gitignore`**: Git ignore patterns (31 lines)
  - Node modules: `backend/node_modules/`, `frontend/node_modules/`
  - Python venv: `python/.venv/`
  - Data directories: `demo_tracks/`, `songs/`, `sessions/`
  - Upload directories: `backend/uploads/`, `backend/references/`
  - Database: `backend/karaoke.db`
  - System files: `.DS_Store`, `**/.DS_Store`
  - Python cache: `python/__pycache__`, `*.pyc`, `*.pyo`
  - IDE: `.vscode/`
  - Script: `upload_demo_tracks.sh` (ignored to prevent accidental commits)

- **`.dockerignore`**: Docker ignore patterns (67 lines)
  - Same patterns as .gitignore plus Docker-specific exclusions
  - Prevents large files from being copied into Docker build context

- **`aws-ecs-task-definition.json`**: AWS ECS task definition for cloud deployment
  - Defines container configuration for ECS
  - GPU support configuration
  - Environment variables and resource limits

- **`cleanup-aws.sh`**: AWS resource cleanup script
  - Removes ECS services, task definitions, and related resources
  - Prevents orphaned cloud resources

- **`deploy-aws-spot-complete.sh`**: Complete AWS deployment script
  - Automated deployment to AWS with Spot instances
  - Creates EFS, ECS cluster, task definitions
  - Configures networking and security groups
  - Uploads songs to EFS

### Root Level Files

- **`README.md`**: Primary documentation with feature overview, installation, and usage (963 lines)
  - Comprehensive feature table with descriptions
  - Quick start guides for Docker (CPU/GPU), native installation, and AWS deployment
  - System architecture flowchart (Mermaid diagram with 200+ lines)
  - Scoring system deep dive with mathematical formulas
  - Technical architecture breakdown by layer
  - Troubleshooting section with common issues and solutions
  - Performance benchmarks for different hardware configurations
  - Best practices for song preparation and recording setup
  - Complete API reference with endpoints and schemas
  - Development workflow and build instructions
  - Roadmap with completed features and future enhancements

- **`QUICKSTART.md`**: User-focused setup guide with troubleshooting (462 lines)
  - TL;DR 4-step quick start
  - Prerequisites with version requirements
  - Installation steps for backend, frontend, Python
  - GPU verification for Apple Silicon (MPS) and NVIDIA (CUDA)
  - Performance comparison table
  - Usage instructions for Docker and native modes
  - Song upload via command line (curl examples)
  - Performance workflow (select song → mic check → sing → results)
  - Comprehensive troubleshooting section
  - Tips for best results
  - Advanced manual preprocessing instructions
  - File locations reference

- **`Dockerfile`**: Multi-stage containerization for production deployment (97 lines)
  - Builder stage: Python 3.11-slim with build dependencies
  - Node.js 20.x installation via NodeSource
  - PyTorch with CUDA 11.8 support (torch, torchvision, torchaudio)
  - Python dependencies installation
  - Backend and frontend build in builder stage
  - Final stage: Runtime-only dependencies (FFmpeg, libsndfile1)
  - Application code copy from builder
  - Directory creation for songs and sessions
  - Environment variables (DEVICE=auto, PORT=8080, NODE_ENV=production)
  - Startup script with GPU detection and Python venv symlink creation

- **`docker-compose.yml`**: Production container orchestration (31 lines)
  - Single service: karaoke-arcade
  - Port mapping: 8080:8080
  - Volume mounts for persistence (songs, sessions, uploads, database)
  - Auto-detect GPU with fallback to CPU
  - Restart policy: unless-stopped
  - Health check with wget (30s interval, 3 retries)

- **`docker-compose.dev.yml`**: Development environment with hot-reloading (58 lines)
  - Two services: backend and frontend
  - Backend: Port 8080, Node --watch for auto-restart
  - Frontend: Port 3000, Vite dev server with HMR
  - Source code mounted as volumes for live editing
  - Named volumes for node_modules to avoid host conflicts
  - Force CPU mode in dev (Mac doesn't support GPU in Docker)
  - VITE_PROXY_TARGET environment variable for Docker networking

- **`docker-dev.sh`**: Development startup script with Docker Compose v2 detection, container cleanup (90 lines)
  - Docker running check
  - Docker Compose v2/v1 detection (docker compose vs docker-compose)
  - Stop existing containers and prune networks
  - Build image if --build flag or image doesn't exist
  - Start containers in detached mode
  - Display access URLs and development tips
  - Show logs with follow flag

- **`docker-start.sh`**: Production Docker startup script with build detection (67 lines)
  - Docker running check
  - Docker Compose v2/v1 detection
  - Build image if --build flag or image doesn't exist
  - Start container in detached mode
  - Display access URL and useful commands
  - Show logs with follow flag

- **`start.sh`**: Native installation startup script with prerequisite checking (164 lines)
  - Node.js, Python, macOS version checks
  - Backend npm install if node_modules missing
  - Python venv creation and dependency installation
  - MPS availability check for Apple Silicon
  - Frontend npm install and production build
  - Directory creation (songs, sessions, uploads, references)
  - Backend server start in background
  - Cleanup function with signal handlers (SIGINT, SIGTERM)

- **`upload_demo_tracks.sh`**: Script for uploading demo tracks (170 lines)
  - Iterates through demo_tracks directory
  - Maps folder names to formatted song titles (14 predefined songs)
  - Finds video (.mp4) and audio (.mp3/.wav) files
  - Interactive prompts for each upload (y/n/s/q)
  - Uploads via curl to /songs/upload endpoint
  - Displays upload summary (success, failed, skipped counts)
  - API availability check before starting

### Backend Layer (`/backend/`)

- **`server.js`**: Main Express application (922 lines)
  - Multer configuration for video/audio uploads (500MB limit per file)
  - UUID-based song directory creation with standardized file naming (preserves original extensions)
  - SQLite database initialization and schema creation (songs, sessions, leaderboard tables)
  - REST API endpoints for song management, sessions, leaderboard
  - HTTP range support for video/audio streaming (206 Partial Content responses)
  - Child process management for Python preprocessing (spawns `preprocess_full.py`)
  - Python executable detection (venv first, then system python3 fallback)
  - In-memory preprocessing queue with progress tracking and cleanup (1-hour retention)
  - CORS configuration for development (allows all origins)
  - Static file serving for built frontend from `frontend/dist`
  - Filesystem scanning fallback for `/library` endpoint (finds songs even if DB incomplete)
  - Song name derivation from request body or uploaded filenames (title case formatting)
  - Automatic cleanup of old preprocessing jobs (every 5 minutes)

- **`package.json`**: Backend dependencies
  - `express ^4.18.2`: Web framework
  - `multer ^1.4.5-lts.1`: File upload handling (multipart/form-data)
  - `sqlite3 ^5.1.6`: Database interface (callback-based API)
  - `uuid ^9.0.1`: Unique identifier generation (v4 UUIDs)
  - Scripts: `start` (node server.js), `dev` (node --watch server.js for auto-restart)

- **`karaoke.db`**: SQLite database with three tables:
  - `songs`: Track metadata, preprocessing status
  - `sessions`: Performance records with results
  - `leaderboard`: Player scores and rankings

- **`uploads/`**: Temporary storage for multipart file uploads (created by Multer)
- **`server.log`**: Application logs (if logging to file is enabled)

### Frontend Layer (`/frontend/`)

#### Core Application Files

- **`src/App.jsx`**: Main application component (185 lines)
  - Screen state management (library → mic-check → karaoke → results)
  - Session lifecycle handling (creates session via `/sessions/start` endpoint)
  - API integration for backend communication (API_BASE = 'http://localhost:8080')
  - Player name and session ID tracking
  - Results submission to leaderboard (optional, requires player name)
  - Video time tracking and session active state management
  - Error handling for session creation and result submission
  - Navigation controls (song library, leaderboard buttons in footer)

- **`src/main.jsx`**: React application entry point (17 lines)
  - Imports: React, ReactDOM, App component, retro.css
  - Loading screen management: Hides `.loading-screen` element on mount
  - ReactDOM.createRoot: React 18 concurrent mode
  - React.StrictMode: Enabled for development warnings and double-rendering checks
  - Mounts to `#root` div in index.html

#### Component Architecture (`/frontend/src/components/`)

- **`VideoKaraokePlayer.jsx`**: Video playback engine (461 lines)
  - `requestVideoFrameCallback` for frame-accurate timing (fallback to `timeupdate` event)
  - HTTP range request support for large video files (206 Partial Content responses)
  - Volume control (0-1 range) and playback state management
  - Optional reference vocals playback with sync offset adjustment (-3s to +3s via slider)
  - Session start/stop integration with auto-play on session start
  - Video offset adjustment for sync correction (adjusts effective time sent to LiveHUD)
  - Progress bar with seek functionality (click to jump to time)
  - Vocals enable/disable toggle (plays separated vocals.wav alongside karaoke video)
  - Drift correction for vocals sync (checks every ~5 frames, corrects if >0.1s drift)
  - Cleanup on unmount (cancels frame callbacks, stops audio)

- **`LiveHUD.jsx`**: Real-time scoring interface (1354 lines)
  - AudioWorklet integration for pitch processing via `pitch-processor.js`
  - Continuous mathematical scoring (exponential decay, sigmoid functions, no step functions)
  - Visual feedback: note lane with piano roll style, cents error bar, combo counter, beat LEDs
  - Performance tracking with 10,000 sample limit to prevent memory bloat
  - 30% pitch / 70% energy scoring algorithm (user-relative energy normalization)
  - Key-shift detection and forgiveness (±100-200 cents tolerance, tanh-based application)
  - Temporal smoothing with median filtering (10-sample buffer for cents error)
  - Canvas-based HUD rendering at 60 FPS with throttling
  - Combo system with cooldown (95% threshold to maintain, 60% break threshold, 5+ display minimum)
  - Badge calculation (Smooth Operator: 95%+ pitch, Mic Melter: 90%+ energy, Combo King: 50+ max combo)
  - Session completion handling with results aggregation (totals, phrase breakdown, badges)

- **`SongLibrary.jsx`**: Song browser interface (135 lines)
  - Library browsing with metadata display (duration, tempo, key, phrases count)
  - Song selection and detailed loading via `/library/:id` endpoint
  - Fetches from `/library` endpoint which scans both database and filesystem
  - No upload form (upload functionality removed - songs added via backend or demo script)
  - Displays songs with "READY" status badge
  - Refresh button to reload library
  - Song cards with "SING" button for quick selection
  - Selected song details panel showing comprehensive metadata

- **`MicCheck.jsx`**: Audio setup and testing (217 lines)
  - Microphone access and permission handling with browser constraints (echoCancellation, noiseSuppression, autoGainControl)
  - Audio level monitoring using AnalyserNode (FFT and time-domain RMS combined)
  - Real-time audio level visualization with color-coded feedback (red/yellow/green/pink)
  - Audio level text feedback (TOO QUIET/GETTING THERE/PERFECT/TOO LOUD)
  - AudioContext state management (handles suspended state with auto-resume)
  - Start/stop listening controls
  - Proceed button disabled until microphone tested (audioLevel > 0.02)

- **`ResultsScreen.jsx`**: Performance analysis display (332 lines)
  - Score breakdown and grading (S+, S, A+, A, B+, B, C+, C, D, F with color coding)
  - Badge system display (Combo King 👑, Mic Melter 🔥, Smooth Operator 🎵, On-Beat Bandit 🥁)
  - Leaderboard submission with player name input
  - Pitch timeline and energy graph visualization (SVG-based with responsive scaling)
  - Phrase breakdown display (phrase-level scores with color coding)
  - Post-run DTW refinement trigger (optional, not prominently featured in UI)
  - Toggle between results view and leaderboard view
  - Memoized score calculations for performance (useCallback, useMemo)
  - Statistics display (total samples, max combo, average accuracy)

- **`Leaderboard.jsx`**: Score ranking display (151 lines)
  - Local high score listing (top 20 by default, configurable via query param)
  - Player name, score breakdown (pitch/energy), and timestamp display
  - Badge visualization (emoji icons: 👑🔥🎵)
  - Rank icons (🥇🥈🥉 for top 3, #N for others)
  - Statistics display (total players, highest score, average score with memoization)
  - Color-coded scores (green ≥90, yellow ≥80, orange ≥70, red <70)
  - Action buttons (back to results, new song, refresh)
  - Empty state with prompt to start singing
  - Memoized callbacks for performance optimization

#### Styling (`/frontend/src/styles/`)

- **`retro.css`**: Primary UI styling with neon/arcade theme
- **`video-karaoke.css`**: Video player and HUD-specific styles

#### Build Configuration

- **`vite.config.js`**: Vite build configuration (35 lines)
  - React plugin integration (`@vitejs/plugin-react`)
  - Server configuration:
    - Port: 3000
    - Host: 0.0.0.0 (allows connections from outside container)
    - Proxy: `/api` → `process.env.VITE_PROXY_TARGET || 'http://backend:8080'`
      - Rewrites `/api` prefix
      - changeOrigin: true
  - Build configuration:
    - outDir: `dist`
    - assetsDir: `assets`
    - Manual chunking: vendor bundle for React, react-dom
  - Optimization:
    - optimizeDeps.include: ['react', 'react-dom']
  - Public directory: `public` (for AudioWorklet workers)

- **`package.json`**: Frontend dependencies (29 lines)
  - `react ^18.2.0`: UI framework (functional components with hooks)
  - `react-dom ^18.2.0`: DOM rendering (React 18 createRoot API)
  - Dev dependencies:
    - `@types/react ^18.2.15`: TypeScript type definitions
    - `@types/react-dom ^18.2.7`: TypeScript type definitions
    - `@vitejs/plugin-react ^4.0.3`: React plugin for Vite (JSX transformation)
    - `vite ^4.4.5`: Build tool and dev server (HMR, ES modules)
  - Scripts:
    - `dev`: Starts Vite dev server (port 3000)
    - `build`: Production build to `dist/`
    - `preview`: Preview production build locally

#### Audio Processing Workers

- **`public/workers/pitch-processor.js`**: AudioWorklet processor (190 lines)
  - Real-time pitch detection using YIN algorithm (autocorrelation-based, 80-1000 Hz range)
  - Energy calculation (RMS) with exponential smoothing (0.3 alpha)
  - Spectral centroid estimation via zero-crossing rate (FFT-free approximation)
  - Frame-rate throttling (sends every 4 frames ≈ 20ms at 48kHz)
  - Parabolic interpolation for sub-sample pitch accuracy
  - Buffer size: 2048 samples for pitch detection
  - YIN threshold: 0.15 for pitch confidence

#### Built Assets (`/frontend/dist/`)

- **`index.html`**: Production HTML entry point (generated by Vite build)
- **`assets/`**: Compiled JavaScript and CSS bundles
  - Vendor bundle (React, react-dom) with content hash
  - Main application bundle with content hash
  - CSS bundle with content hash
- **`workers/`**: Compiled audio worklet processors
  - `pitch-processor.js` (copied from public/)

#### HTML Entry Point (`/frontend/index.html`)

- **`index.html`**: Development HTML template (77 lines)
  - Meta tags: charset UTF-8, viewport for responsive design
  - Title: "🎤 PitchPerfectly 🎤"
  - Google Fonts: Press Start 2P (retro arcade font)
  - Inline styles for loading screen (spinner, neon green text)
  - Loading screen with spinner and "LOADING KARAOKE ARCADE..." text
  - Root div: `#root` (React mount point)
  - Script: `/src/main.jsx` (Vite dev server entry point)

### Python Processing Layer (`/python/`)

- **`separate.py`**: Vocal separation engine (249 lines)
  - Demucs v4 model loading and inference (htdemucs_ft model, fallback to htdemucs)
  - Apple Silicon MPS optimization with device auto-detection (check_mps_availability function)
  - Multi-device support (MPS > CUDA > CPU fallback via get_device function)
  - Audio format handling and conversion (loads with soundfile, resamples to Demucs native rate)
  - Stereo conversion (mono inputs duplicated to stereo for Demucs)
  - Chunked processing with overlap (split=True, overlap=0.25 for long tracks)
  - Source extraction (vocals, accompaniment from 4-source separation)
  - Accompaniment computed as sum of all non-vocal sources (drums, bass, other)
  - Output normalization to prevent clipping (max absolute value scaling)
  - Command-line interface with --check-mps flag for MPS availability testing

- **`preprocess_full.py`**: Comprehensive preprocessing pipeline (887 lines)
  - Audio extraction from video files using `av` library (FFmpeg bindings, resamples to 48kHz mono)
  - Vocal separation integration via `separate.py` module (calls separate_with_demucs)
  - Simplified DTW alignment (linear interpolation for similar-length tracks <10% diff, downsampled DTW for different lengths)
  - Chroma feature extraction (12-dimensional pitch class profiles via librosa chroma_cqt)
  - Pitch contour extraction with torch-crepe (chunked processing, 30s chunks, full model, 20ms step size)
  - Pitch smoothing (median filter + Savitzky-Golay filter for noise reduction)
  - Note binning and phrase segmentation (onset detection, minimum 2s phrase length, 40 cents tolerance)
  - Beat and downbeat detection (librosa beat tracking, every 4th beat = downbeat)
  - Loudness profile calculation (RMS to dB conversion, Savitzky-Golay smoothing)
  - Key detection (Krumhansl-Schmuckler key profiles via librosa key_to_degrees)
  - Reference data JSON generation (version 2.0 schema with all metadata)
  - Piecewise linear alignment segment fitting (200-frame windows, 50% overlap, R² quality scoring)
  - Command-line interface with argparse (song-id, karaoke-video, original-audio, output-dir, device)

- **`refine_results.py`**: Post-performance analysis (290 lines)
  - Phrase-local DTW alignment (per-phrase independent alignment using dtaidistance)
  - Improved accuracy calculation (median cents error, percentage within 50 cents tolerance)
  - Performance data refinement with timing offset analysis
  - Pitch chart generation (interpolated overlay of reference vs performance)
  - Overall metrics aggregation from phrase-level results
  - Filters unvoiced regions (f0 == 0) before DTW computation
  - Normalized DTW cost calculation (distance / max sequence length)
  - Command-line interface (--reference, --performance, --output)
  - Returns refined JSON with per-phrase metrics and overall statistics

- **`requirements.txt`**: Python dependencies (24 lines)
  - `numpy>=1.21.0`: Numerical computing foundation
  - `torch>=2.0.0`: PyTorch with MPS support (Apple Silicon) and CUDA support
  - `torchaudio>=2.0.0`: Audio processing for PyTorch
  - `demucs>=4.0.0`: Vocal separation (htdemucs_ft model)
  - `torchcrepe>=0.0.19`: Pitch extraction (CREPE full model)
  - `crepe>=0.0.12`: Fallback pitch extraction
  - `dtaidistance>=2.3.10`: Fast DTW implementation with Sakoe-Chiba band
  - `librosa>=0.10.0`: Audio analysis (chroma, beat tracking, key detection)
  - `soundfile>=0.12.0`: Audio I/O (WAV/MP3 reading/writing)
  - `scipy>=1.9.0`: Scientific computing (signal filtering, interpolation)
  - `matplotlib>=3.5.0`: Plotting (optional, for debugging)
  - `scikit-learn>=1.1.0`: Machine learning utilities
  - `av>=10.0.0`: Video processing (FFmpeg Python bindings)
  - `tqdm>=4.65.0`: Progress bars for long operations

### Data Storage Structure

#### Songs Directory (`/songs/<uuid>/`)

Each processed song creates a directory with:

- **`karaoke.mp4`** (or `.webm`): Original karaoke video (preserves original extension)
- **`original_audio.wav`** (or `.mp3`): Studio reference audio (preserves original extension)
- **`karaoke_audio.wav`**: Extracted karaoke audio track (mono, 48kHz, from video)
- **`vocals.wav`**: Separated vocal track from original (mono, from Demucs separation)
- **`accompaniment.wav`**: Separated instrumental track (sum of all non-vocal sources)
- **`reference.json`**: Comprehensive scoring reference data (version 2.0 schema)

#### Sessions Directory (`/sessions/<uuid>/`)

Performance data storage:

- **`performance.json`**: Raw performance data
- **`refined.json`**: Post-processed results with DTW refinement

#### Reference Data Schema (`/schemas/reference.schema.json`)

JSON schema defining reference data structure (252 lines):

- Version 2.0 format specification (enum: ["2.0"])
- Required fields: version, song_id, fps, duration, beats_k, phrases_k, warp_T, f0_ref_on_k, note_bins, key
- Optional fields: sample_rate, hop_length, downbeats_k, tempo, loudness_profile
- DTW alignment mapping (`warp_T` object with tk, tref, quality, segments arrays)
- Pitch contour data (`f0_ref_on_k` array with t_k, f0, conf objects)
- Note bins for discrete scoring (t_k_start, t_k_end, f0_median, note_name)
- Beat and phrase timing information (beats_k, downbeats_k, phrases_k arrays)
- Configuration parameters (fps: 1-100, tempo: 20-300 BPM)
- Segments array for piecewise linear alignment (tk_start, tk_end, a, b, quality)
- Loudness profile array (t_k, loudness_db)

### Demo Content

#### Demo Tracks (`/demo_tracks/`)

Sample content organized by song directories (15 songs total):

- **`CallMeMaybe/`**: Carly Rae Jepsen - Call Me Maybe
  - `callmemaybe.mp4` (karaoke video)
  - `Carly Rae Jepsen - Call Me Maybe (Lyrics).mp3` (original audio)

- **`CountryRoads/`**: John Denver - Take Me Home, Country Roads
  - `Countryroads.mp4` (karaoke video)
  - `John Denver - Take Me Home.mp3` (original audio)

- **`DancingQueen/`**: ABBA - Dancing Queen
  - `DancingQueen.mp4` (karaoke video)
  - `ABBA - Dancing Queen (Official Lyric Video).mp3` (original audio)

- **`Diamonds/`**: Rihanna - Diamonds
  - `Diamonds.mp4` (karaoke video)
  - `Rihanna - Diamonds.mp3` (original audio)

- **`Dynamite/`**: Taio Cruz - Dynamite
  - `Dynamite.mp4` (karaoke video)
  - `Taio Cruz - Dynamite (Lyrics).mp3` (original audio)

- **`ImagineDragons/`**: Imagine Dragons - Radioactive
  - `imaginedragons.mp4` (karaoke video)
  - `Imagine Dragons - Radioactive (Lyrics).mp3` (original audio)

- **`LastChristmas/`**: Wham! - Last Christmas
  - `whamkaraoke.mp4` (karaoke video)
  - `whamkaraoke.mp3` (original audio)

- **`LetItGo/`**: Frozen - Let It Go
  - `LetItGo.mp4` (karaoke video)
  - `Let It Go - Frozen lyrics (FULL SONG).mp3` (original audio)

- **`MovesLikeJagger/`**: Maroon 5 ft. Christina Aguilera - Moves Like Jagger
  - `moveslikejagger.mp4` (karaoke video)
  - `Moves Like Jagger - Maroon 5 (Feat. Christina Aguilera) (Lyrics) 🎵.mp3` (original audio)

- **`OnlyGirl/`**: Rihanna - Only Girl (In The World)
  - `Only Girl (In the World) - Rihanna   Karaoke Version   KaraFun - 01.mp4` (karaoke video)
  - `Rihanna - Only Girl (In The World) (Lyrics) (1).wav` (original audio)

- **`Perfect/`**: Ed Sheeran - Perfect
  - `perfect.mp4` (karaoke video)
  - `Ed Sheeran - Perfect (Lyrics).mp3` (original audio)

- **`PokerFace/`**: Lady Gaga - Poker Face
  - `pokerface.mp4` (karaoke video)
  - `Lady Gaga - Poker Face (Lyrics).mp3` (original audio)

- **`SomeoneLikeYou/`**: Adele - Someone Like You
  - `Someone Like You - Adele | Karaoke Version | KaraFun.mp4` (karaoke video)
  - `Adele - Someone Like You Official Music Video.mp3` (original audio)

- **`TikTok/`**: Kesha - TiK ToK
  - `tiktok.mp4` (karaoke video)
  - `Kesha - TiK ToK (Lyrics).mp3` (original audio)

- **`WeWillRockYou/`**: Queen - We Will Rock You
  - `wewillrockyou.mp4` (karaoke video)
  - `Queen - We Will Rock You [Lyrics] (1).mp3` (original audio)

**Note**: Demo tracks directory is ignored by .gitignore and not included in repository

#### Assets (`/assets/badges/`)

SVG badge graphics (4 files):

- **`combo_king.svg`**: Longest accuracy streak badge (50+ max combo)
- **`mic_melter.svg`**: High energy performance badge (90%+ energy matching)
- **`on_beat_bandit.svg`**: Perfect rhythm accuracy badge (future feature, not currently awarded)
- **`smooth_operator.svg`**: Perfect pitch accuracy badge (95%+ pitch accuracy)

**Note**: Badges are displayed as emoji icons in UI (👑🔥🥁🎵) rather than SVG files

## Data Flow + System Behavior

### Song Upload and Preprocessing Flow

1. **Upload Initiation**: User uploads via backend API or `upload_demo_tracks.sh` script
2. **Backend Reception**: Express server receives multipart upload via Multer (500MB limit)
3. **UUID Generation**: Backend generates UUID for song directory
4. **File Storage**: Files saved to `/songs/<uuid>/` directory with standardized names
   - `karaoke.mp4` (or `.webm`) - preserves original extension
   - `original_audio.mp3` (or `.wav`) - preserves original extension
5. **Database Insert**: Song record created in SQLite with "pending" status
6. **Python Invocation**: Backend spawns `preprocess_full.py` child process
   - Finds Python executable (venv first, then system python3)
   - Passes arguments: song-id, karaoke-video, original-audio, output-dir, device
7. **Audio Extraction**: PyAV extracts audio from karaoke video (48kHz mono)
   - Saves to `karaoke_audio.wav`
8. **Vocal Separation**: Demucs v4 separates vocals from original audio
   - Model: htdemucs_ft (fallback to htdemucs)
   - Device: auto-detect (MPS > CUDA > CPU)
   - Outputs: `vocals.wav`, `accompaniment.wav`
9. **DTW Alignment**: Chroma feature alignment between karaoke and reference
   - Simplified strategy: linear interpolation if similar length, downsampled DTW if different
   - Piecewise linear fitting: 200-frame windows with 50% overlap
   - Quality scoring: R² correlation for each segment
10. **Pitch Extraction**: torch-crepe generates F0 contour from separated vocals
    - Model: full (highest quality)
    - Step size: 20ms
    - Chunked processing: 30s chunks to manage memory
    - Confidence threshold: 0.3
11. **Beat Detection**: librosa beat tracking on karaoke audio
    - Downbeats: every 4th beat
    - Tempo estimation in BPM
12. **Key Detection**: Krumhansl-Schmuckler key profiles
13. **Phrase Segmentation**: Onset detection with minimum 2s phrase length
14. **Reference Generation**: Comprehensive JSON reference data created (version 2.0)
    - Warped pitch contour on karaoke timeline
    - Note bins for discrete scoring
    - Beat and phrase timing
    - Loudness profile
    - Metadata (duration, tempo, key)
15. **Status Update**: Database updated to "complete" with metadata (duration, tempo, key)
16. **Frontend Polling**: UI polls `/songs/:id/status` for completion (optional, library auto-refreshes)

### Real-time Performance Flow

1. **Song Selection**: User selects song from library, loads detailed song data via `/library/:id`
2. **Mic Check Screen**: User grants microphone access and tests audio levels
   - Microphone constraints: echoCancellation, noiseSuppression, autoGainControl enabled
   - Audio level monitoring with color-coded feedback (red/yellow/green/pink)
   - Proceed button enabled when audio level > 0.02
3. **Session Initialization**: Backend creates session record via `/sessions/start`, returns session ID
4. **Audio Setup**: Frontend initializes AudioContext and loads AudioWorklet
   - AudioContext sample rate: typically 48kHz
   - AudioWorklet: `pitch-processor.js` loaded from `/workers/`
5. **Video Playback**: `VideoKaraokePlayer` starts karaoke video with frame callbacks
   - `requestVideoFrameCallback` for frame-accurate timing (fallback to `timeupdate`)
   - HTTP range requests for efficient video streaming
   - Optional reference vocals playback with sync offset adjustment
6. **Audio Processing**: Continuous microphone input processed in AudioWorklet for:
   - YIN pitch detection (80-1000 Hz range, 2048-sample buffer, 0.15 threshold)
   - Energy calculation (RMS with 0.3 exponential smoothing)
   - Spectral centroid estimation (zero-crossing rate approximation)
   - Frame throttling: sends every 4 frames (~20ms at 48kHz)
   - Browser-level echo cancellation (via getUserMedia constraints)
7. **Scoring Engine**: `LiveHUD` compares real-time data against reference:
   - **Pitch accuracy (30% weight)**: Continuous exponential decay scoring
     - Formula: `floor + (1-floor) * exp(-|cents_error| / decay_rate)`
     - Decay rate: 220 cents (controls forgiveness)
     - Floor: 15% (minimum score)
     - ±50 cents = 95-100% (perfect range)
     - ±100 cents = 80-95% (good range)
     - ±200 cents = 40-80% (acceptable range)
     - >±200 cents = exponential decay to 15% floor
   - **Key-shift forgiveness**: Detects sustained offset and applies correction
     - Tracks median offset over 20 samples
     - Applies tanh-based correction (±100-200 cents tolerance)
   - **Energy matching (70% weight)**: User-relative logarithmic normalization
     - Tracks min/max energy seen during session (not absolute reference)
     - Normalizes on log10 scale: `(logEnergy - logMin) / (logMax - logMin)`
     - Smooth tanh clamping to prevent extremes
     - Quiet boost: sigmoid for very quiet singing
     - 10% minimum floor even for silent sections
   - **Combo tracking**: 5+ consecutive accurate samples
     - Maintain threshold: 95% total score
     - Break threshold: <60% total score
     - Display minimum: 5+ combo
     - Cooldown after break to prevent immediate restart
8. **Visual Feedback**: Real-time HUD updates (Canvas rendering at 60 FPS):
   - Note lane with pitch visualization (piano roll style)
   - Cents error bar showing accuracy (±50 cents range)
   - Beat LEDs synchronized to tempo (8 LEDs, downbeats highlighted)
   - Combo counter (bold yellow text when active)
   - Score displays (pitch, energy, total percentages)
   - Reference pitch line overlay
9. **Performance Recording**: All samples stored in `performanceData` ref
   - Limited to 10,000 samples to prevent memory bloat
   - Stores: time, detected_f0, reference_f0, cents_error, pitch_score, energy, energy_score, total_score
   - Combo tracking: consecutive accurate samples, max combo
10. **Session Completion**: Results calculated and sent to backend
    - Overall totals: pitch, energy, total scores
    - Phrase breakdown: per-phrase scores (10-second segments)
    - Badge calculation: Smooth Operator, Mic Melter, Combo King
    - POST to `/sessions/:id/finish` with results
11. **Leaderboard Submission**: Optional player name submission for rankings
    - POST to `/leaderboard/submit` with session_id, player_name, scores, badges

### Post-Performance Refinement (Optional)

1. **Refinement Trigger**: User clicks "REFINE RESULTS" in `ResultsScreen` (optional, not prominently featured)
2. **Session Directory Creation**: Backend creates `/sessions/<session_id>/` directory
3. **Performance Data Save**: Backend writes `performance.json` from session results
4. **Python Invocation**: Backend spawns `refine_results.py` process
   - Arguments: --reference, --performance, --output
   - Finds Python executable (venv first, then system python3)
5. **Phrase-level DTW**: More accurate alignment per musical phrase
   - Independent DTW for each phrase
   - Filters unvoiced regions (f0 == 0)
   - Normalized DTW cost calculation
6. **Improved Scoring**: Recalculated accuracy with better temporal alignment
   - Median cents error per phrase
   - Percentage within 50 cents tolerance
   - Timing offset analysis
7. **Results Update**: Refined data stored alongside original performance
   - Saves `refined.json` to sessions directory
   - Updates database `refined_results` column
   - Returns refined data to frontend

## API Routes & External Interfaces

### Song Management

- **`POST /songs/upload`**: Multipart upload of karaoke video + original audio
  - Input: `multipart/form-data` with fields:
    - `song_name` (optional string) - derived from filename if not provided
    - `karaoke_video` (file, MP4/WebM, max 500MB)
    - `original_audio` (file, MP3/WAV, max 500MB)
  - Output: `{song_id, message, status: "processing"}`
  - Side Effects:
    - UUID generation for song directory
    - File storage to `/songs/<uuid>/` with standardized names
    - Database insert with "pending" status
    - Python preprocessing spawn in background
    - In-memory queue tracking with progress updates

- **`GET /songs/:id/status`**: Check preprocessing progress
  - Output: `{status, progress, error?, processing_time?}`
  - Status values: "pending", "processing", "complete", "error"
  - Progress: 0.0 to 1.0 (parsed from Python stdout)
  - Processing time: seconds since preprocessing started (if in queue)

- **`GET /library`**: List ready songs for performance (simplified metadata)
  - Output: Array of song metadata (id, name, duration, tempo, key, uploaded_at, karaoke_video, reference_vocals URLs)
  - Scans both database (preprocessing_status = 'complete') and filesystem
  - Only returns songs with existing `reference.json` and `karaoke.mp4` files
  - Validates assets before including in list
  - Excludes `reference_data` from list (too large for overview)
- **`GET /library/:id`**: Get detailed song data including reference
  - Output: Complete song object with full `reference_data` for scoring
  - Falls back to filesystem if database record missing
  - Validates required assets (reference.json, karaoke.mp4)
  - Returns 404 if song not found or incomplete

### Media Streaming

- **`GET /video/:song_id/:filename`**: Video streaming with HTTP range support
  - Headers: Range request handling for efficient playback (206 Partial Content)
  - MIME type: `video/mp4` (hardcoded, should detect from extension)
  - Supports partial content requests for seeking
  - Streams from `/songs/<song_id>/<filename>`

- **`GET /audio/:song_id/:filename`**: Audio file streaming with HTTP range support
  - Headers: Range request handling (206 Partial Content)
  - MIME type: `audio/wav` or `audio/mpeg` based on extension
  - Used for reference vocals playback (`vocals.wav`)
  - Streams from `/songs/<song_id>/<filename>`

### Session Management

- **`POST /sessions/start`**: Create new performance session
  - Input: `{song_id}` (required)
  - Output: `{session_id}` (UUID v4)
  - Side Effects: Database session record creation with current timestamp
  - Error handling: Returns 400 if song_id missing, 500 if database error

- **`POST /sessions/:id/finish`**: Save performance results
  - Input: Complete performance data object (totals, phrase_breakdown, badges, performance_data)
  - Output: `{ok: true}`
  - Side Effects:
    - Updates `finished_at` timestamp
    - Stores results as JSON string in `results` column
    - Returns 500 if database error

- **`POST /sessions/:id/refine`**: Trigger post-run DTW refinement (optional)
  - Input: None (uses session_id from URL)
  - Output: `{ok: true, refined: <refined_data>}`
  - Side Effects:
    - Creates `/sessions/<session_id>/` directory
    - Saves `performance.json` from session results
    - Spawns Python process: `refine_results.py --reference <ref> --performance <perf> --output <out>`
    - Waits for Python process completion
    - Saves `refined.json` to sessions directory
    - Updates database `refined_results` column with refined JSON
  - Error handling: Returns 404 if session not found, 500 if refinement fails

- **`GET /sessions/:id/results`**: Retrieve session results
  - Output: `{results, refined?}` with performance data

### Leaderboard

- **`POST /leaderboard/submit`**: Submit score to leaderboard
  - Input: `{session_id, player_name, scores: {total, pitch, rhythm?, energy}, badges: [{name}]}`
  - Output: `{ok: true, rank: <lastID>}`
  - Side Effects:
    - Inserts row into leaderboard table
    - Stores scores as individual columns (total_score, pitch_score, rhythm_score, energy_score)
    - Stores badges as JSON string
    - Returns lastID (auto-increment primary key)
  - Note: rhythm_score defaults to 0 if not provided (rhythm scoring removed)

- **`GET /leaderboard`**: Get high scores
  - Query params: `limit` (default: 10, no enforced max in code but README says 20)
  - Output: Array of leaderboard entries with:
    - All leaderboard columns (id, session_id, player_name, scores, badges, played_at)
    - song_id from sessions table
    - song_name from songs table
    - badges parsed from JSON string to array
  - Joins: `leaderboard` ← `sessions` ← `songs`
  - Ordering: `total_score DESC` (highest scores first)

## Key Components / Classes / Functions

### Frontend Components

#### VideoKaraokePlayer
- **Purpose**: Frame-accurate video playback with session management
- **Dependencies**: React hooks, browser Video API
- **Key Methods**:
  - `updateVideoTime()`: `requestVideoFrameCallback` handler
  - `handlePlayPause()`: Playback state management
  - `handleVolumeChange()`: Audio level control
- **Side Effects**: Time updates to parent components, session lifecycle events

#### LiveHUD
- **Purpose**: Real-time scoring engine and visual feedback
- **Dependencies**: AudioContext, AudioWorklet, Canvas API
- **Key State**:
  - `currentScore`: Live score tracking
  - `liveMetrics`: Real-time audio analysis data
  - `performanceData`: Historical sample storage
- **Algorithms**:
  - Pitch accuracy: Cents-based error calculation with key-shift forgiveness
  - Energy matching: LUFS-based loudness comparison
  - Combo tracking: Consecutive accuracy streak detection
- **Side Effects**: Microphone access, AudioWorklet messaging, performance data storage

#### SongLibrary
- **Purpose**: Song browsing and upload interface
- **Dependencies**: Fetch API for backend communication
- **Key Methods**:
  - `loadLibrary()`: Fetch available songs
  - `handleSongSelect()`: Load detailed song data
- **Side Effects**: API calls, state updates to parent App component

### Backend Core Functions

#### Multer Configuration
- **Purpose**: Handle large video/audio file uploads
- **Key Features**:
  - 500MB file size limit
  - UUID-based directory creation
  - File type validation (video/audio MIME types + extensions)
  - Standardized filename mapping

#### Database Schema Management
- **Tables**:
  - `songs`: Metadata and preprocessing status
  - `sessions`: Performance records with JSON results
  - `leaderboard`: Player rankings and scores
- **Relationships**: Foreign key constraints between sessions/songs/leaderboard

#### Python Process Management
- **Purpose**: Spawn and monitor preprocessing tasks
- **Implementation**: Node.js `child_process.spawn()`
- **Progress Tracking**: In-memory queue with status updates
- **Error Handling**: stderr capture and database error logging

### Python Processing Classes

#### PreprocessorConfig
- **Purpose**: Centralized configuration for audio processing
- **Key Parameters**:
  - `SAMPLE_RATE = 48000`: Low-latency audio processing (48kHz)
  - `HOP_LENGTH = 1024`: ~21ms frame size at 48kHz
  - `CREPE_MODEL = 'full'`: High-quality pitch tracking (largest model)
  - `CREPE_STEP_SIZE = 20`: 20ms step size for real-time compatibility
  - `DTW_BAND_WIDTH = 0.1`: Sakoe-Chiba band width (10% of sequence)
  - `DTW_WINDOW = 200`: Window size for piecewise linear fitting
  - `NOTE_TOLERANCE_CENTS = 40`: Tolerance for note binning
  - `MIN_NOTE_DURATION = 0.2`: Minimum note duration in seconds
  - `PITCH_CONF_THRESHOLD = 0.3`: Minimum pitch confidence
  - `REF_FPS = 50`: Reference data frame rate (50 Hz = 20ms resolution)

#### Vocal Separation Pipeline
- **Models**: Demucs v4 "htdemucs_ft" for state-of-the-art separation
- **Device Optimization**: MPS (Apple Silicon) > CUDA > CPU fallback
- **Output**: Clean vocal and accompaniment tracks

#### DTW Alignment Engine
- **Purpose**: Handle tempo variations and sync drift between karaoke/reference
- **Implementation**: Chroma feature-based alignment with quality scoring
- **Output**: Piecewise linear warping function for timeline mapping

### Audio Processing (AudioWorklet)

#### PitchProcessor Class
- **Purpose**: Real-time audio analysis for pitch and energy detection
- **Key Algorithms**:
  - **YIN Pitch Detection**: Autocorrelation-based F0 estimation
  - **Energy Analysis**: RMS and spectral centroid calculation
- **Performance**: 4-frame throttling (~20ms updates) for efficiency
- **Parameters**:
  - Buffer size: 2048 samples
  - Frequency range: 80-1000 Hz
  - YIN threshold: 0.15

## Libraries & Dependencies

### Frontend Stack

#### React Ecosystem
- **`react ^18.2.0`**: Core UI framework with hooks and functional components
- **`react-dom ^18.2.0`**: DOM rendering and event handling
- **Usage**: Component-based architecture, state management, lifecycle handling

#### Build Tools
- **`vite ^4.4.5`**: Modern build tool with HMR and ES modules
- **`@vitejs/plugin-react ^4.0.3`**: JSX transformation and React optimization
- **Usage**: Development server, production bundling, proxy configuration

#### Machine Learning
- **`@tensorflow/tfjs ^4.10.0`**: Browser-based ML for motion tracking
- **Usage**: Optional pose detection for bonus scoring (not actively implemented)

### Backend Stack

#### Web Framework
- **`express ^4.18.2`**: Minimal web application framework
- **Usage**: REST API routing, middleware, static file serving

#### File Handling
- **`multer ^1.4.5-lts.1`**: Multipart form data parsing for file uploads
- **Usage**: Video/audio upload processing, disk storage management

#### Database
- **`sqlite3 ^5.1.6`**: Embedded SQL database
- **Usage**: Song metadata, session records, leaderboard storage

#### Utilities
- **`uuid ^9.0.1`**: RFC4122 UUID generation
- **Usage**: Unique identifiers for songs and sessions

### Python Audio Processing

#### Deep Learning
- **`torch >=2.0.0`**: PyTorch with Apple Silicon MPS support
- **`torchcrepe >=0.0.19`**: CREPE pitch tracking with GPU acceleration
- **`demucs >=4.0.0`**: State-of-the-art vocal separation

#### Audio Analysis
- **`librosa >=0.10.0`**: Music information retrieval
  - Chroma feature extraction for alignment
  - Beat tracking and tempo estimation
  - Audio loading and resampling
- **`soundfile >=0.12.0`**: Audio I/O with multiple format support

#### Signal Processing
- **`scipy >=1.9.0`**: Scientific computing
  - Signal filtering and interpolation
  - Statistical analysis
- **`numpy >=1.21.0`**: Numerical computing foundation

#### Alignment
- **`dtaidistance >=2.3.10`**: Fast DTW implementation
- **Usage**: Temporal alignment between karaoke and reference audio

#### Utilities
- **`av >=10.0.0`**: FFmpeg Python bindings for video processing
- **`tqdm >=4.65.0`**: Progress bars for long-running operations

## Core Algorithms / Pipelines

### Vocal Separation Pipeline

1. **Audio Loading**: Load original studio track at 48kHz
2. **Model Initialization**: Load Demucs v4 "htdemucs_ft" model to MPS device
3. **Preprocessing**: Normalize audio, pad to required length
4. **Inference**: Feed through neural network for source separation
5. **Postprocessing**: Extract vocals and accompaniment stems
6. **Quality Control**: Validate separation quality via spectral analysis

### DTW Alignment Algorithm

1. **Feature Extraction**:
   - Compute chroma features for both karaoke and reference audio (librosa `chroma_cqt`)
   - 12-dimensional pitch class profiles with hop length 1024
   - Normalize each frame to unit length
2. **Simplified Alignment Strategy**:
   - If tracks are similar length (< 10% difference): Use linear interpolation (quality = 0.95)
   - If different length: Downsample chroma by 10x, compute DTW on mean chroma, upsample path
3. **DTW Computation**: Use `dtaidistance` library with Sakoe-Chiba band (10% of sequence length)
4. **Piecewise Linear Fitting**: Sliding window approach (200-frame windows, 50% overlap)
   - Fit linear segments: `t_ref = a * t_karaoke + b`
   - Calculate R² score per segment
   - Merge similar adjacent segments (similar slope/intercept, both quality > 0.8)
5. **Quality Assessment**: Overall quality = 0.85 (default) or calculated from alignment
6. **Runtime Lookup**: Find appropriate segment for each karaoke time, map to reference time

### Real-time Scoring Engine

#### Pitch Accuracy (30% weight)

1. **Frequency Extraction**: YIN algorithm on 2048-sample buffers (80-1000 Hz range)
2. **Confidence Filtering**: Smooth sigmoid-based confidence multiplier (0.2 minimum confidence threshold)
3. **Reference Lookup**: Find expected pitch at current time using DTW mapping (50 FPS reference data)
4. **Cents Calculation**: `1200 * log2(detected_f0 / reference_f0)` with safe division
5. **Temporal Smoothing**: Median filter on cents error buffer (10-sample window ≈ 200ms)
6. **Key-shift Detection**: Median offset calculation over 20 samples, tanh-based application
7. **Continuous Scoring**: Exponential decay formula: `floor + (1-floor) * exp(-error/decay_rate)`
   - Decay rate: 220 cents (controls forgiveness)
   - Floor: 15% minimum score
   - No step functions, fully continuous
8. **Detection Factor**: Smooth sigmoid transition for frequencies near 0 Hz

#### Energy Matching (70% weight)

1. **RMS Calculation**: Root mean square of audio samples (from AudioWorklet)
2. **User-Relative Normalization**: Tracks min/max energy seen during session (not absolute reference)
3. **Logarithmic Scaling**: Converts to log10 scale for perceptual accuracy
4. **Continuous Normalization**: `(logEnergy - logMin) / (logMax - logMin)` on log scale
5. **Smooth Clamping**: tanh-based saturation (maps to [-1, 1] then to [floor, 1])
6. **Quiet Boost**: Sigmoid boost for very quiet singing (ensures smooth floor transition)
7. **Floor Protection**: 10% minimum score even for silent sections
8. **Dynamic Range**: Adapts to user's actual energy range during performance

#### Combo System

1. **Accuracy Threshold**: Total frame score (weighted pitch + energy) must be ≥ 80% to maintain combo
2. **Break Threshold**: Score < 40% breaks combo streak
3. **Streak Tracking**: Count consecutive accurate samples in `performanceData.current.combos` array
4. **Combo Activation**: 5+ consecutive accurate samples triggers visual combo display
5. **Visual Feedback**: Combo counter displayed when > 5 (bold 48px font, yellow color)
6. **Max Combo Tracking**: Tracks longest streak for badge eligibility (50+ for Combo King badge)


### Post-Performance DTW Refinement

1. **Phrase Segmentation**: Split performance into musical phrases
2. **Local Alignment**: Run DTW on each phrase independently
3. **Accuracy Recalculation**: More precise pitch error measurement
4. **Timing Analysis**: Identify rushed or dragged sections
5. **Quality Metrics**: Per-phrase accuracy and timing scores
6. **Result Merging**: Combine phrase-level results into overall performance

## Runtime, Build, and Environment Details

### Development Workflow

#### Native Development
1. **Prerequisites**: Node.js 20+, Python 3.10+, ffmpeg
2. **Backend Setup**: `cd backend && npm install`
3. **Frontend Setup**: `cd frontend && npm install`
4. **Python Setup**: `cd python && python -m venv .venv && pip install -r requirements.txt`
5. **Startup**: `./start.sh` or manually start backend with `node server.js`

#### Docker Development
1. **Command**: `./docker-dev.sh` or `docker-compose -f docker-compose.dev.yml up`
2. **Features**:
   - Hot module replacement for frontend (Vite dev server on port 3000)
   - Auto-restart for backend (Node --watch on port 8080)
   - Source code mounted as volumes for live editing
   - Separate containers for frontend/backend
   - Named volumes for node_modules to avoid host conflicts
   - Environment variable `VITE_PROXY_TARGET=http://backend:8080` for Docker networking
3. **Container Cleanup**: Script stops existing containers and prunes networks before starting

### Build Process

#### Frontend Build
1. **Vite Build**: `npm run build` in frontend directory
2. **Output**: Static files in `frontend/dist/`
3. **Chunking**: Vendor libraries separated for caching
4. **Assets**: JS/CSS bundles with content hashing

#### Docker Production Build
1. **Multi-stage**: Build dependencies in first stage (python:3.11-slim), runtime in second
2. **Python Dependencies**: Pre-installed in base image (torch, demucs, librosa, etc.)
3. **Node.js Installation**: Via NodeSource repository (Node.js 20.x)
4. **Frontend Build**: Compiled during Docker build process (`npm run build`)
5. **Final Image**: Production-ready with minimal runtime dependencies
6. **Venv Compatibility**: Creates symlinked venv for Python script compatibility
7. **System Dependencies**: FFmpeg, libsndfile1, build tools in base stage only

### Environment Variables

#### Development
- **`NODE_ENV=development`**: Enables debug logging and error details
- **`VITE_PROXY_TARGET`**: Backend URL for Vite proxy (Docker networking)

#### Production
- **`DEVICE=cpu`**: Force CPU mode in Docker (no MPS available)
- **`PORT=8080`**: Server listening port
- **`NODE_ENV=production`**: Optimized runtime behavior

### Runtime Dependencies

#### System Requirements
- **macOS 12.3+**: For MPS (Metal Performance Shaders) acceleration
- **FFmpeg**: Video processing and audio extraction
- **Node.js 20+**: ES modules and modern JavaScript features
- **Python 3.10+**: Modern Python with type hints

#### Performance Characteristics
- **Preprocessing Time**: 90-180s for 3-minute song (varies by device)
  - Vocal separation: 45-90s on CPU, 15-30s on MPS
  - DTW alignment: ~5s (simplified approach)
  - Pitch extraction: ~8s (chunked torch-crepe)
- **Real-time Latency**: <10ms for pitch detection and scoring (AudioWorklet processing)
- **Memory Usage**: ~2GB during preprocessing (Demucs model loading), ~500MB during playback
- **Storage**: ~100-200MB per processed song (video + audio files + reference JSON)
- **Reference JSON Size**: 500KB-2MB depending on song length and pitch density

### Database Configuration

#### SQLite Settings
- **File Location**: `backend/karaoke.db`
- **Journal Mode**: Default (DELETE)
- **Synchronous**: Default (FULL)
- **Auto-vacuum**: Disabled (manual maintenance required)

#### Schema Evolution
- **Version 1**: Basic song and session tables
- **Version 2**: Added leaderboard table and refined results
- **Migration**: Handled via `CREATE TABLE IF NOT EXISTS`

## Bottlenecks, Inefficiencies, & Pain Points

### Performance Issues

#### Preprocessing Bottlenecks
- **Demucs Inference**: 45-90s for vocal separation on CPU, 15-30s on MPS
- **DTW Alignment**: O(n²) complexity can be slow for long songs
- **File I/O**: Large video files (100MB+) cause memory pressure during upload
- **Python Startup**: Cold start overhead for each preprocessing job

#### Real-time Processing Limitations
- **AudioWorklet Latency**: 20ms update rate may feel sluggish for fast passages
- **Canvas Rendering**: HUD visualization can cause frame drops on older hardware

#### Memory Inefficiencies
- **Video Loading**: Entire karaoke video loaded into memory for range requests
- **Reference Data**: Large JSON files (>1MB) for long songs with dense pitch data
- **Audio Buffers**: Multiple copies of audio data during processing pipeline

### Scaling Constraints

#### Single-User Architecture
- **No Concurrency**: One preprocessing job at a time
- **Local Storage**: No cloud backup or sync capabilities
- **Session Isolation**: No multi-user or collaborative features

#### Resource Limitations
- **CPU Bound**: Preprocessing limited by single-threaded Python operations
- **Disk I/O**: No optimization for SSD vs. HDD storage patterns
- **Network**: No CDN or streaming optimization for large video files

### Code Quality Issues

#### Error Handling Gaps
- **Preprocessing Failures**: Limited retry logic and error recovery
- **Network Timeouts**: No robust handling of interrupted uploads
- **Device Compatibility**: Inconsistent fallback behavior across platforms

#### Technical Debt
- **Inconsistent Patterns**: Mix of async/await and Promise.then() patterns
- **Database API**: Uses callback-based sqlite3 API instead of promises (wrapped in Promise constructors)
- **Error Handling**: Inconsistent error handling across components (some silent failures)
- **Configuration**: Hardcoded values scattered throughout (SCORING_CONFIG in LiveHUD, PreprocessorConfig in Python)

## Quirks, Assumptions, & Edge Cases

### Implementation Quirks

#### File Naming Conventions
- **UUID Directories**: Song storage uses UUIDs, not human-readable names
- **Extension Preservation**: Original file extensions maintained for compatibility
- **Standardized Names**: Internal files always use consistent names regardless of upload

#### Audio Processing Assumptions
- **Sample Rate**: Hardcoded 48kHz assumption throughout pipeline (except Demucs which uses 44.1kHz)
- **Bit Depth**: 32-bit float processing internally, 16-bit WAV file storage
- **Mono Conversion**: Vocals separated to mono, karaoke audio extracted as mono, original audio can be stereo
- **Channel Count**: AudioWorklet expects mono microphone input (channelCount: 1)
- **Frame Size**: 2048-sample buffers for pitch detection (~42ms at 48kHz)

#### Browser Compatibility
- **Modern APIs**: Requires `requestVideoFrameCallback` (Chrome 94+, Safari 15.4+), `AudioWorklet` support (Chrome 66+, Firefox 76+, Safari 14.1+)
- **CORS Requirements**: Development needs specific header configuration (allows all origins in dev)
- **File API**: Assumes modern File and Blob support
- **HTTPS Requirement**: AudioWorklet requires secure context (HTTPS or localhost)
- **MediaDevices API**: Requires getUserMedia for microphone access

### Edge Cases and Limitations

#### Audio Content Restrictions
- **Same Key Requirement**: Karaoke and original must be in same musical key
- **Tempo Matching**: Significant tempo differences cause alignment failures
- **Genre Limitations**: Optimized for vocal-centric Western popular music

#### Technical Edge Cases
- **Zero-Duration Videos**: Can cause division by zero in timing calculations
- **Silent Sections**: Pitch detection fails during instrumental breaks
- **Microphone Issues**: No graceful degradation if mic access denied mid-session

#### User Experience Assumptions
- **Single Session**: No save/resume functionality for interrupted performances
- **Local Network**: Assumes stable localhost connectivity
- **Desktop Usage**: UI not optimized for mobile or tablet interfaces

### Fragile Components

#### Preprocessing Dependencies
- **Python Environment**: Sensitive to PyTorch/MPS version compatibility
- **FFmpeg Path**: Hardcoded assumptions about system FFmpeg installation
- **Model Downloads**: Demucs models downloaded on first use (no offline mode)

#### Real-time Processing
- **AudioContext State**: Can become suspended and require manual resumption (Chrome/Safari autoplay policies)
- **WorkerLoader**: AudioWorklet loading can fail silently (fallback to basic audio monitoring implemented)
- **Scoring Configuration**: LiveHUD uses 30% pitch / 70% energy weights (inverted from original design)
- **Energy Scoring**: User-relative normalization means energy score adapts to singer's actual range (not absolute reference)
- **Memory Limits**: Performance data limited to 10,000 samples (~3-4 minutes at 50fps) to prevent bloat

### TODOs and Known Issues

#### Documented TODOs
- Unit and integration test coverage
- Mobile responsive design
- Error recovery and fallback mechanisms
- Performance optimization for older hardware

#### Implicit Technical Debt
- **Database Migrations**: No formal schema versioning system (uses `CREATE TABLE IF NOT EXISTS`)
- **Configuration Management**: Hardcoded parameters scattered throughout codebase (SCORING_CONFIG, PreprocessorConfig)
- **Logging Infrastructure**: Inconsistent logging levels and formats (console.log, console.error, no structured logging)
- **Monitoring**: No metrics collection or performance monitoring
- **Testing**: No unit tests, integration tests, or end-to-end tests
- **Type Safety**: No TypeScript, no runtime validation (except JSON schema for reference data)
- **Documentation**: Inline comments vary in quality, some functions lack JSDoc

## Glossary of Internal Terms

### Audio Processing Terms

- **Cents**: Musical interval measurement (1200 cents = 1 octave)
- **Chroma**: 12-dimensional pitch class profile for key-invariant analysis
- **Crepe**: Convolutional neural network for pitch estimation
- **DTW**: Dynamic Time Warping - algorithm for temporal alignment
- **F0**: Fundamental frequency (pitch) of audio signal
- **LUFS**: Loudness Units relative to Full Scale - perceptual loudness measurement
- **MPS**: Metal Performance Shaders - Apple Silicon GPU acceleration
- **RMS**: Root Mean Square - energy measurement for audio signals
- **YIN**: Autocorrelation-based pitch detection algorithm

### System Architecture Terms

- **HUD**: Heads-Up Display - real-time scoring interface overlay
- **Reference Data**: Comprehensive JSON file containing all scoring information
- **Session**: Single performance instance with unique ID
- **Song Pair**: Karaoke video + original audio combination
- **Warp Function**: DTW-derived mapping between karaoke and reference timelines
- **WorkletProcessor**: AudioWorklet-based real-time audio processing

### Scoring and Performance Terms

- **Badge**: Achievement unlocked based on performance metrics
- **Combo**: Consecutive accurate notes streak (5+ for activation)
- **Energy Match**: Loudness similarity between singer and reference
- **Key-shift Forgiveness**: Octave error tolerance in pitch scoring
- **Note Bin**: Discrete pitch target for scoring accuracy
- **Phrase**: Musical segment for detailed analysis
- **Refinement**: Post-performance DTW analysis for improved accuracy

### File and Data Terms

- **Accompaniment**: Instrumental track separated from original audio
- **Karaoke Timeline**: Video playback timebase for synchronization
- **Reference Timeline**: Original audio timebase before alignment
- **Song ID**: UUID identifier for uploaded song pairs
- **Stems**: Separated audio components (vocals, accompaniment)
- **Vocals**: Isolated vocal track from original audio

This context document provides complete situational awareness of the PitchPerfectly karaoke system, enabling AI assistants to understand the architecture, data flow, and implementation details without requiring additional codebase exploration.
