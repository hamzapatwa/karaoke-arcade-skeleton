import express from 'express';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json({limit: '2mb'}));
app.use(express.static(path.join(__dirname, '../frontend')));

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3 and WAV files are allowed.'));
    }
  }
});

// Initialize SQLite database
const db = new sqlite3.Database('karaoke.db');

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    analyzed BOOLEAN DEFAULT FALSE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reference_data (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL,
    reference_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (track_id) REFERENCES tracks (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    results TEXT,
    FOREIGN KEY (track_id) REFERENCES tracks (id),
    FOREIGN KEY (reference_id) REFERENCES reference_data (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    total_score REAL NOT NULL,
    pitch_score REAL NOT NULL,
    rhythm_score REAL NOT NULL,
    energy_score REAL NOT NULL,
    motion_score REAL NOT NULL,
    badges TEXT,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  )`);
});

// In-memory stores for active sessions
const rooms = new Map();
const analysisJobs = new Map();

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const trackId = uuidv4();
    const originalName = req.file.originalname;
    const filename = req.file.filename;

    // Store in database
    db.run(
      'INSERT INTO tracks (id, filename, original_name) VALUES (?, ?, ?)',
      [trackId, filename, originalName],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to store track' });
        }
        res.json({ track_id: trackId, filename: originalName });
      }
    );
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Analysis endpoint
app.post('/analyze/:track_id', async (req, res) => {
  const trackId = req.params.track_id;

  try {
    // Get track info from database
    db.get('SELECT * FROM tracks WHERE id = ?', [trackId], (err, track) => {
      if (err || !track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      if (track.analyzed) {
        // Already analyzed, get reference
        db.get('SELECT * FROM reference_data WHERE track_id = ?', [trackId], (err, ref) => {
          if (err || !ref) {
            return res.status(500).json({ error: 'Reference not found' });
          }
          res.json({ reference_id: ref.id, status: 'ready' });
        });
        return;
      }

      // Start analysis job
      const jobId = uuidv4();
      analysisJobs.set(jobId, { trackId, status: 'processing' });

      const audioPath = path.join(__dirname, 'uploads', track.filename);
      const outputPath = path.join(__dirname, 'references', `${trackId}.json`);

      // Ensure references directory exists
      fs.mkdir(path.dirname(outputPath), { recursive: true }).catch(() => {});

      // Spawn Python analysis process with virtual environment
      const pythonPath = path.join(__dirname, '../python/.venv/bin/python');
      console.log(`Starting Python analysis with: ${pythonPath}`);
      console.log(`Audio file: ${audioPath}`);
      console.log(`Output file: ${outputPath}`);

      const pythonProcess = spawn(pythonPath, [
        path.join(__dirname, '../python/analyze.py'),
        audioPath,
        outputPath
      ]);

      // Log Python process output for debugging
      pythonProcess.stdout.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code: ${code}`);
        if (code === 0) {
          // Analysis successful, store reference
          fs.readFile(outputPath, 'utf8').then(data => {
            const referenceId = uuidv4();
            db.run(
              'INSERT INTO reference_data (id, track_id, reference_data) VALUES (?, ?, ?)',
              [referenceId, trackId, data],
              (err) => {
                if (err) {
                  console.error('Failed to store reference:', err);
                  analysisJobs.set(jobId, { trackId, status: 'error' });
                  return;
                }

                // Mark track as analyzed
                db.run('UPDATE tracks SET analyzed = TRUE WHERE id = ?', [trackId]);
                analysisJobs.set(jobId, { trackId, status: 'completed', referenceId });
              }
            );
          }).catch(err => {
            console.error('Failed to read analysis output:', err);
            analysisJobs.set(jobId, { trackId, status: 'error' });
          });
        } else {
          console.error('Python analysis failed with code:', code);
          analysisJobs.set(jobId, { trackId, status: 'error' });
        }
      });

      res.json({ job_id: jobId, status: 'processing' });
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Check analysis status
app.get('/analyze/status/:job_id', (req, res) => {
  const jobId = req.params.job_id;
  const job = analysisJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

// Get reference data
app.get('/reference/:reference_id', (req, res) => {
  const referenceId = req.params.reference_id;

  db.get('SELECT * FROM reference_data WHERE id = ?', [referenceId], (err, ref) => {
    if (err || !ref) {
      return res.status(404).json({ error: 'Reference not found' });
    }

    try {
      const referenceData = JSON.parse(ref.reference_data);
      res.json(referenceData);
    } catch (error) {
      res.status(500).json({ error: 'Invalid reference data' });
    }
  });
});

// Start session
app.post('/session/start', (req, res) => {
  const { track_id, reference_id } = req.body;
  const sessionId = uuidv4();

  db.run(
    'INSERT INTO sessions (id, track_id, reference_id) VALUES (?, ?, ?)',
    [sessionId, track_id, reference_id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create session' });
      }
      res.json({ session_id: sessionId });
    }
  );
});

// Finish session and store results
app.post('/session/finish/:session_id', (req, res) => {
  const sessionId = req.params.session_id;
  const results = req.body;

  db.run(
    'UPDATE sessions SET finished_at = CURRENT_TIMESTAMP, results = ? WHERE id = ?',
    [JSON.stringify(results), sessionId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to save results' });
      }
      res.json({ ok: true });
    }
  );
});

