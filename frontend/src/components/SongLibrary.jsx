import React, { useState, useEffect } from 'react';

export default function SongLibrary({ onSongSelect, apiBase }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSong, setSelectedSong] = useState(null);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    try {
      const response = await fetch(`${apiBase}/library`);
      const data = await response.json();
      setSongs(data);
    } catch (error) {
      console.error('Failed to load library:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSongSelect = async (song) => {
    try {
      const response = await fetch(`${apiBase}/library/${song.id}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('Failed to load song details:', err.error || response.statusText);
        alert(`Failed to load song: ${err.error || response.statusText}`);
        return;
        }
      const songData = await response.json();
      setSelectedSong(songData);
      onSongSelect(songData);
    } catch (error) {
      console.error('Failed to load song details:', error);
      alert(`Failed to load song: ${error.message}`);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="library-container">
        <div className="loading">
          <div className="spinner"></div>
          <h2>LOADING LIBRARY...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="library-container">
      <div className="library-header">
        <h1 className="neon-title">🎵 SONG LIBRARY 🎵</h1>
        <div className="library-controls">
          <button
            className="retro-button"
            onClick={loadLibrary}
          >
            🔄 REFRESH
          </button>
        </div>
      </div>

      {/* Upload removed in voice-only refactor */}

      <div className="library-content">
        {songs.length === 0 ? (
          <div className="empty-library">
            <h2>🎤 NO SONGS IN LIBRARY</h2>
            <p>Place preprocessed references and videos to get started.</p>
          </div>
        ) : (
          <div className="songs-grid">
            {songs.map((song) => (
              <div
                key={song.id}
                className={`song-card ${selectedSong?.id === song.id ? 'selected' : ''}`}
                onClick={() => handleSongSelect(song)}
              >
                <div className="song-info">
                  <h3 className="song-title">{song.name}</h3>
                  <p className="song-date">Added: {formatDate(song.uploaded_at)}</p>
                  <div className="song-status">
                    <span className="status-badge ready">✅ READY</span>
                  </div>
                </div>
                <div className="song-actions">
                  <button
                    className="retro-button small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSongSelect(song);
                    }}
                  >
                    🎤 SING
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedSong && (
        <div className="song-details">
          <h3>Selected: {selectedSong.name}</h3>
          <div className="song-metadata">
            <div className="metadata-item">
              <span className="label">Duration:</span>
              <span className="value">{selectedSong.reference_data?.duration?.toFixed(1)}s</span>
            </div>
            <div className="metadata-item">
              <span className="label">Tempo:</span>
              <span className="value">{selectedSong.reference_data?.tempo?.toFixed(1)} BPM</span>
            </div>
            <div className="metadata-item">
              <span className="label">Key:</span>
              <span className="value">{selectedSong.reference_data?.key}</span>
            </div>
            <div className="metadata-item">
              <span className="label">Phrases:</span>
              <span className="value">{selectedSong.reference_data?.phrases?.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
