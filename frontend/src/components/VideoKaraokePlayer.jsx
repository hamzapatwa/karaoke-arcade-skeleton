import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Video-based karaoke player with requestVideoFrameCallback for precise timing.
 *
 * Plays MP4/WebM karaoke videos with baked-in lyrics.
 * Uses requestVideoFrameCallback for frame-accurate timing (better than timeupdate).
 * Provides timebase for LiveHUD synchronization.
 */

const VideoKaraokePlayer = ({
  songData,
  apiBase,
  onTimeUpdate,
  onStartSession,
  onSessionComplete,
  isSessionActive,
  onSessionToggle
}) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [videoReady, setVideoReady] = useState(false);
  const frameCallbackId = useRef(null);
  const isSessionActiveRef = useRef(isSessionActive);
  const audioRef = useRef(null);
  const [vocalsEnabled, setVocalsEnabled] = useState(false);
  const [videoOffset, setVideoOffset] = useState(0);
  const videoOffsetRef = useRef(0);

  // Update refs when props change
  useEffect(() => {
    videoOffsetRef.current = videoOffset;
    isSessionActiveRef.current = isSessionActive;

    // Sync audio immediately if playing
    if (vocalsEnabled && audioRef.current && videoRef.current && videoOffset !== 0) {
      const targetTime = videoRef.current.currentTime + videoOffset;
      if (targetTime >= 0 && targetTime < audioRef.current.duration) {
        audioRef.current.currentTime = targetTime;
      }
    }
  }, [videoOffset, isSessionActive, vocalsEnabled]);

  // Video source URL
  const videoSrc = songData?.karaoke_video
    ? `${apiBase}${songData.karaoke_video.startsWith('/') ? '' : '/'}${songData.karaoke_video}`
    : null;

  // Reference vocals URL (optional)
  const vocalsSrc = songData?.reference_vocals
    ? `${apiBase}${songData.reference_vocals.startsWith('/') ? '' : '/'}${songData.reference_vocals}`
    : null;

  /**
   * Frame-accurate time update using requestVideoFrameCallback
   * This provides better timing precision than timeupdate events
   */
  const updateVideoTime = useCallback((now, metadata) => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const time = metadata ? metadata.mediaTime : video.currentTime;
    const effectiveTime = Math.max(0, time + videoOffsetRef.current);

    setCurrentTime(time);

    // Notify parent component (LiveHUD) of time update
    if (onTimeUpdate) {
      onTimeUpdate(effectiveTime);
    }

    // Keep vocals in sync (check drift every ~5 frames to reduce overhead)
    if (vocalsEnabled && audioRef.current && !audioRef.current.paused && Math.random() < 0.2) {
      const audioTime = audioRef.current.currentTime;
      if (Math.abs(audioTime - effectiveTime) > 0.1) {
        audioRef.current.currentTime = effectiveTime;
      }
    }

    // Schedule next frame update
    if (!video.paused && !video.ended && video.requestVideoFrameCallback) {
      frameCallbackId.current = video.requestVideoFrameCallback(updateVideoTime);
    }
  }, [onTimeUpdate, vocalsEnabled]);

  /**
   * Fallback time update using timeupdate event
   * Used when requestVideoFrameCallback is not available or as backup
   */
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const effectiveTime = Math.max(0, video.currentTime + videoOffsetRef.current);

    setCurrentTime(video.currentTime);

    if (onTimeUpdate) {
      onTimeUpdate(effectiveTime);
    }
  }, [onTimeUpdate]);

  /**
   * Initialize video frame callback when video is ready
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setVideoReady(true);
      console.log('Video ready:', video.duration, 'seconds');
    };

    const handlePlay = () => {
      setIsPlaying(true);

      // Start frame callback loop if supported, otherwise use timeupdate
      if (video.requestVideoFrameCallback) {
        frameCallbackId.current = video.requestVideoFrameCallback(updateVideoTime);
      }

      // Sync vocals playback
      if (vocalsEnabled && audioRef.current) {
        const startParams = video.currentTime + videoOffsetRef.current;
        audioRef.current.currentTime = Math.max(0, startParams);
        audioRef.current.play().catch(() => {});
      }
    };

    const handlePause = () => {
      setIsPlaying(false);

      // Cancel frame callback
      if (frameCallbackId.current !== null && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameCallbackId.current);
        frameCallbackId.current = null;
      }

      // Pause vocals
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);

      // End session when video ends
      if (isSessionActiveRef.current && onSessionToggle) {
        onSessionToggle(false);
      }

      // Stop vocals
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate); // Fallback for time updates

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);

      // Cancel frame callback on cleanup
      if (frameCallbackId.current !== null && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameCallbackId.current);
      }
    };
  }, [updateVideoTime, handleTimeUpdate, isSessionActive, onSessionToggle, vocalsEnabled]);

  /**
   * Set video volume
   */
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  /**
   * Play/Pause toggle
   */
  const togglePlayPause = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.paused) {
        // Ensure video is not muted
        if (video.muted) {
          console.warn('Video was muted, unmuting...');
          video.muted = false;
        }
        await video.play();
        console.log('Video play started successfully');
      } else {
        video.pause();
        console.log('Video paused');
      }
    } catch (error) {
      console.error('Video play/pause error:', error);
      alert(`Video playback error: ${error.message}`);
    }
  }, []);

  /**
   * Seek to position
   */
  const handleSeek = useCallback((e) => {
    const video = videoRef.current;
    if (!video) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    const time = percentage * duration;
    const effectiveTime = Math.max(0, time + videoOffsetRef.current);

    video.currentTime = time;
    setCurrentTime(time);

    if (onTimeUpdate) {
      onTimeUpdate(effectiveTime);
    }

    // Keep vocals in sync
    if (audioRef.current) {
      audioRef.current.currentTime = effectiveTime;
      if (vocalsEnabled && !video.paused) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [duration, onTimeUpdate, vocalsEnabled]);

  /**
   * Start/Stop session
   */
  const handleSessionToggle = async () => {
    if (!isSessionActiveRef.current) {
      // Start session
      if (onStartSession) {
        await onStartSession();
      }

      if (onSessionToggle) {
        onSessionToggle(true);
      }

      // Auto-play video when session starts
      if (videoRef.current && videoRef.current.paused) {
        try {
          // Ensure video is not muted before playing
          if (videoRef.current.muted) {
            console.warn('Video was muted on session start, unmuting...');
            videoRef.current.muted = false;
          }
          await videoRef.current.play();
          console.log('Auto-play started for session');
        } catch (error) {
          console.error('Auto-play failed:', error);
          alert(`Auto-play failed: ${error.message}. Please click play manually.`);
        }
      }
    } else {
      // Stop session
      if (onSessionToggle) {
        onSessionToggle(false);
      }

      // Pause video
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }

      // Pause vocals if playing
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  };

  /**
   * Format time as MM:SS
   */
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!songData) {
    return (
      <div className="video-karaoke-player">
        <div className="no-song">
          <p>No song selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="video-karaoke-player">
      {/* Video Display */}
      <div className="video-container">
        <video
          ref={videoRef}
          className="karaoke-video"
          src={videoSrc}
          crossOrigin="anonymous"
          playsInline
          preload="auto"
        >
          Your browser does not support the video tag.
        </video>

        {/* Overlay Controls (show on hover) */}
        <div className="video-overlay">
          <button
            className="play-pause-overlay"
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="playback-controls">
        {/* Progress Bar */}
        <div className="progress-section">
          <span className="time-display">{formatTime(currentTime)}</span>

          <div
            className="progress-bar"
            onClick={handleSeek}
          >
            <div
              className="progress-fill"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>

          <span className="time-display">{formatTime(duration)}</span>
        </div>

        {/* Control Buttons */}
        <div className="control-buttons">
          <button
            className="control-btn"
            onClick={togglePlayPause}
            disabled={!videoReady}
          >
            {isPlaying ? '⏸️ PAUSE' : '▶️ PLAY'}
          </button>

          <button
            className={`control-btn ${isSessionActive ? 'active' : ''}`}
            onClick={handleSessionToggle}
            disabled={!videoReady}
          >
            {isSessionActive ? '⏹️ STOP SESSION' : '🎤 START SESSION'}
          </button>

          <div className="volume-control">
            <span className="volume-icon">🔊</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="volume-slider"
            />
          </div>

          <div className="sync-control">
            <span className="sync-icon" title="Video/Vocals Sync Offset">⏱️</span>
            <span className="sync-label">{videoOffset > 0 ? '+' : ''}{videoOffset.toFixed(2)}s</span>
            <input
              type="range"
              min="-3"
              max="3"
              step="0.05"
              value={videoOffset}
              onChange={(e) => setVideoOffset(parseFloat(e.target.value))}
              className="sync-slider"
            />
          </div>

          {vocalsSrc && (
            <button
              className={`control-btn ${vocalsEnabled ? 'active' : ''}`}
              onClick={() => {
                const next = !vocalsEnabled;
                setVocalsEnabled(next);
                if (audioRef.current) {
                  audioRef.current.currentTime = Math.max(0, (videoRef.current?.currentTime || 0) + videoOffsetRef.current);
                  if (next && !videoRef.current?.paused) {
                    audioRef.current.play().catch(() => {});
                  } else {
                    audioRef.current.pause();
                  }
                }
              }}
              disabled={!videoReady}
            >
              {vocalsEnabled ? '🔇 MUTE REF' : '🔈 PLAY REF'}
            </button>
          )}
        </div>

        {/* Song Info */}
        <div className="song-info">
          <h3>{songData.name || songData.song_name || songData.title || 'Untitled Song'}</h3>
          <div className="song-metadata">
            {songData.reference_data?.tempo && (
              <span className="metadata-item">
                ♩ {Math.round(songData.reference_data.tempo)} BPM
              </span>
            )}
            {songData.reference_data?.key && (
              <span className="metadata-item">
                🎹 {songData.reference_data.key}
              </span>
            )}
            {songData.reference_data?.duration && (
              <span className="metadata-item">
                ⏱️ {Math.floor(songData.reference_data.duration / 60)}:
                {String(Math.floor(songData.reference_data.duration % 60)).padStart(2, '0')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hidden audio element for reference vocals */}
      {vocalsSrc && (
        <audio ref={audioRef} src={vocalsSrc} crossOrigin="anonymous" />
      )}
    </div>
  );
};

export default VideoKaraokePlayer;

