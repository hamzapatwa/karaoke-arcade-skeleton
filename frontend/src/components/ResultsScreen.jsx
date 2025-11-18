import React, { useState, useEffect } from 'react';
import Leaderboard from './Leaderboard';

export default function ResultsScreen({ sessionId, results: propResults, apiBase, onNewSession, playerName, onPlayerNameChange }) {
  const [results, setResults] = useState(propResults || null);
  const [loading, setLoading] = useState(!propResults && !!sessionId);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (propResults) {
      setResults(propResults);
      setLoading(false);
    } else if (sessionId) {
      loadResults();
    }
  }, [sessionId, propResults]);

  const loadResults = async () => {
    try {
      const response = await fetch(`${apiBase}/sessions/${sessionId}/results`);
      const data = await response.json();
      setResults(data.results || data);
    } catch (error) {
      console.error('Failed to load results:', error);
    } finally {
      setLoading(false);
    }
  };

  const submitToLeaderboard = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name!');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/leaderboard/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          player_name: playerName,
          scores: results.totals,
          badges: results.badges
        })
      });

      if (response.ok) {
        setSubmitted(true);
        setShowLeaderboard(true);
      }
    } catch (error) {
      console.error('Failed to submit to leaderboard:', error);
      alert('Failed to submit to leaderboard');
    }
  };

  const getScoreColor = (score) => {
    if (score >= 90) return '#39ff14'; // Green
    if (score >= 70) return '#ffd700'; // Gold
    if (score >= 50) return '#ff9500'; // Orange
    return '#ff3d00'; // Red
  };

  const getScoreGrade = (score) => {
    if (score >= 95) return 'S+';
    if (score >= 90) return 'S';
    if (score >= 85) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 75) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 65) return 'C+';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  };

  if (loading) {
    return (
      <div className="results-container">
        <div className="loading">
          <div className="spinner"></div>
          <h2>CALCULATING RESULTS...</h2>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="results-container">
        <div className="error">
          <h2>❌ RESULTS NOT FOUND</h2>
          <button className="retro-button" onClick={onNewSession}>
            START NEW SESSION
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="results-container">
      {!showLeaderboard ? (
        <>
          {/* Results Header */}
          <div className="results-header">
            <h1 className="neon-title">🎤 PERFORMANCE COMPLETE! 🎤</h1>
            <div className="final-score">
              <span className="score-label">FINAL SCORE</span>
              <span
                className="score-value"
                style={{ color: getScoreColor(results.totals.total) }}
              >
                {Math.round(results.totals.total)}
              </span>
              <span
                className="score-grade"
                style={{ color: getScoreColor(results.totals.total) }}
              >
                {getScoreGrade(results.totals.total)}
              </span>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="score-breakdown">
            <h2>SCORE BREAKDOWN</h2>
            <div className="score-grid">
              <div className="score-item">
                <span className="score-label">PITCH</span>
                <div className="score-bar">
                  <div
                    className="score-fill pitch"
                    style={{ width: `${results.totals.pitch}%` }}
                  ></div>
                </div>
                <span className="score-value">{Math.round(results.totals.pitch)}</span>
              </div>

              <div className="score-item">
                <span className="score-label">ENERGY</span>
                <div className="score-bar">
                  <div
                    className="score-fill energy"
                    style={{ width: `${results.totals.energy}%` }}
                  ></div>
                </div>
                <span className="score-value">{Math.round(results.totals.energy)}</span>
              </div>
            </div>
          </div>

          {/* Badges */}
          {results.badges && results.badges.length > 0 && (
            <div className="badges-section">
              <h2>🏆 BADGES EARNED 🏆</h2>
              <div className="badges-grid">
                {results.badges.map((badge, index) => (
                  <div key={index} className="badge">
                    <div className="badge-icon">
                      {badge.name === 'Combo King' && '👑'}
                      {badge.name === 'Mic Melter' && '🔥'}
                      {badge.name === 'Smooth Operator' && '🎵'}
                    </div>
                    <div className="badge-info">
                      <h3>{badge.name}</h3>
                      <p>{badge.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts */}
          {results.graphs && (
            <div className="charts-section">
              <h2>📊 PERFORMANCE ANALYSIS</h2>

              <div className="chart-container">
                <h3>Pitch Timeline</h3>
                <div className="chart">
                  <svg width="100%" height="200" className="pitch-chart">
                    {results.graphs.pitchTimeline.map((point, index) => {
                      const maxTime = Math.max(...results.graphs.pitchTimeline.map(p => p.time || 0)) || 1;
                      const x = ((point.time || 0) / maxTime) * 100;
                      const y = 100 - ((point.score || 0) / 100) * 80;
                      return (
                        <circle
                          key={index}
                          cx={`${x}%`}
                          cy={`${y}%`}
                          r="2"
                          fill="#39ff14"
                          opacity="0.7"
                        />
                      );
                    })}
                  </svg>
                </div>
              </div>

              <div className="chart-container">
                <h3>Energy Graph</h3>
                <div className="chart">
                  <svg width="100%" height="200" className="energy-chart">
                    <polyline
                      points={(() => {
                        const maxTime = Math.max(...results.graphs.energyGraph.map(p => p.time || 0)) || 1;
                        return results.graphs.energyGraph.map((point) =>
                          `${((point.time || 0) / maxTime) * 100}%,${100 - (point.energy || 0) * 100}%`
                        ).join(' ');
                      })()}
                      fill="none"
                      stroke="#ff00e6"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>

            </div>
          )}

          {/* Phrase Breakdown */}
          {results.perPhrase && results.perPhrase.length > 0 && (
            <div className="phrases-section">
              <h2>🎵 PHRASE BREAKDOWN</h2>
              <div className="phrases-grid">
                {results.perPhrase.map((phrase, index) => (
                  <div key={index} className="phrase-item">
                    <div className="phrase-header">
                      <span className="phrase-number">Phrase {phrase.phrase + 1}</span>
                      <span className="phrase-time">
                        {phrase.start.toFixed(1)}s - {phrase.end.toFixed(1)}s
                      </span>
                    </div>
                    <div className="phrase-scores">
                      <span>Pitch: {Math.round(phrase.pitchScore)}</span>
                      <span>Energy: {Math.round(phrase.energyScore)}</span>
                    </div>
                    <div className="phrase-total">
                      Total: {Math.round(phrase.totalScore)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leaderboard Submission */}
          {!submitted && (
            <div className="leaderboard-submission">
              <h2>🏆 SUBMIT TO LEADERBOARD</h2>
              <div className="submission-form">
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => onPlayerNameChange(e.target.value)}
                  className="name-input"
                  maxLength={20}
                />
                <button
                  className="retro-button large"
                  onClick={submitToLeaderboard}
                  disabled={!playerName.trim()}
                >
                  SUBMIT SCORE
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="results-actions">
            <button className="retro-button" onClick={onNewSession}>
              🎵 NEW SONG
            </button>
            <button
              className="retro-button"
              onClick={() => setShowLeaderboard(true)}
            >
              📊 LEADERBOARD
            </button>
          </div>
        </>
      ) : (
        <Leaderboard
          apiBase={apiBase}
          onBack={() => setShowLeaderboard(false)}
          onNewSession={onNewSession}
        />
      )}
    </div>
  );
}