// Get session results
app.get('/session/results/:session_id', (req, res) => {
  const sessionId = req.params.session_id;

  db.get('SELECT * FROM sessions WHERE id = ?', [sessionId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.results) {
      return res.status(404).json({ error: 'Results not available' });
    }

    try {
      const results = JSON.parse(session.results);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: 'Invalid results data' });
    }
  });
});

// Submit to leaderboard
app.post('/leaderboard/submit', (req, res) => {
  const { session_id, player_name, scores, badges } = req.body;

  db.run(
    `INSERT INTO leaderboard (session_id, player_name, total_score, pitch_score, rhythm_score, energy_score, motion_score, badges)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [session_id, player_name, scores.total, scores.pitch, scores.rhythm, scores.energy, scores.motion, JSON.stringify(badges)],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to submit to leaderboard' });
      }
      res.json({ ok: true, rank: this.lastID });
    }
  );
});

// Get leaderboard
app.get('/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  db.all(
    `SELECT * FROM leaderboard
     ORDER BY total_score DESC
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

// WebSocket server for real-time communication
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/room' });

wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'join') {
        ws.room = msg.roomId;
        if (!rooms.has(ws.room)) rooms.set(ws.room, new Set());
        rooms.get(ws.room).add(ws);
        console.log(`Client joined room: ${ws.room}`);
      } else if (msg.type === 'hud') {
        // Relay HUD metrics to all clients in the room
        const peers = rooms.get(ws.room) || [];
        for (const peer of peers) {
          if (peer !== ws && peer.readyState === 1) {
            peer.send(JSON.stringify({ type: 'hud', payload: msg.payload }));
          }
        }
      } else if (msg.type === 'beat') {
        // Broadcast beat events to all clients in room
        const peers = rooms.get(ws.room) || [];
        for (const peer of peers) {
          if (peer.readyState === 1) {
            peer.send(JSON.stringify({ type: 'beat', payload: msg.payload }));
          }
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    if (ws.room && rooms.has(ws.room)) {
      rooms.get(ws.room).delete(ws);
      if (rooms.get(ws.room).size === 0) {
        rooms.delete(ws.room);
      }
    }
    console.log('WebSocket client disconnected');
  });
});

// Cleanup old analysis jobs periodically
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of analysisJobs.entries()) {
    if (job.status === 'completed' || job.status === 'error') {
      analysisJobs.delete(jobId);
    }
  }
}, 300000); // Clean up every 5 minutes

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Karaoke Arcade server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/room`);
});