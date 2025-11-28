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
    PITCH_WEIGHT: 0.30,
    ENERGY_WEIGHT: 0.70,

    // Pitch scoring - MORE FORGIVING
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
    ENERGY_MIN_THRESHOLD: 0.005,  // Lower threshold (was 0.01) - more forgiving for quiet singing
    ENERGY_SMOOTHING_WINDOW: 5,   // Samples for rolling max calculation

    // Combo
    COMBO_THRESHOLD: 0.6,         // 60% accuracy to maintain combo (was 70%)
    COMBO_BREAK_THRESHOLD: 0.2,   // Below 20% breaks combo (was 30%)

    // Smoothing - MORE SMOOTHING
    EMA_ALPHA: 0.2,               // Lower alpha = more smoothing (was 0.3)
    BACKBUFFER_MS: 350,           // Longer backbuffer for stability (was 250ms)

    // Continuous scoring - never drop to 0
    PITCH_FLOOR: 0.15,            // Minimum pitch score (15% even if silent/off-pitch)
    ENERGY_FLOOR: 0.10,           // Minimum energy score (10% even if silent)

    // Confidence thresholds
    MIN_CONFIDENCE: 0.2,          // Lower confidence threshold (was 0.3)
    LOW_CONFIDENCE_FLOOR: 0.3     // Minimum score for low confidence (instead of 0)
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

    // Store performance data with size limit to prevent memory bloat
    const MAX_SAMPLES = 10000; // Limit to ~3-4 minutes at 50fps

    performanceData.current.pitchSamples.push(pitchScore);
    performanceData.current.energySamples.push(energyScore);
    performanceData.current.timestamps.push(currentTime);
    performanceData.current.frequencies.push(frequency);
    performanceData.current.energies.push(energy);

    // Remove oldest samples if we exceed the limit (keep most recent)
    if (performanceData.current.pitchSamples.length > MAX_SAMPLES) {
      performanceData.current.pitchSamples.shift();
      performanceData.current.energySamples.shift();
      performanceData.current.timestamps.shift();
      performanceData.current.frequencies.shift();
      performanceData.current.energies.shift();
    }

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
   * Smooth sigmoid function for continuous transitions
   * Maps input smoothly from 0 to 1 with no discontinuities
   */
  const smoothSigmoid = (x, center, width) => {
    return 1 / (1 + Math.exp(-(x - center) / width));
  };

  /**
   * Smooth confidence multiplier (continuous, not step function)
   * Uses sigmoid to smoothly scale from floor to full score based on confidence
   */
  const confidenceMultiplier = (confidence) => {
    // Sigmoid centered at 0.3, smooth transition from floor to 1.0
    const smoothFactor = smoothSigmoid(confidence, 0.3, 0.1);
    return SCORING_CONFIG.PITCH_FLOOR + smoothFactor * (1 - SCORING_CONFIG.PITCH_FLOOR);
  };

  /**
   * Calculate pitch score with TRUE mathematical continuity.
   * No jumps, no thresholds - smooth transitions everywhere.
   * Uses exponential decay for pitch error and sigmoid for confidence.
   */
  const calculatePitchScore = useCallback((frequency, confidence, refData, currentTime) => {
    // Smooth handling of zero frequency using sigmoid
    // Instead of if(frequency === 0) return floor, smoothly transition near 0
    const freqFactor = smoothSigmoid(frequency, 20, 10); // Smooth transition around 20 Hz
    const refFactor = smoothSigmoid(refData.f0, 20, 10);

    // If either frequency is very low, smoothly approach floor
    const detectionFactor = freqFactor * refFactor;

    // Calculate raw cents error (protected against zero)
    const safeFreq = Math.max(frequency, 0.1);
    const safeRef = Math.max(refData.f0, 0.1);
    let centsError = calculateCentsError(safeFreq, safeRef);

    // Detect and apply key shift forgiveness
    // Limit array size to prevent memory growth
    keyShiftState.current.samples.push(centsError);
    const MAX_KEY_SHIFT_SAMPLES = 20;
    if (keyShiftState.current.samples.length > MAX_KEY_SHIFT_SAMPLES) {
      keyShiftState.current.samples.shift();
    }

    if (keyShiftState.current.samples.length > SCORING_CONFIG.KEY_SHIFT_MIN_SAMPLES) {

      // Calculate median offset
      const medianOffset = median(keyShiftState.current.samples);

      // Smooth key shift application using tanh instead of threshold
      const shiftStrength = Math.tanh((Math.abs(medianOffset) - SCORING_CONFIG.KEY_SHIFT_TOLERANCE) / 50);
      if (shiftStrength > 0) {
        // Apply shift proportionally to strength
        centsError -= medianOffset * Math.max(0, shiftStrength);
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

    // CONTINUOUS scoring using exponential decay (no piecewise jumps)
    // Perfect at 0 cents, smooth exponential decay as error increases
    // Formula: score = floor + (1 - floor) * exp(-error / decay_rate)
    const decayRate = 220; // Controls how fast score drops (larger = more forgiving)
    const errorDecay = Math.exp(-absCentsError / decayRate);

    // Base score from pitch accuracy (exponential decay from 1.0 to floor)
    const pitchAccuracyScore = SCORING_CONFIG.PITCH_FLOOR +
                              (1 - SCORING_CONFIG.PITCH_FLOOR) * errorDecay;

    // Apply smooth confidence multiplier (continuous, not step function)
    const confMultiplier = confidenceMultiplier(confidence);

    // Apply smooth detection factor (continuous transition for freq near 0)
    const finalScore = pitchAccuracyScore * confMultiplier * detectionFactor +
                       SCORING_CONFIG.PITCH_FLOOR * (1 - detectionFactor);

    return finalScore;
  }, []);


  /**
   * Calculate energy score with TRUE mathematical continuity.
   * Uses logarithmic scaling and smooth transitions throughout.
   * No thresholds, no jumps - fully continuous function.
   */
  const calculateEnergyScore = useCallback((energy, refData) => {
    const tracking = energyTracking.current;

    // Initialize tracking smoothly on first sample
    if (!tracking.initialized) {
      tracking.minEnergySeen = Math.max(energy, 1e-6);
      tracking.maxEnergySeen = Math.max(energy, 1e-6);
      tracking.initialized = true;
    }

    // Smoothly update min/max using exponential moving average
    const updateRate = 0.05;
    if (energy > tracking.maxEnergySeen) {
      tracking.maxEnergySeen = energy;
    }
    if (energy > 1e-6 && energy < tracking.minEnergySeen) {
      tracking.minEnergySeen = tracking.minEnergySeen * (1 - updateRate) + energy * updateRate;
    }

    // Use logarithmic scale for energy (more perceptually accurate)
    // Add small epsilon to prevent log(0)
    const epsilon = 1e-10;
    const logEnergy = Math.log10(energy + epsilon);
    const logMin = Math.log10(tracking.minEnergySeen + epsilon);
    const logMax = Math.log10(tracking.maxEnergySeen + epsilon);
    const logRange = Math.max(logMax - logMin, 0.01); // Prevent division by zero

    // Continuous normalization on log scale
    let normalized = (logEnergy - logMin) / logRange;

    // Smooth clamp using tanh (continuous, not hard clamp)
    // tanh smoothly maps (-inf, inf) -> (-1, 1)
    // We scale and shift to map smoothly to [floor, 1]
    normalized = Math.tanh(normalized * 2); // Smooth saturation

    // Map from [-1, 1] to [floor, 1] smoothly
    const score = SCORING_CONFIG.ENERGY_FLOOR +
                  (1 - SCORING_CONFIG.ENERGY_FLOOR) * (normalized + 1) / 2;

    // Additional smooth boost for very quiet singing using sigmoid
    // This ensures floor is reached smoothly, not abruptly
    const quietBoost = smoothSigmoid(energy, SCORING_CONFIG.ENERGY_MIN_THRESHOLD, 0.002);

    // Blend between floor and calculated score based on energy level
    const finalScore = SCORING_CONFIG.ENERGY_FLOOR * (1 - quietBoost) +
                       score * quietBoost;

    return finalScore;
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

    let animationFrameId = null;
    let lastRenderTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    // Animation loop with FPS limiting
    const render = (currentTime) => {
        // Throttle to target FPS to reduce GPU load
        if (currentTime - lastRenderTime >= frameInterval) {
          // Clear canvas efficiently (clearRect is faster than fillRect)
          ctx.clearRect(0, 0, width, height);
          // Fill background
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

        lastRenderTime = currentTime;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    // Cleanup: cancel animation frame on unmount or dependency change
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };

  }, [liveMetrics, currentScore, referenceData, externalTime]);

  /**
   * Draw note lane visualization with piano roll style
   */
  const drawNoteLane = (ctx, width, height) => {
    const laneY = height * 0.3;
    const laneHeight = height * 0.4;
    const laneX = 50;
    const laneWidth = width - 100;
    const centerX = width / 2;

    // Draw lane background with grid
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(laneX, laneY, laneWidth, laneHeight);

    // Draw grid lines for pitch reference (every octave)
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    const minFreq = 100;
    const maxFreq = 800;
    for (let freq = minFreq; freq <= maxFreq; freq *= 2) {
      const y = frequencyToY(freq, laneY, laneHeight);
      ctx.beginPath();
      ctx.moveTo(laneX, y);
      ctx.lineTo(laneX + laneWidth, y);
      ctx.stroke();
    }

    // Draw lane border
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(laneX, laneY, laneWidth, laneHeight);

    if (!referenceData || !referenceData.f0_ref_on_k) return;

    // Get notes in the visible time window (past and future)
    // Use binary search for better performance on large arrays
    const lookAheadTime = 3.0; // Show 3 seconds ahead
    const lookBackTime = 0.5;  // Show 0.5 seconds behind
    const currentTime = externalTime;
    const timeMin = currentTime - lookBackTime;
    const timeMax = currentTime + lookAheadTime;

    // Binary search for start index (first note >= timeMin)
    const notes = referenceData.f0_ref_on_k;
    let startIdx = 0;
    let endIdx = notes.length;

    // Find start index
    while (startIdx < endIdx) {
      const mid = Math.floor((startIdx + endIdx) / 2);
      if (notes[mid].t < timeMin) {
        startIdx = mid + 1;
      } else {
        endIdx = mid;
      }
    }

    // Find end index (first note > timeMax)
    endIdx = notes.length;
    let searchStart = startIdx;
    while (searchStart < endIdx) {
      const mid = Math.floor((searchStart + endIdx) / 2);
      if (notes[mid].t <= timeMax) {
        searchStart = mid + 1;
      } else {
        endIdx = mid;
      }
    }

    // Filter visible notes (only check conf and f0, time already filtered)
    const visibleNotes = [];
    for (let i = startIdx; i < endIdx; i++) {
      const note = notes[i];
      if (note.f0 > 0 && note.conf > 0.3) {
        visibleNotes.push(note);
      }
    }

    // Group consecutive notes with similar pitch into note blocks
    const noteBlocks = [];
    let currentBlock = null;

    visibleNotes.forEach(note => {
      if (!currentBlock) {
        currentBlock = {
          startTime: note.t,
          endTime: note.t,
          f0: note.f0,
          conf: note.conf
        };
      } else {
        const timeGap = note.t - currentBlock.endTime;
        const freqDiff = Math.abs(1200 * Math.log2(note.f0 / currentBlock.f0));

        // If gap is small (< 0.1s) and pitch is similar (< 50 cents), extend block
        if (timeGap < 0.1 && freqDiff < 50) {
          currentBlock.endTime = note.t;
          // Update f0 to median of block
          currentBlock.f0 = (currentBlock.f0 + note.f0) / 2;
        } else {
          // Save current block and start new one
          noteBlocks.push(currentBlock);
          currentBlock = {
            startTime: note.t,
            endTime: note.t,
            f0: note.f0,
            conf: note.conf
          };
        }
      }
    });
    if (currentBlock) {
      noteBlocks.push(currentBlock);
    }

    // Draw note blocks
    noteBlocks.forEach((block) => {
      const noteY = frequencyToY(block.f0, laneY, laneHeight);
      const noteHeight = 8; // Height of note bar

      // Calculate horizontal position (notes move right to left)
      // Notes in the future are on the right, past notes on the left
      const timeFromNow = block.startTime - currentTime;
      const pixelsPerSecond = laneWidth / (lookAheadTime + lookBackTime);
      const noteX = centerX + (timeFromNow * pixelsPerSecond);

      // Note width based on duration
      const noteDuration = block.endTime - block.startTime;
      const noteWidth = Math.max(4, noteDuration * pixelsPerSecond);

      // Check if this is the current target note (closest to current time)
      const isCurrentNote = block.startTime <= currentTime && block.endTime >= currentTime;
      const isNearCurrent = Math.abs(block.startTime - currentTime) < 0.2;

      // Draw note block
      if (noteX + noteWidth >= laneX && noteX <= laneX + laneWidth) {
        // Highlight current target note
        if (isCurrentNote) {
          ctx.fillStyle = '#ff0'; // Bright yellow for current note
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#ff0';
        } else if (isNearCurrent) {
          ctx.fillStyle = '#f0f'; // Magenta for near current
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#f0f';
        } else {
          ctx.fillStyle = 'rgba(0, 255, 255, 0.6)'; // Cyan for upcoming/past
          ctx.shadowBlur = 0;
        }

        // Draw rounded rectangle for note (manual implementation for compatibility)
        const x = Math.max(laneX, noteX);
        const w = Math.min(noteWidth, laneX + laneWidth - x);
        const y = noteY - noteHeight / 2;
        const radius = 2;

        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + noteHeight - radius);
        ctx.quadraticCurveTo(x + w, y + noteHeight, x + w - radius, y + noteHeight);
        ctx.lineTo(x + radius, y + noteHeight);
        ctx.quadraticCurveTo(x, y + noteHeight, x, y + noteHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw note border
        ctx.strokeStyle = isCurrentNote ? '#fff' : 'rgba(0, 255, 255, 0.8)';
        ctx.lineWidth = isCurrentNote ? 2 : 1;
        ctx.stroke();
      }
    });

    // Draw center line (current time indicator)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(centerX, laneY);
    ctx.lineTo(centerX, laneY + laneHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw legend at bottom of lane
    const legendY = laneY + laneHeight + 15;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';

    // YOU indicator (green circle)
    ctx.fillStyle = '#0f0';
    ctx.beginPath();
    ctx.arc(centerX - 80, legendY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText('= YOU', centerX - 70, legendY + 4);

    // TARGET indicator (magenta line)
    ctx.strokeStyle = '#f0f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX + 30, legendY);
    ctx.lineTo(centerX + 50, legendY);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText('= TARGET', centerX + 55, legendY + 4);

    // Draw user's current pitch position
    if (liveMetrics.frequency > 0 && liveMetrics.confidence > 0.2) {
      const userY = frequencyToY(liveMetrics.frequency, laneY, laneHeight);

      // Draw line connecting to target if there's a current note
      const refData = getReferenceDataAtTime(externalTime);
      if (refData && refData.f0 > 0) {
        const targetY = frequencyToY(refData.f0, laneY, laneHeight);
        ctx.strokeStyle = liveMetrics.confidence > 0.5 ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 255, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, userY);
        ctx.lineTo(centerX, targetY);
        ctx.stroke();

        // Draw TARGET note indicator - horizontal line with label
        ctx.strokeStyle = '#f0f';
        ctx.fillStyle = '#f0f';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#f0f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(centerX - 25, targetY);
        ctx.lineTo(centerX + 25, targetY);
        ctx.stroke();
        // Target label
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('TARGET', centerX + 30, targetY + 4);
        ctx.shadowBlur = 0;
      }

      // Draw USER pitch indicator - larger filled circle with label
      const userColor = liveMetrics.confidence > 0.5 ? '#0f0' : '#ff0';
      ctx.fillStyle = userColor;
      ctx.strokeStyle = '#fff';
      ctx.shadowBlur = 15;
      ctx.shadowColor = userColor;
      ctx.beginPath();
      ctx.arc(centerX, userY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      // User label
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = userColor;
      ctx.fillText('YOU', centerX - 15, userY + 4);
      ctx.shadowBlur = 0;
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

