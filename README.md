# 🎤 Retro Arcade Karaoke 🎤

A real-time karaoke scoring web app with retro-arcade aesthetics, auto-extracted scoring references, and motion tracking bonuses. Perfect for local parties!

## ✨ Features

- **🎵 Auto Song Analysis**: Drop any MP3/WAV file and get instant beat detection, pitch analysis, and musical structure
- **🎯 Real-time Scoring**: Live pitch accuracy, rhythm alignment, energy analysis, and motion bonuses
- **📊 Comprehensive Results**: Detailed breakdowns with charts, badges, and phrase-level scoring
- **🏆 Leaderboard**: Local high scores with persistent storage
- **📹 Motion Tracking**: Optional MoveNet-powered motion detection for bonus points
- **🎮 Retro Arcade UI**: Neon grid aesthetics with CRT effects and pixel fonts

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Python 3.10+
- Modern web browser with Web Audio API support

### Installation

1. **Clone and setup backend:**
```bash
cd backend
npm install
```

2. **Setup Python environment:**
```bash
cd ../python
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

3. **Setup frontend:**
```bash
cd ../frontend
npm install
```

### Running the App

1. **Start the backend server:**
```bash
cd backend
npm start
# Server runs on http://localhost:8080
```

2. **Start the frontend dev server:**
```bash
cd frontend
npm run dev
# Frontend runs on http://localhost:3000
```

3. **Open your browser** and navigate to `http://localhost:3000`

## 🎮 How to Use

1. **Upload a Song**: Drag & drop any MP3 or WAV file (up to 50MB)
2. **Wait for Analysis**: The system extracts beats, pitch contour, and musical features
3. **Mic Check**: Test your microphone and optionally enable motion tracking
4. **Perform**: Sing along with real-time scoring feedback
5. **View Results**: See detailed breakdowns, earn badges, and submit to leaderboard

## 🏗️ Architecture

### Backend (Node.js)
- **Express server** with file upload handling
- **WebSocket** for real-time communication
- **SQLite database** for persistence
- **Python process spawning** for audio analysis

### Frontend (React + Vite)
- **React components** with retro styling
- **Web Audio API** for real-time audio processing
- **TensorFlow.js** for MoveNet motion tracking
- **Canvas rendering** for HUD visualization

### Python Analysis Service
- **CREPE** for high-quality pitch estimation
- **librosa** for beat detection and musical analysis
- **scipy** for signal processing and DTW alignment
- **Comprehensive feature extraction** (key detection, section analysis, etc.)

## 🎯 Scoring System

### Weighted Scoring (Tunable)
- **60% Pitch Accuracy**: Real-time pitch alignment to reference contour
- **25% Rhythm**: Beat timing and phrase-level rhythm accuracy
- **10% Energy**: Vocal energy and brightness analysis
- **5% Motion**: Optional motion tracking bonus (capped)

### Badges
- **👑 Combo King**: Longest beat streak
- **🥁 On-Beat Bandit**: Perfect rhythm accuracy
- **🔥 Mic Melter**: High energy performance
- **🎵 Smooth Operator**: Perfect pitch accuracy

## 🔧 Configuration

### Scoring Weights
Edit `frontend/components/LiveHUD.jsx` to adjust scoring weights:
```javascript
const totalScore = (
  pitchScore * 0.6 +      // 60% pitch
  rhythmScore * 0.25 +    // 25% rhythm
  energyScore * 0.1 +     // 10% energy
  motionScore * 0.05     // 5% motion
) * 100;
```

### Audio Settings
Modify audio processing parameters in `frontend/workers/pitch-processor.js`:
- Frame size: 2048 samples
- Hop length: 20ms
- Sample rate: 22050 Hz

## 📁 Project Structure

```
karaoke-arcade-skeleton/
├── backend/
│   ├── server.js          # Express + WebSocket server
│   ├── package.json       # Node.js dependencies
│   └── uploads/           # Uploaded audio files
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main app component
│   │   ├── components/    # React components
│   │   └── styles/        # Retro CSS styling
│   ├── workers/           # AudioWorklet processors
│   └── package.json       # Frontend dependencies
├── python/
│   ├── analyze.py         # Audio analysis service
│   └── requirements.txt   # Python dependencies
├── schemas/               # JSON schemas
└── assets/               # Badge SVGs
```

## 🧪 Testing

### Audio Testing
- **Synthetic sweeps**: Test pitch detection accuracy
- **Metronome tracks**: Validate rhythm tolerance
- **Noisy environments**: Test robustness

### Motion Testing
- **False positive checks**: Ensure stable motion detection
- **Performance testing**: Verify MoveNet integration

## 🎵 Demo Content

The app works with any audio file, but for best results:
- **Clear vocals** (not instrumental)
- **Consistent tempo**
- **Good audio quality** (not heavily compressed)
- **60-75 second clips** for demo purposes

## 🔒 Privacy & Security

- **Local processing**: All audio analysis happens locally
- **No cloud uploads**: Files stay on your machine
- **Webcam consent**: Explicit permission required for motion tracking
- **Data retention**: Results stored locally in SQLite

## 🐛 Troubleshooting

### Common Issues

**"Analysis failed"**
- Check Python dependencies are installed
- Ensure audio file is valid MP3/WAV
- Check file size is under 50MB

**"Microphone access denied"**
- Allow microphone permissions in browser
- Check microphone is not used by other apps
- Try refreshing the page

**"Motion tracking not working"**
- Ensure webcam permissions are granted
- Check TensorFlow.js is loading correctly
- Verify MoveNet model downloads successfully

**"WebSocket connection failed"**
- Ensure backend server is running on port 8080
- Check firewall settings
- Try refreshing the connection

## 🚀 Performance Tips

- **Close other audio apps** for better microphone performance
- **Use wired headphones** to reduce audio feedback
- **Good lighting** helps motion tracking accuracy
- **Stable internet** for TensorFlow.js model loading

## 📈 Future Enhancements

- **Multiplayer support**: Duet mode with split-screen lanes
- **More motion types**: Dance move recognition
- **Advanced badges**: Genre-specific achievements
- **Cloud sync**: Optional cloud leaderboards
- **Mobile support**: Touch-optimized interface

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🎉 Credits

- **CREPE**: High-quality pitch estimation
- **librosa**: Music information retrieval
- **TensorFlow.js**: MoveNet pose estimation
- **React**: Frontend framework
- **Express**: Backend framework

---

**Ready to rock? Drop a song and start singing! 🎤✨**