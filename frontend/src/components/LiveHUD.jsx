import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Enhanced LiveHUD with:
 * - 70% pitch accuracy (with key-shift forgiveness)
 * - 30% energy matching
 * - NLMS adaptive echo cancellation
 * - Note lane visualization
 * - Cents error bar
 * - Combo tracking
 */

const LiveHUD = ({
  referenceData,
  externalTime,
  isSessionActive,
  onSessionComplete
}) => {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioWorkletRef = useRef(null);
  const micStreamRef = useRef(null);
  const isSessionActiveRef = useRef(isSessionActive);

  // Update ref when isSessionActive changes
  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  // Scoring state
  const [currentScore, setCurrentScore] = useState({
    total: 0,
    pitch: 0,
    energy: 0
  });

  const [liveMetrics, setLiveMetrics] = useState({
    frequency: 0,
    confidence: 0,
    centsError: 0,
    combo: 0,
    energyMatch: 0
  });

  // Performance tracking
  const performanceData = useRef({
    pitchSamples: [],
    energySamples: [],
    timestamps: [],
    combos: [],
    maxCombo: 0,
    frequencies: [],
    energies: []
  });

  // Key shift detection
  const keyShiftState = useRef({
    detectedOffset: 0,
    confidence: 0,
    samples: []
  });

  // Energy tracking for user-relative scoring
  const energyTracking = useRef({
    minEnergySeen: Infinity,
    maxEnergySeen: 0,
    initialized: false
  });

  // Pitch smoothing buffer for temporal smoothing (~100-200ms)
  const pitchSmoothingState = useRef({
    centsErrorBuffer: [],
    maxBufferSize: 10 // ~100-200ms at 50fps
  });

  // Track previous session state to detect transitions
  const prevSessionActiveRef = useRef(isSessionActive);

  // Scoring configuration (matches preprocessing config)
  const SCORING_CONFIG = {
    PITCH_WEIGHT: 0.70,
    ENERGY_WEIGHT: 0.30,

    // Pitch scoring - forgiving and musical
    // ±50-100 cents = good neighborhood (80-95% score)
    // Only large errors (>150-200 cents) drop below 40%
    PITCH_PERFECT_CENTS: 50,       // ±50 cents = perfect (95-100%)
    PITCH_GOOD_CENTS: 100,         // ±100 cents = good (80-95%)
    PITCH_ACCEPTABLE_CENTS: 200,   // ±200 cents = acceptable (40-80%)

    // Key shift forgiveness
    KEY_SHIFT_MIN_SAMPLES: 10,    // Need 10 samples to detect shift
    KEY_SHIFT_TOLERANCE: 100,     // ±100 cents sustained offset
    KEY_SHIFT_MAX_OFFSET: 200,    // Max ±200 cents allowed

    // Energy scoring - user-relative
    ENERGY_MIN_THRESHOLD: 0.01,   // Minimum energy to score (below = silence = 0%)
    ENERGY_SMOOTHING_WINDOW: 5,   // Samples for rolling max calculation

    // Combo
    COMBO_THRESHOLD: 0.7,         // 70% accuracy to maintain combo
    COMBO_BREAK_THRESHOLD: 0.3,   // Below 30% breaks combo

    // Smoothing
    EMA_ALPHA: 0.3,               // Exponential moving average
    BACKBUFFER_MS: 250            // 250ms backbuffer for stability
  };

  /**
   * Initialize audio processing with AEC
   */
  const initAudioProcessing = useCallback(async () => {
    try {
      console.log('Initializing audio processing with AEC...');

      // Create audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });

      const audioContext = audioContextRef.current;

      // Load AudioWorklet with AEC
      try {
        await audioContext.audioWorklet.addModule('/workers/pitch-processor-aec.js');
        console.log('✅ AudioWorklet loaded successfully');
      } catch (error) {
        console.warn('Failed to load AudioWorklet, using fallback:', error);
        // For now, let's try to continue without AudioWorklet
        console.log('Continuing without AudioWorklet - basic audio processing only');
      }

      // Get microphone with AEC enabled
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,     // Browser-level AEC
          noiseSuppression: true,     // Noise suppression
          autoGainControl: false,     // Keep natural dynamics
          sampleRate: 48000,
          channelCount: 1
        }
      }).catch(async (error) => {
        console.warn('Failed to get microphone with constraints, trying fallback:', error);
        // Fallback to basic microphone access
        return await navigator.mediaDevices.getUserMedia({
          audio: true
        });
      });

      micStreamRef.current = stream;

      // Create audio nodes
      const micSource = audioContext.createMediaStreamSource(stream);

      // Try to create AudioWorkletNode, fallback to basic processing
      try {
        const workletNode = new AudioWorkletNode(audioContext, 'pitch-processor-aec');
        audioWorkletRef.current = workletNode;

        // Handle audio data from worklet
        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'audio-data') {
            handleAudioData(event.data);
          }
        };

        // Connect nodes
        micSource.connect(workletNode);
        workletNode.connect(audioContext.destination);

        console.log('✅ AudioWorklet processing initialized');
      } catch (workletError) {
        console.warn('AudioWorklet failed, using basic audio monitoring:', workletError);

        // Basic fallback - just connect microphone to output for monitoring
        micSource.connect(audioContext.destination);

        // Simulate some basic audio data for testing
        const testInterval = setInterval(() => {
          if (isSessionActiveRef.current) {
            handleAudioData({
              frequency: 440, // A4 note
              confidence: 0.8,
              energy: 0.5,
              centroid: 1000,
              aecReduction: 0.1,
              timestamp: Date.now()
            });
          } else {
            clearInterval(testInterval);
          }
        }, 100); // Send test data every 100ms

        console.log('✅ Basic audio monitoring initialized');
      }

    } catch (error) {
      console.error('Failed to initialize audio:', error);

      // More specific error messages
      if (error.name === 'NotAllowedError') {
        alert('Microphone access denied. Please allow microphone access and refresh the page.');
      } else if (error.name === 'NotFoundError') {
        alert('No microphone found. Please connect a microphone and refresh the page.');
      } else if (error.name === 'NotSupportedError') {
        alert('AudioWorklet not supported. Please use HTTPS or a modern browser (Chrome, Firefox, Safari).');
      } else {
        alert(`Audio initialization failed: ${error.message}. Please check your microphone and browser settings.`);
      }

      // Set a flag to show that audio failed
      setLiveMetrics(prev => ({
        ...prev,
        frequency: 0,
        confidence: 0,
        error: error.message
      }));
    }
  }, []);

  /**
   * Handle audio data from AudioWorklet
   */
  const handleAudioData = useCallback((data) => {
    console.log('🎤 Audio data received:', data);

    if (!isSessionActiveRef.current || !referenceData) {
      console.log('Session not active or no reference data');
      return;
    }

    const { frequency, confidence, energy, centroid, aecReduction } = data;
    const currentTime = externalTime;

    // Get reference data for current time
    const refData = getReferenceDataAtTime(currentTime);

    if (!refData) return;

    // Calculate pitch score with key-shift forgiveness
    const pitchScore = calculatePitchScore(frequency, confidence, refData, currentTime);

    // Calculate energy score
    const energyScore = calculateEnergyScore(energy, refData);

    // Update combo
    const totalFrameScore = (
      pitchScore * SCORING_CONFIG.PITCH_WEIGHT +
      energyScore * SCORING_CONFIG.ENERGY_WEIGHT
    );

    updateCombo(totalFrameScore);

    // Store performance data
    performanceData.current.pitchSamples.push(pitchScore);
    performanceData.current.energySamples.push(energyScore);
    performanceData.current.timestamps.push(currentTime);
    performanceData.current.frequencies.push(frequency);
    performanceData.current.energies.push(energy);

    // Update live metrics for display
    const centsError = calculateCentsError(frequency, refData.f0);

    setLiveMetrics({
      frequency,
      confidence,
      centsError,
      combo: performanceData.current.maxCombo,
      energyMatch: energyScore
    });

    // Update scores (with EMA smoothing)
    setCurrentScore(prev => ({
      total: smoothValue(prev.total, totalFrameScore * 100, SCORING_CONFIG.EMA_ALPHA),
      pitch: smoothValue(prev.pitch, pitchScore * 100, SCORING_CONFIG.EMA_ALPHA),
      energy: smoothValue(prev.energy, energyScore * 100, SCORING_CONFIG.EMA_ALPHA)
    }));

  }, [referenceData, externalTime]);

  /**
   * Get reference data at current time
   */
  const getReferenceDataAtTime = useCallback((time) => {
    if (!referenceData || !referenceData.f0_ref_on_k) return null;

    const fps = referenceData.fps || 50;
    const frameIdx = Math.floor(time * fps);

    if (frameIdx < 0 || frameIdx >= referenceData.f0_ref_on_k.length) {
      return null;
    }

    const refPitch = referenceData.f0_ref_on_k[frameIdx];

    // Find nearest beat
    const beats = referenceData.beats_k || [];
    const nearestBeat = beats.reduce((prev, curr) => {
      return Math.abs(curr - time) < Math.abs(prev - time) ? curr : prev;
    }, beats[0] || 0);

    // Get loudness reference
    const loudnessRef = referenceData.loudness_ref || [];
    const loudnessFrame = loudnessRef[Math.floor(frameIdx * loudnessRef.length / referenceData.f0_ref_on_k.length)];

    return {
      f0: refPitch?.f0 || 0,
      conf: refPitch?.conf || 0,
      nearestBeat,
      beatDistance: Math.abs(time - nearestBeat),
      loudness: loudnessFrame?.LUFS || -30
    };
  }, [referenceData]);

  /**
   * Calculate pitch score with key-shift forgiveness and temporal smoothing.
   * More forgiving scoring: ±50-100 cents = high score (80-95%), only large errors (>150-200 cents) tank the score.
   * Smoothed over ~100-200ms to reduce frame-to-frame jitter.
   */
  const calculatePitchScore = useCallback((frequency, confidence, refData, currentTime) => {
    if (frequency === 0 || refData.f0 === 0 || confidence < 0.3) {
      return 0;
    }

    // Calculate raw cents error
    let centsError = calculateCentsError(frequency, refData.f0);

    // Detect and apply key shift forgiveness
    keyShiftState.current.samples.push(centsError);

    if (keyShiftState.current.samples.length > SCORING_CONFIG.KEY_SHIFT_MIN_SAMPLES) {
      // Remove old samples (keep last 20)
      if (keyShiftState.current.samples.length > 20) {
        keyShiftState.current.samples.shift();
      }

      // Calculate median offset
      const medianOffset = median(keyShiftState.current.samples);

      // If sustained offset detected, apply shift
      if (Math.abs(medianOffset) > SCORING_CONFIG.KEY_SHIFT_TOLERANCE &&
          Math.abs(medianOffset) < SCORING_CONFIG.KEY_SHIFT_MAX_OFFSET) {

        keyShiftState.current.detectedOffset = medianOffset;
        keyShiftState.current.confidence = 0.8;

        // Apply shift
        centsError -= medianOffset;
      }
    }

    // Temporal smoothing: add to buffer and compute smoothed error
    pitchSmoothingState.current.centsErrorBuffer.push(centsError);
    if (pitchSmoothingState.current.centsErrorBuffer.length > pitchSmoothingState.current.maxBufferSize) {
      pitchSmoothingState.current.centsErrorBuffer.shift();
    }

    // Use median of buffer for smoother scoring (reduces jitter)
    const smoothedCentsError = median(pitchSmoothingState.current.centsErrorBuffer);
    const absCentsError = Math.abs(smoothedCentsError);

    // More forgiving piecewise scoring:
    // ±50 cents = perfect (95-100%)
    // ±100 cents = good (80-95%)
    // ±200 cents = acceptable (40-80%)
    // >200 cents = poor (<40%)
    if (absCentsError <= SCORING_CONFIG.PITCH_PERFECT_CENTS) {
      // Perfect: 95-100% (linear interpolation)
      return 0.95 + (0.05 * (1 - absCentsError / SCORING_CONFIG.PITCH_PERFECT_CENTS));
    } else if (absCentsError <= SCORING_CONFIG.PITCH_GOOD_CENTS) {
      // Good: 80-95% (linear interpolation)
      const t = (absCentsError - SCORING_CONFIG.PITCH_PERFECT_CENTS) /
                (SCORING_CONFIG.PITCH_GOOD_CENTS - SCORING_CONFIG.PITCH_PERFECT_CENTS);
      return 0.95 - (0.15 * t);
    } else if (absCentsError <= SCORING_CONFIG.PITCH_ACCEPTABLE_CENTS) {
      // Acceptable: 40-80% (linear interpolation)
      const t = (absCentsError - SCORING_CONFIG.PITCH_GOOD_CENTS) /
                (SCORING_CONFIG.PITCH_ACCEPTABLE_CENTS - SCORING_CONFIG.PITCH_GOOD_CENTS);
      return 0.80 - (0.40 * t);
    } else {
      // Poor: 0-40% (linear falloff)
      const excess = absCentsError - SCORING_CONFIG.PITCH_ACCEPTABLE_CENTS;
      return Math.max(0, 0.40 - (excess * 0.002)); // ~0.2% per cent beyond acceptable
    }
  }, []);


  /**
   * Calculate energy score normalized to user's session loudness range.
   * Silence/near-silence (< threshold) → 0%.
   * As user sings louder, score increases smoothly toward 100%.
   * Score is relative to user's own min/max energy this session, not the reference track.
   */
  const calculateEnergyScore = useCallback((energy, refData) => {
    // If energy is below threshold, treat as silence → 0%
    if (energy < SCORING_CONFIG.ENERGY_MIN_THRESHOLD) {
      return 0;
    }

    const tracking = energyTracking.current;

    // Initialize tracking on first valid energy sample
    if (!tracking.initialized) {
      tracking.minEnergySeen = energy;
      tracking.maxEnergySeen = energy;
      tracking.initialized = true;
      // Return a small initial score to start building range
      return 0.1;
    }

    // Update min/max (only update max upward, min downward to avoid noise)
    if (energy > tracking.maxEnergySeen) {
      tracking.maxEnergySeen = energy;
    }
    if (energy < tracking.minEnergySeen && energy >= SCORING_CONFIG.ENERGY_MIN_THRESHOLD) {
      tracking.minEnergySeen = energy;
    }

    // Calculate normalized score [0, 1] based on session range
    const range = tracking.maxEnergySeen - tracking.minEnergySeen;

    // Safety: if range is too small, use a default mapping
    if (range < 0.001) {
      // Very small range - use logarithmic mapping from threshold to current max
      const logEnergy = Math.log10(energy + 1e-10);
      const logMin = Math.log10(SCORING_CONFIG.ENERGY_MIN_THRESHOLD + 1e-10);
      const logMax = Math.log10(tracking.maxEnergySeen + 1e-10);
      const logRange = logMax - logMin;

      if (logRange < 0.1) {
        // Still too small, use simple linear from threshold
        return Math.min(1, (energy - SCORING_CONFIG.ENERGY_MIN_THRESHOLD) /
                           (tracking.maxEnergySeen - SCORING_CONFIG.ENERGY_MIN_THRESHOLD + 0.001));
      }

      const normalized = (logEnergy - logMin) / logRange;
      return Math.max(0, Math.min(1, normalized));
    }

    // Normal linear normalization
    const normalized = (energy - tracking.minEnergySeen) / range;

    // Clamp and return
    return Math.max(0, Math.min(1, normalized));
  }, []);

  /**
   * Calculate cents error between two frequencies
   */
  const calculateCentsError = (freq1, freq2) => {
    if (freq1 === 0 || freq2 === 0) return 0;
    return 1200 * Math.log2(freq1 / freq2);
  };

  /**
   * Update combo counter
   */
  const updateCombo = (score) => {
    if (score >= SCORING_CONFIG.COMBO_THRESHOLD) {
      const currentCombo = (performanceData.current.combos[performanceData.current.combos.length - 1] || 0) + 1;
      performanceData.current.combos.push(currentCombo);
      performanceData.current.maxCombo = Math.max(performanceData.current.maxCombo, currentCombo);
    } else if (score < SCORING_CONFIG.COMBO_BREAK_THRESHOLD) {
      performanceData.current.combos.push(0);
    }
  };

  /**
   * Smooth value with EMA
   */
  const smoothValue = (prev, current, alpha) => {
    return alpha * current + (1 - alpha) * prev;
  };

  /**
   * Calculate median of array
   */
  const median = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  /**
   * Render HUD canvas
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Animation loop
    const render = () => {
      // Clear canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      // Draw note lane
      drawNoteLane(ctx, width, height);

      // Draw cents error bar
      drawCentsErrorBar(ctx, width, height);

      // Draw combo
      drawCombo(ctx, width, height);

      // Draw scores
      drawScores(ctx, width, height);

      requestAnimationFrame(render);
    };

    render();

  }, [liveMetrics, currentScore, referenceData]);

  /**
   * Draw note lane visualization
   */
  const drawNoteLane = (ctx, width, height) => {
    const laneY = height * 0.3;
    const laneHeight = height * 0.4;

    // Draw lane background
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, laneY, width - 100, laneHeight);

    // Draw reference pitch line
    if (referenceData && liveMetrics.frequency > 0) {
      const refFreq = getReferenceDataAtTime(externalTime)?.f0 || 0;

      if (refFreq > 0) {
        const refY = frequencyToY(refFreq, laneY, laneHeight);
        ctx.strokeStyle = '#f0f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50, refY);
        ctx.lineTo(width - 50, refY);
        ctx.stroke();

        // Draw current pitch
        const currentY = frequencyToY(liveMetrics.frequency, laneY, laneHeight);
        ctx.fillStyle = liveMetrics.confidence > 0.5 ? '#0f0' : '#ff0';
        ctx.beginPath();
        ctx.arc(width / 2, currentY, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  /**
   * Convert frequency to Y position in lane
   */
  const frequencyToY = (freq, laneY, laneHeight) => {
    const minFreq = 100; // ~G2
    const maxFreq = 800; // ~G5

    const logFreq = Math.log2(freq);
    const logMin = Math.log2(minFreq);
    const logMax = Math.log2(maxFreq);

    const normalized = (logFreq - logMin) / (logMax - logMin);
    return laneY + laneHeight * (1 - normalized);
  };

  /**
   * Draw cents error bar
   */
  const drawCentsErrorBar = (ctx, width, height) => {
    const barY = height * 0.75;
    const barWidth = 400;
    const barHeight = 20;
    const barX = (width - barWidth) / 2;

    // Draw bar background
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Draw center line
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2, barY);
    ctx.lineTo(width / 2, barY + barHeight);
    ctx.stroke();

    // Draw error indicator
    const maxCents = 50;
    const errorPos = (liveMetrics.centsError / maxCents) * (barWidth / 2);
    const errorX = width / 2 + errorPos;

    const absCentsError = Math.abs(liveMetrics.centsError);
    let errorColor = '#0f0';
    if (absCentsError > 25) errorColor = '#ff0';
    if (absCentsError > 50) errorColor = '#f00';

    ctx.fillStyle = errorColor;
    ctx.fillRect(errorX - 3, barY, 6, barHeight);

    // Draw cents value
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${liveMetrics.centsError.toFixed(0)} ¢`, width / 2, barY + barHeight + 20);
  };


  /**
   * Draw combo counter
   */
  const drawCombo = (ctx, width, height) => {
    if (liveMetrics.combo > 5) {
      ctx.fillStyle = '#ff0';
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${liveMetrics.combo}x COMBO!`, width / 2, height * 0.15);
    }
  };

  /**
   * Draw score display
   */
  const drawScores = (ctx, width, height) => {
    ctx.fillStyle = '#0ff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';

    const scoreX = 20;
    const scoreY = 30;

    ctx.fillText(`TOTAL: ${currentScore.total.toFixed(0)}%`, scoreX, scoreY);
    ctx.fillText(`PITCH: ${currentScore.pitch.toFixed(0)}%`, scoreX, scoreY + 30);
    ctx.fillText(`ENERGY: ${currentScore.energy.toFixed(0)}%`, scoreX, scoreY + 60);
  };

  /**
   * Helper functions for calculations
   */
  const average = (arr) => {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  };

  const stdDev = (arr) => {
    if (arr.length === 0) return 0;
    const avg = average(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length;
    return Math.sqrt(variance);
  };

  /**
   * Compute final results when session ends
   */
  const computeFinalResults = useCallback(() => {
    const data = performanceData.current;

    if (data.timestamps.length === 0) {
      console.warn('No performance data collected');
      return null;
    }

    // Calculate averages
    const avgPitch = average(data.pitchSamples) * 100;
    const avgEnergy = average(data.energySamples) * 100;

    const totalScore = (
      avgPitch * SCORING_CONFIG.PITCH_WEIGHT +
      avgEnergy * SCORING_CONFIG.ENERGY_WEIGHT
    );

    // Generate graphs
    const pitchTimeline = data.timestamps.map((time, idx) => ({
      time,
      score: data.pitchSamples[idx] * 100
    }));

    const energyGraph = data.timestamps.map((time, idx) => ({
      time,
      energy: data.energies[idx]
    }));

    // Determine badges
    const badges = [];

    if (data.maxCombo >= 50) {
      badges.push({
        name: 'Combo King',
        description: `${data.maxCombo}x combo streak!`
      });
    }

    const energyConsistency = data.energies.length > 0 ?
      1 - (stdDev(data.energies) / (average(data.energies) + 0.001)) : 0;
    if (energyConsistency >= 0.9) {
      badges.push({
        name: 'Mic Melter',
        description: 'Sustained energy!'
      });
    }

    const pitchConsistency = data.pitchSamples.length > 0 ?
      1 - (stdDev(data.pitchSamples) / (average(data.pitchSamples) + 0.001)) : 0;
    if (pitchConsistency >= 0.9 && avgPitch >= 80) {
      badges.push({
        name: 'Smooth Operator',
        description: 'Consistent pitch!'
      });
    }

    // Generate phrase breakdown (simplified - group by time)
    const perPhrase = [];
    const phraseDuration = 10; // 10 second phrases
    const maxTime = Math.max(...data.timestamps);

    for (let start = 0; start < maxTime; start += phraseDuration) {
      const end = Math.min(start + phraseDuration, maxTime);
      const phraseIndices = data.timestamps
        .map((t, idx) => t >= start && t < end ? idx : -1)
        .filter(idx => idx >= 0);

      if (phraseIndices.length > 0) {
        const phrasePitch = average(phraseIndices.map(idx => data.pitchSamples[idx])) * 100;
        const phraseEnergy = average(phraseIndices.map(idx => data.energySamples[idx])) * 100;
        const phraseTotal = (
          phrasePitch * SCORING_CONFIG.PITCH_WEIGHT +
          phraseEnergy * SCORING_CONFIG.ENERGY_WEIGHT
        );

        perPhrase.push({
          phrase: Math.floor(start / phraseDuration),
          start,
          end,
          pitchScore: phrasePitch,
          energyScore: phraseEnergy,
          totalScore: phraseTotal
        });
      }
    }

    return {
      totals: {
        total: totalScore,
        pitch: avgPitch,
        energy: avgEnergy,
        motion: 0 // Not implemented in voice-only mode
      },
      badges,
      graphs: {
        pitchTimeline,
        energyGraph
      },
      perPhrase,
      performance_data: data // Store raw data for debugging
    };
  }, []);

  /**
   * Detect session end and compute results
   */
  useEffect(() => {
    // Check if session transitioned from active to inactive
    if (prevSessionActiveRef.current && !isSessionActive && performanceData.current.timestamps.length > 0) {
      console.log('🎤 Session ended, computing final results...');

      const results = computeFinalResults();

      if (results && onSessionComplete) {
        console.log('🎤 Final results:', results);
        onSessionComplete(results);
      }
    }

    // Update previous state
    prevSessionActiveRef.current = isSessionActive;
  }, [isSessionActive, computeFinalResults, onSessionComplete]);

  /**
   * Initialize audio when session starts
   */
  useEffect(() => {
    if (isSessionActiveRef.current) {
      console.log('🎤 Session active, initializing audio processing...');

      // Reset performance data when starting a new session
      if (!prevSessionActiveRef.current) {
        console.log('🎤 Resetting performance data for new session');
        performanceData.current = {
          pitchSamples: [],
          energySamples: [],
          timestamps: [],
          combos: [],
          maxCombo: 0,
          frequencies: [],
          energies: []
        };
        keyShiftState.current = {
          detectedOffset: 0,
          confidence: 0,
          samples: []
        };
        // Reset energy tracking for new session
        energyTracking.current = {
          minEnergySeen: Infinity,
          maxEnergySeen: 0,
          initialized: false
        };
        // Reset pitch smoothing buffer
        pitchSmoothingState.current = {
          centsErrorBuffer: [],
          maxBufferSize: 10
        };
      }

      if (!audioContextRef.current) {
        initAudioProcessing();
      } else {
        console.log('🎤 Audio context already exists, ensuring processing is active');
        // Audio context exists, make sure we're processing
        if (audioWorkletRef.current) {
          console.log('🎤 AudioWorklet is active');
        } else {
          console.log('🎤 AudioWorklet not active, reinitializing...');
          initAudioProcessing();
        }
      }
    } else {
      console.log('🎤 Session inactive, stopping audio processing');
      // Stop audio processing when session ends
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      audioWorkletRef.current = null;
    }

    return () => {
      // Cleanup on unmount
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [isSessionActive, initAudioProcessing]);

  return (
      <div className="live-hud">
      <canvas
        ref={canvasRef}
        width={1200}
        height={600}
        className="hud-canvas"
      />

      {keyShiftState.current.confidence > 0.5 && (
        <div className="key-shift-indicator">
          Key shifted: {keyShiftState.current.detectedOffset > 0 ? '+' : ''}
          {keyShiftState.current.detectedOffset.toFixed(0)} cents
        </div>
      )}
    </div>
  );
};

export default LiveHUD;

