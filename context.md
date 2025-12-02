# PitchPerfectly Karaoke Arcade - Complete Project Context

## High-Level Summary

PitchPerfectly (also referred to as "Karaoke Arcade") is a local, offline karaoke web application that provides professional-grade vocal analysis and scoring for karaoke performances. The system processes karaoke videos with baked-in lyrics alongside original studio audio to create reference data for real-time vocal scoring. Users can upload song pairs, perform karaoke with live feedback, and compete on local leaderboards.

### Core Features Implemented

- **Video Karaoke Playback**: Plays MP4/WebM karaoke videos with frame-accurate timing using `requestVideoFrameCallback` API
- **Advanced Audio Processing**: Demucs v4 vocal separation, torch-crepe pitch tracking, DTW alignment for sync handling
- **Real-time Scoring System**: 30% pitch accuracy + 70% energy matching with live visual feedback (user-relative energy scoring)
- **Echo Cancellation**: NLMS adaptive filtering for speaker playback mode (512-tap filter, 0.01 learning rate)
- **Comprehensive Preprocessing Pipeline**: Automated reference data generation from uploaded content (vocal separation, alignment, pitch extraction)
- **Performance Analytics**: Detailed phrase-level scoring with post-run DTW refinement
- **Local Leaderboard**: SQLite-based score tracking with badge system (Combo King, Mic Melter, Smooth Operator)
- **Retro Arcade UI**: Neon grid aesthetics with custom CSS styling

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
- **Frontend Audio Processing**: AudioWorklet for real-time pitch detection and echo cancellation
- **File Streaming**: HTTP range requests for efficient video playback

### Design Patterns

- **MVC Architecture**: Clear separation between UI components, API routes, and data models
- **Pipeline Pattern**: Sequential preprocessing stages with progress tracking
- **Observer Pattern**: Real-time audio processing with event-driven updates
- **Strategy Pattern**: Device-specific optimization (MPS/CUDA/CPU fallbacks)

## Complete Directory + File Breakdown

### Root Level Files

- **`README.md`**: Primary documentation with feature overview, installation, and usage
- **`QUICKSTART.md`**: User-focused setup guide with troubleshooting
- **`Dockerfile`**: Multi-stage containerization for production deployment
- **`docker-compose.yml`**: Production container orchestration
- **`docker-compose.dev.yml`**: Development environment with hot-reloading
- **`docker-dev.sh`**: Development startup script with Docker Compose v2 detection, container cleanup
- **`docker-start.sh`**: Production Docker startup script with build detection
- **`start.sh`**: Native installation startup script with prerequisite checking (Node.js 20+, Python 3.10+, macOS 12.3+)
- **`upload_demo_tracks.sh`**: Script for uploading demo tracks (if exists)

### Backend Layer (`/backend/`)

- **`server.js`**: Main Express application (1030 lines)
  - Multer configuration for video/audio uploads (500MB limit per file)
  - UUID-based song directory creation with standardized file naming
  - SQLite database initialization and schema creation (songs, sessions, leaderboard tables)
  - REST API endpoints for song management, sessions, leaderboard
  - HTTP range support for video/audio streaming (206 Partial Content)
  - Child process management for Python preprocessing (spawns `preprocess_full.py`)
  - Python executable detection (venv first, then system python3)
  - In-memory preprocessing queue with progress tracking
  - CORS configuration for development (allows all origins)
  - Static file serving for built frontend from `frontend/dist`
  - Filesystem scanning fallback for `/library` endpoint (finds songs even if DB incomplete)

- **`package.json`**: Backend dependencies
  - `express ^4.18.2`: Web framework
  - `multer ^1.4.5-lts.1`: File upload handling (multipart/form-data)
  - `sqlite3 ^5.1.6`: Database interface (callback-based API)
  - `uuid ^9.0.1`: Unique identifier generation (v4 UUIDs)
  - `ws ^8.14.2`: WebSocket support (legacy, not actively used - WebSocket removed in voice-only refactor)
  - `whisper ^0.3.3`: Whisper speech recognition (present but not used)

- **`karaoke.db`**: SQLite database with three tables:
  - `songs`: Track metadata, preprocessing status
  - `sessions`: Performance records with results
  - `leaderboard`: Player scores and rankings

- **`uploads/`**: Temporary storage for multipart file uploads (created by Multer)
- **`references/`**: Legacy directory (not actively used, may contain old reference files)
- **`server.log`**: Application logs (if logging to file is enabled)

### Frontend Layer (`/frontend/`)

