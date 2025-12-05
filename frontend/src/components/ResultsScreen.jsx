import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

  const loadResults = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/sessions/${sessionId}/results`);
      const data = await response.json();
      setResults(data.results || data);
    } catch (error) {
      console.error('Failed to load results:', error);
    } finally {
      setLoading(false);
    }
  }, [apiBase, sessionId]);

  const submitToLeaderboard = useCallback(async () => {
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
  }, [apiBase, sessionId, playerName, results]);

  // Memoize score calculations
  const getScoreColor = useCallback((score) => {
    if (score >= 90) return '#39ff14';
    if (score >= 70) return '#ffd700';
    if (score >= 50) return '#ff9500';
    return '#ff3d00';
  }, []);

  const getScoreGrade = useCallback((score) => {
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
  }, []);

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
                  <svg width="100%" height="200" viewBox="0 0 1000 100" preserveAspectRatio="none" className="pitch-chart">
                    {useMemo(() => {
                      const pitchData = results.graphs.pitchTimeline || [];
                      if (pitchData.length === 0) return null;

                      const times = pitchData.map(p => p.time || 0);
                      const maxTime = Math.max(...times) || 1;
                      const minTime = Math.min(...times) || 0;
                      const timeRange = maxTime - minTime;
                      const useIndex = timeRange < 2;

                      return pitchData.map((point, index) => {
                        const x = useIndex
                          ? (index / (pitchData.length - 1 || 1)) * 1000
                          : ((point.time - minTime) / timeRange) * 1000;
                        const y = 90 - ((point.score || 0) / 100) * 80;
                        return (
                          <circle
                            key={index}
                            cx={x}
                            cy={y}
                            r="3"
                            fill="#39ff14"
                            opacity="0.7"
                          />
                        );
                      });
                    }, [results])}
                  </svg>
                </div>
              </div>

              <div className="chart-container">
                <h3>Energy Graph</h3>
                <div className="chart">
                  <svg width="100%" height="200" viewBox="0 0 1000 100" preserveAspectRatio="none" className="energy-chart">
                    {useMemo(() => {
                      const energyData = results.graphs.energyGraph || [];
                      if (energyData.length === 0) return null;

                      const times = energyData.map(p => p.time || 0);
                      const energies = energyData.map(p => p.energy || 0);
                      const maxTime = Math.max(...times) || 1;
                      const minTime = Math.min(...times) || 0;
                      const timeRange = maxTime - minTime;
                      const maxEnergy = Math.max(...energies) || 1;
                      const useIndex = timeRange < 2;

                      const points = energyData.map((point, index) => {
                        const x = useIndex
                          ? (index / (energyData.length - 1 || 1)) * 1000
                          : ((point.time - minTime) / timeRange) * 1000;
                        const normalizedEnergy = (point.energy || 0) / maxEnergy;
                        const y = 90 - (normalizedEnergy * 80);
                        return `${x},${y}`;
                      }).join(' ');

                      return (
                        <polyline
                          points={points}
                          fill="none"
                          stroke="#ff00e6"
                          strokeWidth="2"
                        />
                      );
                    }, [results])}
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
