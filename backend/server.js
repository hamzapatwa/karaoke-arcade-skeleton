import express from 'express';
import multer from 'multer';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { createReadStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Find the Python executable to use for preprocessing
 * Tries venv first, then falls back to system python3
 */
async function findPythonExecutable() {
  const venvPython = path.join(__dirname, '../python/.venv/bin/python');
  const venvPython3 = path.join(__dirname, '../python/.venv/bin/python3');

  // Check if venv Python exists
  try {
    await fs.access(venvPython);
    return venvPython;
  } catch {
    try {
      await fs.access(venvPython3);
      return venvPython3;
    } catch {
      // Fallback to system python3
      return 'python3';
    }
  }
}

const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json({ limit: '10mb' }));

// Configure static file serving with proper MIME types
app.use(express.static(path.join(__dirname, '../frontend/dist'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Configure multer for video/audio uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Generate songId once and reuse it across all files
    if (!req.songId) {
      req.songId = req.body.song_id || uuidv4();
      const songDir = path.join(__dirname, '../songs', req.songId);
      try {
        await fs.mkdir(songDir, { recursive: true });
        req.songDir = songDir;
      } catch (error) {
        cb(error);
        return;
      }
    }
    cb(null, req.songDir);
  },
  filename: (req, file, cb) => {
    // Determine file type
    const fieldname = file.fieldname;
    let filename = '';

    if (fieldname === 'karaoke_video') {
      // Preserve original extension for video files
      const ext = path.extname(file.originalname) || '.mp4';
      filename = `karaoke${ext}`;
    } else if (fieldname === 'original_audio') {
      // Preserve original extension for audio files
      const ext = path.extname(file.originalname) || '.wav';
      filename = `original_audio${ext}`;
    } else {
      // For upload.any(), use original filename
      filename = file.originalname;
    }

    console.log(`Saving file: ${file.originalname} -> ${filename} (field: ${fieldname})`);
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024  // 500MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    console.log(`File filter: ${file.fieldname} - ${file.originalname} - ${file.mimetype}`);

    // Accept video and audio files
    const allowedMimes = [
      'video/mp4',
      'video/webm',
      'audio/wav',
      'audio/mpeg',
      'audio/mp3',
      'application/octet-stream' // For WAV files that might be detected as binary
    ];

    // Also check file extension as fallback
    const allowedExtensions = ['.mp4', '.webm', '.wav', '.mp3'];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      console.log(`File accepted: ${file.fieldname}`);
      cb(null, true);
    } else {
      console.log(`File rejected: ${file.fieldname} - ${file.mimetype} (${fileExtension})`);
      cb(new Error(`Invalid file type: ${file.mimetype} (extension: ${fileExtension})`));
    }
  }
});

/**
 * Derive a reasonable song name from request body or uploaded filenames.
 */