#### Core Application Files

- **`src/App.jsx`**: Main application component (193 lines)
  - Screen state management (library → mic-check → karaoke → results)
  - Session lifecycle handling (creates session via `/sessions/start` endpoint)
  - API integration for backend communication (API_BASE = 'http://localhost:8080')
  - Player name and session ID tracking
  - Results submission to leaderboard (optional, requires player name)
  - WebSocket removed (voice-only refactor)

- **`src/main.jsx`**: React application entry point (17 lines)
  - ReactDOM root mounting (React 18 createRoot API)
  - Loading screen management (hides `.loading-screen` element)
  - CSS imports (retro.css for global styles)
  - React.StrictMode enabled for development warnings

#### Component Architecture (`/frontend/src/components/`)

- **`VideoKaraokePlayer.jsx`**: Video playback engine (461 lines)
  - `requestVideoFrameCallback` for frame-accurate timing (fallback to `timeupdate` event)
  - HTTP range request support for large video files (206 Partial Content responses)
  - Volume control (0-1 range) and playback state management
  - Optional reference vocals playback with sync offset adjustment (-3s to +3s)
  - Session start/stop integration with auto-play on session start
  - Video offset adjustment for sync correction
  - Progress bar with seek functionality

- **`LiveHUD.jsx`**: Real-time scoring interface (1167 lines)
  - AudioWorklet integration for pitch processing via `pitch-processor-aec.js`
  - Continuous mathematical scoring (exponential decay, sigmoid functions, no step functions)
  - Visual feedback: note lane with piano roll style, cents error bar, combo counter
  - Performance tracking with 10,000 sample limit to prevent memory bloat
  - 30% pitch / 70% energy scoring algorithm (user-relative energy normalization)
  - Key-shift detection and forgiveness (±100-200 cents tolerance)
  - Temporal smoothing with median filtering and EMA
  - Canvas-based HUD rendering at 60 FPS with throttling

- **`SongLibrary.jsx`**: Song browser interface (138 lines)
  - Library browsing with metadata display (duration, tempo, key)
  - Song selection and detailed loading via `/library/:id` endpoint
  - Fetches from `/library` endpoint which scans both database and filesystem
  - No upload form (upload functionality removed in voice-only refactor)
  - Displays songs with "READY" status badge

- **`MicCheck.jsx`**: Audio setup and testing (254 lines)
  - Microphone access and permission handling with browser constraints
  - Audio level monitoring using AnalyserNode (FFT and time-domain RMS)
  - Real-time audio level visualization with color-coded feedback
  - Motion tracking removed (voice-only refactor)
  - AudioContext state management (handles suspended state)

- **`ResultsScreen.jsx`**: Performance analysis display (336 lines)
  - Score breakdown and grading (S+, S, A+, A, B+, B, C+, C, D, F)
  - Badge system display (Combo King, Mic Melter, Smooth Operator)
  - Leaderboard submission with player name input
  - Pitch timeline and energy graph visualization (SVG-based)
  - Phrase breakdown display (10-second phrase segments)
  - Post-run DTW refinement trigger (not currently implemented in UI)

- **`Leaderboard.jsx`**: Score ranking display (150 lines)
  - Local high score listing (top 20 by default)
  - Player name, score breakdown (pitch/energy), and timestamp display
  - Badge visualization (emoji icons)
  - Rank icons (🥇🥈🥉 for top 3)
  - Statistics display (total players, highest score, average score)

#### Styling (`/frontend/src/styles/`)

- **`retro.css`**: Primary UI styling with neon/arcade theme
- **`video-karaoke.css`**: Video player and HUD-specific styles

#### Build Configuration

- **`vite.config.js`**: Vite build configuration
  - React plugin integration (`@vitejs/plugin-react`)
  - Proxy setup for API calls (`/api` → `http://backend:8080` in Docker, configurable via `VITE_PROXY_TARGET`)
  - Manual chunking for vendor libraries (React, TensorFlow.js)
  - Docker networking compatibility (host 0.0.0.0 for container access)
  - Public directory for workers (AudioWorklet processors)

- **`package.json`**: Frontend dependencies
  - `react ^18.2.0`: UI framework
  - `react-dom ^18.2.0`: DOM rendering
  - `@tensorflow/tfjs ^4.10.0`: Machine learning (motion tracking - not actively used in voice-only mode)
  - `vite ^4.4.5`: Build tool and dev server
  - `@vitejs/plugin-react ^4.0.3`: React plugin for Vite

