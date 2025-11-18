import React, { useState, useEffect } from 'react';

export default function Leaderboard({ apiBase, onBack, onNewSession }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const response = await fetch(`${apiBase}/leaderboard?limit=20`);
      const data = await response.json();
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const getScoreColor = (score) => {
    if (score >= 90) return '#39ff14';
    if (score >= 80) return '#ffd700';
    if (score >= 70) return '#ff9500';
    return '#ff3d00';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="leaderboard-container">
        <div className="loading">
          <div className="spinner"></div>
          <h2>LOADING LEADERBOARD...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <h1 className="neon-title">🏆 LEADERBOARD 🏆</h1>
        <p className="leaderboard-subtitle">Top performers in the arcade!</p>
      </div>

      <div className="leaderboard-content">
        {leaderboard.length === 0 ? (
          <div className="empty-leaderboard">
            <h2>🎤 NO SCORES YET</h2>
            <p>Be the first to submit a score!</p>
            <button className="retro-button large" onClick={onNewSession}>
              START SINGING
            </button>
          </div>
        ) : (
          <div className="leaderboard-list">
            {leaderboard.map((entry, index) => (
              <div key={entry.id} className={`leaderboard-entry ${index < 3 ? 'top-three' : ''}`}>
                <div className="rank">
                  <span className="rank-icon">{getRankIcon(index + 1)}</span>
                </div>

                <div className="player-info">
                  <h3 className="player-name">{entry.player_name}</h3>
                  <p className="play-date">{formatDate(entry.played_at)}</p>
                </div>

                <div className="score-info">
                  <div
                    className="total-score"
                    style={{ color: getScoreColor(entry.total_score) }}
                  >
                    {Math.round(entry.total_score)}
                  </div>
                  <div className="score-breakdown">
                    <span>P: {Math.round(entry.pitch_score)}</span>
                    <span>E: {Math.round(entry.energy_score)}</span>
                  </div>
                </div>

                <div className="badges">
                  {entry.badges && entry.badges.length > 0 && (
                    <div className="badge-list">
                      {entry.badges.map((badge, badgeIndex) => (
                        <span key={badgeIndex} className="badge-mini">
                          {badge.name === 'Combo King' && '👑'}
                          {badge.name === 'Mic Melter' && '🔥'}
                          {badge.name === 'Smooth Operator' && '🎵'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="leaderboard-actions">
        <button className="retro-button" onClick={onBack}>
          ← BACK TO RESULTS
        </button>
        <button className="retro-button" onClick={onNewSession}>
          🎵 NEW SONG
        </button>
        <button className="retro-button" onClick={loadLeaderboard}>
          🔄 REFRESH
        </button>
      </div>

      <div className="leaderboard-stats">
        <div className="stat">
          <span className="stat-label">TOTAL PLAYERS</span>
          <span className="stat-value">{leaderboard.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">HIGHEST SCORE</span>
          <span className="stat-value">
            {leaderboard.length > 0 ? Math.round(leaderboard[0].total_score) : 0}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">AVERAGE SCORE</span>
          <span className="stat-value">
            {leaderboard.length > 0
              ? Math.round(leaderboard.reduce((sum, entry) => sum + entry.total_score, 0) / leaderboard.length)
              : 0
            }
          </span>
        </div>
      </div>
    </div>
  );
}