function deriveSongName(req) {
  const body = req.body || {};
  const directName =
    body.song_name ||
    body.songName ||
    body.name ||
    body.title ||
    body.track_name ||
    body.trackName;

  if (directName && directName.trim()) {
    return directName.trim();
  }

  const files = Array.isArray(req.files) ? req.files : [];
  const preferredFile =
    files.find(f => f.fieldname === 'karaoke_video') ||
    files.find(f => f.fieldname === 'original_audio') ||
    files[0];

  if (preferredFile?.originalname) {
    const basename = path.basename(preferredFile.originalname, path.extname(preferredFile.originalname));
    const normalized = basename
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (normalized) {
      // Simple title case so filenames like "call_me_maybe" become "Call Me Maybe"
      return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }

  return 'Untitled Song';
}

// Initialize SQLite database (always use the backend-local file)
const db = new sqlite3.Database(path.join(__dirname, 'karaoke.db'));

// Create tables (updated schema)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    preprocessing_status TEXT DEFAULT 'pending',
    preprocessing_progress REAL DEFAULT 0,
    preprocessing_error TEXT,
    duration REAL,
    tempo REAL,
    key TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    results TEXT,
    refined_results TEXT,
    FOREIGN KEY (song_id) REFERENCES songs (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    total_score REAL NOT NULL,
    pitch_score REAL NOT NULL,
    rhythm_score REAL NOT NULL,
    energy_score REAL NOT NULL,
    badges TEXT,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  )`);
});

// In-memory preprocessing queue
const preprocessingQueue = new Map();

/**
 * Upload karaoke video and original audio for preprocessing
 *
 * POST /songs/upload
 * Body: multipart/form-data
 *   - song_name: string
 *   - karaoke_video: file (MP4/WebM)
 *   - original_audio: file (WAV/MP3)
 */
app.post('/songs/upload', upload.any(), async (req, res) => {
  try {
    const songId = req.songId;
    const songName = deriveSongName(req);
    const songDir = req.songDir;

    // Debug logging
    console.log('Upload request received:');
    console.log('- Song ID:', songId);
    console.log('- Song Name:', songName);
    console.log('- Song Dir:', songDir);
    console.log('- Files received:', req.files);
    console.log('- Body:', req.body);

    // Multer diskStorage already saves files to the correct location
    // No need to copy them - files are already in songDir with correct names
    // Log uploaded files for debugging
    if (req.files && req.files.length > 0) {
      console.log(`Successfully uploaded ${req.files.length} files:`);
      req.files.forEach(file => {
        console.log(`  - ${file.fieldname}: ${file.originalname} -> ${file.path}`);
      });
    }

    // Insert into database
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO songs (id, name) VALUES (?, ?)',
        [songId, songName],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Start preprocessing in background
    startPreprocessing(songId, songDir);

    res.json({
      song_id: songId,
      message: 'Upload successful. Preprocessing started.',
      status: 'processing'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Start preprocessing pipeline
 */
async function startPreprocessing(songId, songDir) {
  console.log(`Starting preprocessing for song: ${songId}`);

  const job = {
    songId,
    songDir,
    status: 'running',
    progress: 0,
    startedAt: Date.now()
  };

  preprocessingQueue.set(songId, job);

  // Update database status
  db.run(
    'UPDATE songs SET preprocessing_status = ? WHERE id = ?',
    ['processing', songId]
  );

  try {
    // Run preprocessing script
    const pythonScript = path.join(__dirname, '../python/preprocess_full.py');
    // Find the actual karaoke video and original audio files
    const files = await fs.readdir(songDir);
    const karaokeVideo = files.find(f => f.startsWith('karaoke.')) ? path.join(songDir, files.find(f => f.startsWith('karaoke.'))) : null;
    const originalAudio = files.find(f => f.startsWith('original_audio.')) ? path.join(songDir, files.find(f => f.startsWith('original_audio.'))) : null;
    const outputDir = songDir;

    if (!karaokeVideo || !originalAudio) {
      console.error('Missing required files:', { karaokeVideo, originalAudio });
      return;
    }

    const args = [
      pythonScript,
      '--song-id', songId,
      '--karaoke-video', karaokeVideo,
      '--original-audio', originalAudio,
      '--output-dir', outputDir,
      '--device', 'auto'
    ];

    // Find the Python executable (venv or system fallback)
    const pythonExecutable = await findPythonExecutable();
    console.log(`Using Python: ${pythonExecutable}`);
    const process = spawn(pythonExecutable, args);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`[${songId}] ${data}`);

      // Parse progress from output
      const progressMatch = data.toString().match(/(\d+)%/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1]) / 100;
        job.progress = progress;

        db.run(
          'UPDATE songs SET preprocessing_progress = ? WHERE id = ?',
          [progress, songId]
        );
      }
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`[${songId}] ERROR: ${data}`);
    });

    process.on('close', async (code) => {
      if (code === 0) {
        console.log(`✅ Preprocessing complete for ${songId}`);

        // Load reference data and update database
        try {
          const referencePath = path.join(songDir, 'reference.json');
          const referenceData = JSON.parse(await fs.readFile(referencePath, 'utf8'));

          db.run(
            `UPDATE songs SET
              preprocessing_status = 'complete',
              preprocessing_progress = 1.0,
              duration = ?,
              tempo = ?,
              key = ?
             WHERE id = ?`,
            [referenceData.duration, referenceData.tempo, referenceData.key, songId]
          );

          job.status = 'complete';
          job.progress = 1.0;

        } catch (error) {
          console.error(`Failed to load reference data: ${error}`);
          throw error;
        }

      } else {
        console.error(`❌ Preprocessing failed for ${songId} with code ${code}`);
        console.error(`stderr: ${stderr}`);

        db.run(
          'UPDATE songs SET preprocessing_status = ?, preprocessing_error = ? WHERE id = ?',
          ['error', stderr, songId]
        );

        job.status = 'error';
        job.error = stderr;
      }
    });

  } catch (error) {
    console.error(`Preprocessing error for ${songId}:`, error);

    db.run(
      'UPDATE songs SET preprocessing_status = ?, preprocessing_error = ? WHERE id = ?',
      ['error', error.message, songId]
    );

    job.status = 'error';
    job.error = error.message;
  }
}

/**
 * Get preprocessing status
 * GET /songs/:id/status
 */
app.get('/songs/:id/status', (req, res) => {
  const songId = req.params.id;

  db.get(
    'SELECT preprocessing_status, preprocessing_progress, preprocessing_error FROM songs WHERE id = ?',
    [songId],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Song not found' });
      }

      const job = preprocessingQueue.get(songId);

      res.json({
        status: row.preprocessing_status,
        progress: row.preprocessing_progress,
        error: row.preprocessing_error,
        processing_time: job ? (Date.now() - job.startedAt) / 1000 : null
      });
    }
  );
});

// Removed duplicate /songs endpoint - use /library instead

/**
 * Helper: Check if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper: Load song data with assets validation
 */
async function loadSongData(songId, dbRow = null) {
  const songsDir = path.join(__dirname, '../songs');
  const refPath = path.join(songsDir, songId, 'reference.json');
  const videoPath = path.join(songsDir, songId, 'karaoke.mp4');
  const vocalsPath = path.join(songsDir, songId, 'vocals.wav');

  // Validate required assets
  if (!(await fileExists(refPath)) || !(await fileExists(videoPath))) {
    return null;
  }

  // Load reference data
  let referenceData = null;
  try {
    referenceData = JSON.parse(await fs.readFile(refPath, 'utf8'));
  } catch (error) {
    console.error(`Failed to parse reference for ${songId}:`, error);
    return null;
  }

  const hasVocals = await fileExists(vocalsPath);

  return {
    id: songId,
    name: dbRow?.name || songId,
    duration: dbRow?.duration || referenceData?.duration || null,
    tempo: dbRow?.tempo || referenceData?.tempo || null,
    key: dbRow?.key || referenceData?.key || null,
    uploaded_at: dbRow?.created_at || null,
    karaoke_video: `/video/${songId}/karaoke.mp4`,
    reference_vocals: hasVocals ? `/audio/${songId}/vocals.wav` : null,
    reference_data: referenceData
  };
}

/**
 * Get library (simplified song list for frontend)
 * GET /library
 */
app.get('/library', async (req, res) => {
  try {
    // Get all complete songs from DB
    const rows = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM songs WHERE preprocessing_status = ? ORDER BY created_at DESC',
        ['complete'],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    const songs = [];
    const included = new Set();

    // Load DB songs with asset validation
    for (const row of rows) {
      const songData = await loadSongData(row.id, row);
      if (songData) {
        delete songData.reference_data; // Don't include full reference in list
        songs.push(songData);
        included.add(row.id);
      } else {
        console.warn(`Skipping incomplete song ${row.id}: missing assets`);
      }
    }

    // Scan filesystem for songs not in DB
    const songsDir = path.join(__dirname, '../songs');
    const entries = await fs.readdir(songsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || included.has(entry.name)) continue;

      const songData = await loadSongData(entry.name);
      if (songData) {
        delete songData.reference_data;
        songs.push(songData);
        included.add(entry.name);
      }
    }

    res.json(songs);
  } catch (error) {
    console.error('Library error:', error);
    res.status(500).json({ error: 'Failed to load library' });
  }
});

/**
 * Get single song details
 * GET /library/:id
 */
app.get('/library/:id', async (req, res) => {
  const songId = req.params.id;

  try {
    // Try to get from DB first
    const row = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM songs WHERE id = ? AND preprocessing_status = ?',
        [songId, 'complete'],
        (err, row) => err ? reject(err) : resolve(row)
      );
    }).catch(() => null);

    // Load song data (works with or without DB row)
    const songData = await loadSongData(songId, row);

    if (!songData) {
      return res.status(404).json({ error: 'Song not found or incomplete' });
    }

    res.json(songData);
  } catch (error) {
    console.error(`Failed to load song ${songId}:`, error);
    res.status(500).json({ error: 'Failed to load song data' });
  }
});

// Removed duplicate /songs/:id endpoint - use /library/:id instead

/**
 * Serve audio files (e.g., reference vocals) with range support
 * GET /audio/:song_id/:filename
 */
app.get('/audio/:song_id/:filename', async (req, res) => {
  const { song_id, filename } = req.params;
  const audioPath = path.join(__dirname, '../songs', song_id, filename);

  try {
    await fs.access(audioPath);

    const stat = await fs.stat(audioPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // naive content-type based on extension
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.wav' ? 'audio/wav' : ext === '.mp3' ? 'audio/mpeg' : 'application/octet-stream';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });

      const stream = createReadStream(audioPath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType
      });

      const stream = createReadStream(audioPath);
      stream.pipe(res);
    }

  } catch (error) {
    res.status(404).json({ error: 'Audio not found' });
  }
});

/**
 * Serve video files
 * GET /video/:song_id/:filename
 */
app.get('/video/:song_id/:filename', async (req, res) => {
  const { song_id, filename } = req.params;
  const videoPath = path.join(__dirname, '../songs', song_id, filename);

  try {
    await fs.access(videoPath);

    // Stream video with range support
    const stat = await fs.stat(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4'
      });

      const stream = createReadStream(videoPath, { start, end });
      stream.pipe(res);

    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      });

      const stream = createReadStream(videoPath);
      stream.pipe(res);
    }

  } catch (error) {
    res.status(404).json({ error: 'Video not found' });
  }
});

/**
 * Start session
 * POST /sessions/start
 */
app.post('/sessions/start', (req, res) => {
  const { song_id } = req.body;
  console.log('Starting session for song_id:', song_id);

  if (!song_id) {
    console.error('Missing song_id in request');
    return res.status(400).json({ error: 'Missing song_id in request' });
  }

  const sessionId = uuidv4();

  db.run(
    'INSERT INTO sessions (id, song_id) VALUES (?, ?)',
    [sessionId, song_id],
    (err) => {
      if (err) {
        console.error('Database error creating session:', err);
        return res.status(500).json({ error: 'Failed to create session', details: err.message });
      }
      console.log('Session created:', sessionId);
      res.json({ session_id: sessionId });
    }
  );
});

/**
 * Finish session and save results
 * POST /sessions/:id/finish
 */
app.post('/sessions/:id/finish', (req, res) => {
  const sessionId = req.params.id;
  const results = req.body;

  db.run(
    'UPDATE sessions SET finished_at = CURRENT_TIMESTAMP, results = ? WHERE id = ?',
    [JSON.stringify(results), sessionId],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to save results' });
      }
      res.json({ ok: true });
    }
  );
});

/**
 * Refine session results using phrase-local DTW
 * POST /sessions/:id/refine
 */
app.post('/sessions/:id/refine', async (req, res) => {
  const sessionId = req.params.id;

  try {
    // Get session data
    const session = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM sessions WHERE id = ?', [sessionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get song data
    const song = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM songs WHERE id = ?', [session.song_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Paths
    const referencePath = path.join(__dirname, '../songs', song.id, 'reference.json');
    const performancePath = path.join(__dirname, '../sessions', sessionId, 'performance.json');
    const refinedPath = path.join(__dirname, '../sessions', sessionId, 'refined.json');

    // Create session directory
    await fs.mkdir(path.join(__dirname, '../sessions', sessionId), { recursive: true });

    // Save performance data
    const results = JSON.parse(session.results);
    await fs.writeFile(performancePath, JSON.stringify(results.performance_data));

    // Run refinement script
    const pythonScript = path.join(__dirname, '../python/refine_results.py');
    // Find the Python executable (venv or system fallback)
    const pythonExecutable = await findPythonExecutable();
    console.log(`Using Python for refinement: ${pythonExecutable}`);
    const process = spawn(pythonExecutable, [
      pythonScript,
      '--reference', referencePath,
      '--performance', performancePath,
      '--output', refinedPath
    ]);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', async (code) => {
      if (code === 0) {
        // Load refined results
        const refinedData = JSON.parse(await fs.readFile(refinedPath, 'utf8'));

        // Update database
        db.run(
          'UPDATE sessions SET refined_results = ? WHERE id = ?',
          [JSON.stringify(refinedData), sessionId],
          (err) => {
            if (err) {
              return res.status(500).json({ error: 'Failed to save refined results' });
            }

            res.json({
              ok: true,
              refined: refinedData
            });
          }
        );
      } else {
        res.status(500).json({ error: 'Refinement failed', stderr });
      }
    });

  } catch (error) {
    console.error('Refinement error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get session results
 * GET /sessions/:id/results
 */
app.get('/sessions/:id/results', (req, res) => {
  const sessionId = req.params.id;

  db.get(
    'SELECT results, refined_results FROM sessions WHERE id = ?',
    [sessionId],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const results = JSON.parse(row.results || '{}');
      const refined = row.refined_results ? JSON.parse(row.refined_results) : null;

      res.json({
        results,
        refined
      });
    }
  );
});

/**
 * Submit to leaderboard
 * POST /leaderboard/submit
 */
app.post('/leaderboard/submit', (req, res) => {
  const { session_id, player_name, scores, badges } = req.body;

  db.run(
    `INSERT INTO leaderboard (session_id, player_name, total_score, pitch_score, rhythm_score, energy_score, badges)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      session_id,
      player_name,
      scores.total,
      scores.pitch,
      scores.rhythm || 0, // Default to 0 if not provided (rhythm scoring removed)
      scores.energy,
      JSON.stringify(badges)
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to submit to leaderboard' });
      }
      res.json({ ok: true, rank: this.lastID });
    }
  );
});

/**
 * Get leaderboard
 * GET /leaderboard
 */
app.get('/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  db.all(
    `SELECT l.*, s.song_id, so.name as song_name
     FROM leaderboard l
     INNER JOIN sessions s ON l.session_id = s.id
     INNER JOIN songs so ON s.song_id = so.id
     ORDER BY l.total_score DESC
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }

      const leaderboard = rows.map(row => ({
        ...row,
        badges: JSON.parse(row.badges || '[]')
      }));

      res.json(leaderboard);
    }
  );
});

// Cleanup old preprocessing jobs
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of preprocessingQueue.entries()) {
    if (job.status === 'complete' || job.status === 'error') {
      if (now - job.startedAt > 3600000) {  // 1 hour
        preprocessingQueue.delete(jobId);
      }
    }
  }
}, 300000);  // Every 5 minutes

const PORT = process.env.PORT || 8080;
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`🎤 Karaoke Arcade Server v2 running on port ${PORT}`);
  console.log(`   - Upload videos: POST /songs/upload`);
  console.log(`   - Check status: GET /songs/:id/status`);
  console.log(`   - Start session: POST /sessions/start`);
  console.log(`   - Refine results: POST /sessions/:id/refine`);
});