#### Audio Processing Workers

- **`public/workers/pitch-processor-aec.js`**: AudioWorklet processor (282 lines)
  - Real-time pitch detection using YIN algorithm (autocorrelation-based)
  - NLMS adaptive echo cancellation (512-tap filter, 0.01 step size, 0.001 regularization)
  - Energy calculation (RMS) with exponential smoothing (0.3 alpha)
  - Spectral centroid estimation via zero-crossing rate (FFT-free approximation)
  - Frame-rate throttling (sends every 4 frames ≈ 20ms at 48kHz)
  - Reference signal input for echo cancellation (karaoke playback)
  - Parabolic interpolation for sub-sample pitch accuracy

#### Built Assets (`/frontend/dist/`)

- **`index.html`**: Production HTML entry point
- **`assets/`**: Compiled JavaScript and CSS bundles
- **`workers/`**: Compiled audio worklet processors

### Python Processing Layer (`/python/`)

- **`separate.py`**: Vocal separation engine (248 lines)
  - Demucs v4 model loading and inference (htdemucs_ft model, fallback to htdemucs)
  - Apple Silicon MPS optimization with device auto-detection
  - Multi-device support (MPS > CUDA > CPU fallback)
  - Audio format handling and conversion (resamples to 44.1kHz for Demucs)
  - Stereo conversion (mono inputs duplicated to stereo)
  - Chunked processing with overlap (split=True, overlap=0.25)
  - Source extraction (vocals, accompaniment from 4-source separation)

- **`preprocess_full.py`**: Comprehensive preprocessing pipeline (886 lines)
  - Audio extraction from video files using `av` library (FFmpeg bindings)
  - Vocal separation integration via `separate.py` module
  - Simplified DTW alignment (linear interpolation for similar-length tracks, downsampled DTW for different lengths)
  - Chroma feature extraction (12-dimensional pitch class profiles)
  - Pitch contour extraction with torch-crepe (chunked processing, 30s chunks)
  - Pitch smoothing (median filter + Savitzky-Golay filter)
  - Note binning and phrase segmentation (onset detection, minimum 2s phrase length)
  - Beat and downbeat detection (librosa beat tracking, every 4th beat = downbeat)
  - Loudness profile calculation (RMS to dB conversion, Savitzky-Golay smoothing)
  - Key detection (Krumhansl-Schmuckler key profiles)
  - Reference data JSON generation (version 2.0 schema)
  - Piecewise linear alignment segment fitting (200-frame windows)

- **`refine_results.py`**: Post-performance analysis (289 lines)
  - Phrase-local DTW alignment (per-phrase independent alignment)
  - Improved accuracy calculation (median cents error, percentage within 50 cents tolerance)
  - Performance data refinement with timing offset analysis
  - Pitch chart generation (interpolated overlay of reference vs performance)
  - Overall metrics aggregation from phrase-level results

- **`requirements.txt`**: Python dependencies
  - `torch>=2.0.0`: PyTorch with MPS support
  - `demucs>=4.0.0`: Vocal separation
  - `torchcrepe>=0.0.19`: Pitch extraction
  - `dtaidistance>=2.3.10`: DTW alignment
  - `librosa>=0.10.0`: Audio analysis
  - `soundfile>=0.12.0`: Audio I/O

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

JSON schema defining reference data structure (251 lines):

- Version 2.0 format specification
- DTW alignment mapping (`warp_T`)
- Pitch contour data (`f0_ref_on_k`)
- Note bins for discrete scoring
- Beat and phrase timing information
- Configuration parameters

### Demo Content

#### Demo Tracks (`/demo_tracks/`)

Sample content organized by song directories:

- **`CallMeMaybe/`**: Carly Rae Jepsen - Call Me Maybe (karaoke video + original audio)
- **`CountryRoads/`**: John Denver - Take Me Home (karaoke video + original audio)
- **`DancingQueen/`**: ABBA - Dancing Queen (karaoke video + original audio)
- **`Diamonds/`**: Rihanna - Diamonds (karaoke video + original audio)
- **`Dynamite/`**: Taio Cruz - Dynamite (karaoke video + original audio)
- **`ImagineDragons/`**: Imagine Dragons - Radioactive (karaoke video + original audio)
- **`LetItGo/`**: Frozen - Let It Go (karaoke video + original audio)
- **`MovesLikeJagger/`**: Maroon 5 - Moves Like Jagger (karaoke video + original audio)
- **`OnlyGirl/`**: Rihanna - Only Girl (In the World) (karaoke video + original audio)
- **`Perfect/`**: Ed Sheeran - Perfect (karaoke video + original audio)
- **`PokerFace/`**: Lady Gaga - Poker Face (karaoke video + original audio)
- **`SomeoneLikeYou/`**: Adele - Someone Like You (karaoke video + original audio)
- **`TikTok/`**: Kesha - TiK ToK (karaoke video + original audio)
- **`WeWillRockYou/`**: Queen - We Will Rock You (karaoke video + original audio)

