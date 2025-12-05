import React, { useState, useEffect, useRef } from 'react';

export default function MicCheck({ onComplete }) {
  const [micPermission, setMicPermission] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (microphoneRef.current) microphoneRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      microphoneRef.current = stream;
      setMicPermission(true);
      setupAudioAnalysis(stream);
    } catch (error) {
      console.error('Microphone access denied:', error);
      setMicPermission(false);
    }
  };

  const setupAudioAnalysis = (stream) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();

      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      startAudioLevelMonitoring();
    } catch (error) {
      console.error('Audio analysis setup failed:', error);
    }
  };

  const startAudioLevelMonitoring = () => {
    const freqArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    const timeArray = new Uint8Array(analyserRef.current.fftSize);

    const updateLevel = () => {
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freqArray);
        analyserRef.current.getByteTimeDomainData(timeArray);

        // Frequency-domain RMS
        let sumFreq = 0;
        for (let i = 0; i < freqArray.length; i++) {
          sumFreq += freqArray[i] * freqArray[i];
        }
        const rmsFreq = Math.sqrt(sumFreq / freqArray.length);

        // Time-domain RMS
        let sumTime = 0;
        for (let i = 0; i < timeArray.length; i++) {
          const centered = timeArray[i] - 128;
          sumTime += centered * centered;
        }
        const rmsTime = Math.sqrt(sumTime / timeArray.length);

        // Combine and normalize
        const rms = Math.max(rmsFreq * 0.5, rmsTime);
        const normalizedLevel = Math.min(rms / 32, 1);
        const displayLevel = Math.max(normalizedLevel, 0.02);

        setAudioLevel(displayLevel);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      }
    };

    updateLevel();
  };

  const startListening = () => setIsListening(true);
  const stopListening = () => setIsListening(false);
  const proceedToLive = () => onComplete();

  const getAudioLevelColor = () => {
    if (audioLevel < 0.1) return '#ff3d00'; // Red - too quiet
    if (audioLevel < 0.3) return '#ffd700'; // Yellow - getting there
    if (audioLevel < 0.7) return '#39ff14'; // Green - good
    return '#ff00e6'; // Pink - too loud
  };

  const getAudioLevelText = () => {
    if (audioLevel < 0.1) return 'TOO QUIET';
    if (audioLevel < 0.3) return 'GETTING THERE';
    if (audioLevel < 0.7) return 'PERFECT';
    return 'TOO LOUD';
  };

  return (
    <div className="mic-check-container">
      <div className="mic-check-header">
        <h2 className="neon-text">🎤 MIC CHECK 🎤</h2>
        <p>Let's make sure everything is working perfectly!</p>
      </div>

      <div className="mic-check-content">
        {/* Microphone Section */}
        <div className="mic-section">
          <h3>Microphone</h3>

          {micPermission === null && (
            <button
              className="retro-button large"
              onClick={requestMicPermission}
            >
              🎤 ENABLE MICROPHONE
            </button>
          )}

          {micPermission === false && (
            <div className="permission-denied">
              <p>❌ Microphone access denied</p>
              <p>Please allow microphone access to continue</p>
              <button
                className="retro-button"
                onClick={requestMicPermission}
              >
                TRY AGAIN
              </button>
            </div>
          )}

          {micPermission === true && (
            <div className="mic-status">
              <div className="audio-level-display">
                <div
                  className="audio-level-bar"
                  style={{
                    height: `${audioLevel * 100}%`,
                    backgroundColor: getAudioLevelColor()
                  }}
                ></div>
              </div>

              <div className="audio-level-info">
                <p className={`level-text ${getAudioLevelText().replace(' ', '-').toLowerCase()}`}>
                  {getAudioLevelText()}
                </p>
                <p className="level-value">{(audioLevel * 100).toFixed(0)}%</p>
              </div>

              <div className="mic-controls">
                {!isListening ? (
                  <button
                    className="retro-button"
                    onClick={startListening}
                  >
                    🎵 START LISTENING
                  </button>
                ) : (
                  <button
                    className="retro-button"
                    onClick={stopListening}
                  >
                    ⏹️ STOP LISTENING
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="instructions">
          <h4>Instructions:</h4>
          <ul>
            <li>🎤 Enable microphone and test your audio levels</li>
            <li>🎵 Sing a few notes to test your setup</li>
            <li>✨ When ready, proceed to the live performance!</li>
          </ul>
        </div>

        {/* Proceed Button */}
        {micPermission === true && (
          <div className="proceed-section">
            <button
              className="retro-button large proceed"
              onClick={proceedToLive}
              disabled={audioLevel < 0.02}
            >
              🚀 START PERFORMANCE
            </button>
            {audioLevel < 0.02 && (
              <p className="warning">⚠️ Please test your microphone first</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
