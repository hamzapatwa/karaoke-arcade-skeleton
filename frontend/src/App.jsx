import React, { useState, useEffect, useRef } from 'react';
import './styles/retro.css';
import SongLibrary from './components/SongLibrary';
import VideoKaraokePlayer from './components/VideoKaraokePlayer';
import LiveHUD from './components/LiveHUD';
import MicCheck from './components/MicCheck';
import ResultsScreen from './components/ResultsScreen';
import Leaderboard from './components/Leaderboard';

const API_BASE = 'http://localhost:8080';

function App() {
  const [currentScreen, setCurrentScreen] = useState('library'); // library, mic-check, karaoke, results
  const [selectedSong, setSelectedSong] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [videoTime, setVideoTime] = useState(0);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionResults, setSessionResults] = useState(null);

  // WebSocket removed in voice-only refactor

  const handleSongSelect = (songData) => {
    setSelectedSong(songData);
    setCurrentScreen('mic-check');
  };

  const handleMicCheckComplete = () => {
    setCurrentScreen('karaoke');
  };

  const handleSessionComplete = async (results) => {
    try {
      // Save results to backend if sessionId exists
      if (sessionId) {
        await fetch(`${API_BASE}/sessions/${sessionId}/finish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(results)
        }).catch(err => console.warn('Failed to save results to backend:', err));

        // Submit to leaderboard if player name provided
        if (playerName) {
          await fetch(`${API_BASE}/leaderboard/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              player_name: playerName,
              scores: results.totals,
              badges: results.badges
            })
          }).catch(err => console.warn('Failed to submit to leaderboard:', err));
        }
      } else {
        console.warn('No session ID, results not saved to backend');
      }

      // Store results for display
      setSessionResults(results);
      setCurrentScreen('results');
    } catch (error) {
      console.error('Error in handleSessionComplete:', error);
      setSessionResults(results);
      setCurrentScreen('results');
    }
  };

  const startNewSession = () => {
    setCurrentScreen('library');
    setSelectedSong(null);
    setSessionId(null);
    setPlayerName('');
    setIsSessionActive(false);
    setSessionResults(null);
    // No WebSocket to close
  };

  const renderCurrentScreen = () => {
    switch (currentScreen) {
      case 'library':
        return (
          <SongLibrary
            onSongSelect={handleSongSelect}
            apiBase={API_BASE}
          />
        );

      case 'mic-check':
        return (
          <MicCheck
            onComplete={handleMicCheckComplete}
            wsUrl={`ws://localhost:8080/session/${sessionId}`}
          />
        );

      case 'karaoke':
        return (
          <div className="karaoke-stage">
            <VideoKaraokePlayer
              songData={selectedSong}
              apiBase={API_BASE}
              onSessionComplete={handleSessionComplete}
              onStartSession={async () => {
                try {
                  const response = await fetch(`${API_BASE}/sessions/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      song_id: selectedSong.id
                    })
                  });
                  if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Failed to start session:', errorData);
                    throw new Error(errorData.error || 'Failed to start session');
                  }
                  const result = await response.json();
                  setSessionId(result.session_id);
                } catch (error) {
                  console.error('Error starting session:', error);
                  alert(`Failed to start session: ${error.message}`);
                  setIsSessionActive(false);
                }
              }}
              onTimeUpdate={(t) => setVideoTime(t)}
              isSessionActive={isSessionActive}
              onSessionToggle={(active) => setIsSessionActive(active)}
            />
            <LiveHUD
              referenceData={selectedSong?.reference_data}
              externalTime={videoTime}
              isSessionActive={isSessionActive}
              onSessionComplete={handleSessionComplete}
            />
          </div>
        );

      case 'results':
        return (
          <ResultsScreen
            sessionId={sessionId}
            results={sessionResults}
            apiBase={API_BASE}
            onNewSession={startNewSession}
            playerName={playerName}
            onPlayerNameChange={setPlayerName}
          />
        );

      default:
        return <div>Unknown screen</div>;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="neon-title">🎤 KARAOKE ARCADE 🎤</h1>
        <div className="status-indicators">
          {/* LIVE/OFFLINE indicator removed */}
        </div>
      </header>

      <main className="app-main">
        {renderCurrentScreen()}
      </main>

      <footer className="app-footer">
        <div className="controls">
          <button
            className="retro-button"
            onClick={startNewSession}
            disabled={currentScreen === 'library'}
          >
            🎵 SONG LIBRARY
          </button>
          <button
            className="retro-button"
            onClick={() => setCurrentScreen('results')}
            disabled={!sessionId}
          >
            📊 LEADERBOARD
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