#### Assets (`/assets/badges/`)

SVG badge graphics:

- **`combo_king.svg`**: Longest accuracy streak
- **`mic_melter.svg`**: High energy performance
- **`on_beat_bandit.svg`**: Perfect rhythm accuracy
- **`smooth_operator.svg`**: Perfect pitch accuracy

## Data Flow + System Behavior

### Song Upload and Preprocessing Flow

1. **Frontend Upload**: User selects karaoke video + original audio via `SongLibrary` component
2. **Backend Reception**: Express server receives multipart upload via Multer
3. **File Storage**: Files saved to `/songs/<uuid>/` directory with standardized names
4. **Database Insert**: Song record created in SQLite with "pending" status
5. **Python Invocation**: Backend spawns `preprocess_full.py` child process
6. **Audio Extraction**: FFmpeg extracts audio from karaoke video
7. **Vocal Separation**: Demucs v4 separates vocals from original audio
8. **DTW Alignment**: Chroma feature alignment between karaoke and reference
9. **Pitch Extraction**: torch-crepe generates F0 contour from separated vocals
10. **Reference Generation**: Comprehensive JSON reference data created
11. **Status Update**: Database updated to "complete" with metadata
12. **Frontend Polling**: UI polls `/songs/:id/status` for completion

### Real-time Performance Flow

1. **Session Initialization**: Backend creates session record, returns session ID
2. **Audio Setup**: Frontend requests microphone access, initializes AudioContext
3. **WorkletLoader**: `pitch-processor-aec.js` loaded into AudioWorklet
4. **Video Playback**: `VideoKaraokePlayer` starts karaoke video with frame callbacks
5. **Audio Processing**: Continuous microphone input processed for:
   - NLMS echo cancellation (removes karaoke playback bleed)
   - YIN pitch detection (fundamental frequency estimation)
   - Energy calculation (RMS and LUFS)
   - Spectral analysis (brightness/timbre)
6. **Scoring Engine**: `LiveHUD` compares real-time data against reference:
   - Pitch accuracy: Continuous exponential decay scoring (no thresholds)
     - ±50 cents = 95-100% (perfect range)
     - ±100 cents = 80-95% (good range)
     - ±200 cents = 40-80% (acceptable range)
     - >±200 cents = exponential decay to floor (15% minimum)
   - Key-shift forgiveness: Detects sustained offset and applies correction
   - Energy matching: User-relative logarithmic normalization (no absolute reference)
     - Tracks min/max energy seen during session
     - Normalizes on log scale with smooth tanh clamping
     - 10% minimum floor even for silent sections
   - Combo tracking: 5+ consecutive accurate notes (80% threshold to maintain)
7. **Visual Feedback**: Real-time HUD updates:
   - Note lane with pitch visualization
   - Cents error bar showing accuracy
   - Beat LEDs synchronized to tempo
   - Combo counter and score displays
8. **Performance Recording**: All samples stored for post-analysis
9. **Session Completion**: Results calculated and stored to database
10. **Leaderboard Submission**: Optional player name submission for rankings

### Post-Performance Refinement

1. **Refinement Trigger**: User clicks "REFINE RESULTS" in `ResultsScreen`
2. **Python Invocation**: Backend spawns `refine_results.py` process
3. **Phrase-level DTW**: More accurate alignment per musical phrase
4. **Improved Scoring**: Recalculated accuracy with better temporal alignment
5. **Results Update**: Refined data stored alongside original performance

## API Routes & External Interfaces

### Song Management

- **`POST /songs/upload`**: Multipart upload of karaoke video + original audio
  - Input: `song_name` (string), `karaoke_video` (file), `original_audio` (file)
  - Output: `{song_id, status: "processing"}`
  - Side Effects: File storage, database insert, Python preprocessing spawn

- **`GET /songs/:id/status`**: Check preprocessing progress
  - Output: `{status, progress, error?}`
  - Status values: "pending", "processing", "complete", "failed"

- **`GET /songs`**: List all songs with reference data (legacy endpoint, returns full reference JSON)
  - Output: Array of song objects with complete reference_data embedded
- **`GET /library`**: List ready songs for performance (simplified metadata)
  - Output: Array of song metadata (id, name, duration, tempo, key, video/audio URLs)
  - Scans both database and filesystem (finds songs even if DB incomplete)
  - Only returns songs with existing `reference.json` and `karaoke.mp4` files
- **`GET /library/:id`**: Get detailed song data including reference
  - Output: Complete song object with reference_data for scoring
  - Falls back to filesystem if database record missing
- **`GET /songs/:id`**: Get single song by ID (alternative to `/library/:id`)
  - Output: Same as `/library/:id` but different endpoint path

### Media Streaming

- **`GET /video/:song_id/:filename`**: Video streaming with HTTP range support
  - Headers: Range request handling for efficient playback
  - MIME type: Proper video/* content type setting

- **`GET /audio/:song_id/:filename`**: Audio file streaming
  - Used for reference vocals playback

### Session Management

- **`POST /sessions/start`**: Create new performance session
  - Input: `{song_id}`
  - Output: `{session_id}`
  - Side Effects: Database session record creation

- **`POST /sessions/:id/finish`**: Save performance results
  - Input: Complete performance data object
  - Side Effects: Results stored as JSON in database

- **`POST /sessions/:id/refine`**: Trigger post-run DTW refinement
  - Side Effects: Python process spawn (`refine_results.py`), saves `performance.json` and `refined.json` to sessions directory
  - Updates database `refined_results` column with refined JSON
  - Returns: `{ok: true, refined: <refined_data>}`

- **`GET /sessions/:id/results`**: Retrieve session results
  - Output: `{results, refined?}` with performance data

### Leaderboard

- **`POST /leaderboard/submit`**: Submit score to leaderboard
  - Input: `{session_id, player_name, scores, badges}`
  - Side Effects: Leaderboard table insert

- **`GET /leaderboard`**: Get high scores
  - Query params: `limit` (default: 10, max: 20)
  - Output: Ranked list of performances with player names, scores, badges, song names
  - Joins with `sessions` and `songs` tables for complete data

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

#### PitchProcessorAEC Class
- **Purpose**: Real-time audio analysis with echo cancellation
- **Key Algorithms**:
  - **YIN Pitch Detection**: Autocorrelation-based F0 estimation
  - **NLMS Echo Cancellation**: Adaptive filter for speaker bleed removal
  - **Energy Analysis**: RMS and spectral centroid calculation
- **Performance**: 4-frame throttling (~20ms updates) for efficiency
- **Parameters**:
  - Filter length: 512 taps
  - Learning rate: 0.01
  - Frequency range: 80-1000 Hz

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
- **`ws ^8.14.2`**: WebSocket library (legacy, not actively used)

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

### NLMS Echo Cancellation

1. **Reference Buffer**: Store karaoke playback samples (512-tap history)
2. **Adaptive Filter**: 512-coefficient FIR filter updated per sample
3. **Error Calculation**: `error = microphone_input - filter_output`
4. **Weight Update**: `weights += step_size * error * reference_samples / power`
5. **Normalization**: Regularization prevents division by zero
6. **Learning Rate**: 0.01 step size balances adaptation speed vs. stability

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
- **Echo Cancellation**: NLMS convergence takes 2-3 seconds, affecting early performance

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
- **Mixed Architecture**: WebSocket infrastructure present but unused (removed in voice-only refactor)
- **Legacy Code**: Some components reference removed features (rhythm scoring, motion tracking)
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
- **Echo Cancellation**: Sensitive to audio routing changes during performance (no re-initialization on change)
- **Reference Signal**: Echo cancellation expects karaoke playback as second input channel (not currently connected - AEC filter exists but reference input not wired)
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

- **AEC**: Adaptive Echo Cancellation - NLMS algorithm for removing karaoke playback bleed
- **Cents**: Musical interval measurement (1200 cents = 1 octave)
- **Chroma**: 12-dimensional pitch class profile for key-invariant analysis
- **Crepe**: Convolutional neural network for pitch estimation
- **DTW**: Dynamic Time Warping - algorithm for temporal alignment
- **F0**: Fundamental frequency (pitch) of audio signal
- **LUFS**: Loudness Units relative to Full Scale - perceptual loudness measurement
- **MPS**: Metal Performance Shaders - Apple Silicon GPU acceleration
- **NLMS**: Normalized Least Mean Squares - adaptive filtering algorithm
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
