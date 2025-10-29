/**
 * AudioWorklet processor with pitch detection, energy analysis, and
 * NLMS (Normalized Least Mean Squares) adaptive echo cancellation.
 *
 * This processor handles:
 * 1. Microphone input capture
 * 2. Adaptive echo cancellation (removes karaoke playback bleed)
 * 3. Real-time pitch estimation (YIN/MPM algorithm)
 * 4. Energy/loudness calculation
 * 5. Spectral centroid (brightness)
 *
 * Optimized for speaker playback on MacBook Pro.
 */

class PitchProcessorAEC extends AudioWorkletProcessor {
  constructor() {
    super();

    // NLMS Adaptive Filter Configuration
    this.aecFilterLength = 512;  // Adaptive filter taps
    this.aecWeights = new Float32Array(this.aecFilterLength).fill(0);
    this.aecStepSize = 0.01;  // Learning rate (μ)
    this.aecRegularization = 0.001;  // Prevents division by zero
    this.aecEnabled = true;

    // Reference signal buffer (karaoke playback)
    this.referenceBuffer = new Float32Array(this.aecFilterLength);
    this.referenceBufferIdx = 0;

    // Pitch detection settings
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;

    // YIN algorithm parameters
    this.yinThreshold = 0.15;
    this.minFreq = 80;   // ~E2
    this.maxFreq = 1000; // ~C6

    // Energy tracking
    this.energySmoothing = 0.3;
    this.smoothedEnergy = 0;

    // Frame counter for throttling messages
    this.frameCount = 0;
    this.sendInterval = 4;  // Send every 4 frames (~20ms at 48kHz)

    // AEC debug stats
    this.aecReduction = 0;

    // Message handler
    this.port.onmessage = (event) => {
      if (event.data.type === 'setAECEnabled') {
        this.aecEnabled = event.data.enabled;
      } else if (event.data.type === 'setAECStepSize') {
        this.aecStepSize = event.data.stepSize;
      } else if (event.data.type === 'resetAEC') {
        this.aecWeights.fill(0);
        this.referenceBuffer.fill(0);
      }
    };
  }

  /**
   * NLMS Adaptive Echo Cancellation
   * Removes karaoke playback bleed from microphone signal.
   *
   * Algorithm:
   * 1. Maintain reference buffer of karaoke playback
   * 2. Compute adaptive filter output (echo estimate)
   * 3. Subtract echo from mic signal
   * 4. Update filter weights based on error
   */
  applyNLMS(micSample, referenceSample) {
    if (!this.aecEnabled) {
      return micSample;
    }

    // Add reference sample to buffer
    this.referenceBuffer[this.referenceBufferIdx] = referenceSample;
    this.referenceBufferIdx = (this.referenceBufferIdx + 1) % this.aecFilterLength;

    // Compute filter output (echo estimate)
    let echoEstimate = 0;
    for (let i = 0; i < this.aecFilterLength; i++) {
      const idx = (this.referenceBufferIdx - i - 1 + this.aecFilterLength) % this.aecFilterLength;
      echoEstimate += this.aecWeights[i] * this.referenceBuffer[idx];
    }

    // Error signal (residual after echo removal)
    const error = micSample - echoEstimate;

    // Compute reference power (for normalization)
    let refPower = this.aecRegularization;
    for (let i = 0; i < this.aecFilterLength; i++) {
      const idx = (this.referenceBufferIdx - i - 1 + this.aecFilterLength) % this.aecFilterLength;
      const refSample = this.referenceBuffer[idx];
      refPower += refSample * refSample;
    }

    // Update filter weights (NLMS)
    const normalizedStepSize = this.aecStepSize / refPower;
    for (let i = 0; i < this.aecFilterLength; i++) {
      const idx = (this.referenceBufferIdx - i - 1 + this.aecFilterLength) % this.aecFilterLength;
      const refSample = this.referenceBuffer[idx];
      this.aecWeights[i] += normalizedStepSize * error * refSample;

      // Clipping guard (prevent instability)
      this.aecWeights[i] = Math.max(-1, Math.min(1, this.aecWeights[i]));
    }

    // Track echo reduction (for debugging)
    this.aecReduction = 0.9 * this.aecReduction + 0.1 * Math.abs(echoEstimate);

    return error;
  }

  /**
   * YIN pitch detection algorithm
   * Fast and accurate fundamental frequency estimation.
   */
  estimatePitch(buffer, sampleRate) {
    const bufferSize = buffer.length;
    const halfBufferSize = Math.floor(bufferSize / 2);

    // Calculate autocorrelation difference function
    const yinBuffer = new Float32Array(halfBufferSize);

    // Difference function
    for (let tau = 0; tau < halfBufferSize; tau++) {
      let sum = 0;
      for (let i = 0; i < halfBufferSize; i++) {
        const delta = buffer[i] - buffer[i + tau];
        sum += delta * delta;
      }
      yinBuffer[tau] = sum;
    }

    // Cumulative mean normalized difference
    yinBuffer[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau < halfBufferSize; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] *= tau / runningSum;
    }

    // Find absolute threshold
    const minTau = Math.floor(sampleRate / this.maxFreq);
    const maxTau = Math.floor(sampleRate / this.minFreq);

    let tau = minTau;
    let bestTau = -1;

    // Search for first valley below threshold
    while (tau < maxTau) {
      if (yinBuffer[tau] < this.yinThreshold) {
        // Find local minimum
        while (tau + 1 < maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        bestTau = tau;
        break;
      }
      tau++;
    }

    if (bestTau === -1) {
      // No clear pitch found
      return { frequency: 0, confidence: 0 };
    }

    // Parabolic interpolation for sub-sample accuracy
    let betterTau = bestTau;
    if (bestTau > 0 && bestTau < halfBufferSize - 1) {
      const s0 = yinBuffer[bestTau - 1];
      const s1 = yinBuffer[bestTau];
      const s2 = yinBuffer[bestTau + 1];
      betterTau = bestTau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }

    const frequency = sampleRate / betterTau;
    const confidence = 1 - yinBuffer[bestTau];

    return { frequency, confidence };
  }

  /**
   * Calculate RMS energy
   */
  calculateRMS(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  /**
   * Calculate spectral centroid (brightness)
   */
  calculateSpectralCentroid(buffer, sampleRate) {
    // Simple FFT-free approximation using zero-crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < buffer.length; i++) {
      if ((buffer[i-1] >= 0 && buffer[i] < 0) || (buffer[i-1] < 0 && buffer[i] >= 0)) {
        zeroCrossings++;
      }
    }

    // Estimate centroid from zero-crossing rate
    const zcr = zeroCrossings / buffer.length;
    const estimatedCentroid = zcr * sampleRate / 2;

    return estimatedCentroid;
  }

  /**
   * Process audio samples
   */
  process(inputs, outputs, parameters) {
    const micInput = inputs[0];
    const referenceInput = inputs[1]; // Karaoke playback reference (for AEC)

    if (!micInput || micInput.length === 0) {
      return true;
    }

    const micChannel = micInput[0];
    const referenceChannel = referenceInput && referenceInput[0] ? referenceInput[0] : null;

    // Process each sample
    for (let i = 0; i < micChannel.length; i++) {
      let micSample = micChannel[i];
      const referenceSample = referenceChannel ? referenceChannel[i] : 0;

      // Apply adaptive echo cancellation
      micSample = this.applyNLMS(micSample, referenceSample);

      // Add to pitch detection buffer
      this.buffer[this.bufferIndex] = micSample;
      this.bufferIndex++;

      // Process when buffer is full
      if (this.bufferIndex >= this.bufferSize) {
        this.bufferIndex = 0;
        this.frameCount++;

        // Throttle output messages
        if (this.frameCount % this.sendInterval === 0) {
          // Calculate pitch
          const pitchResult = this.estimatePitch(this.buffer, sampleRate);

          // Calculate energy
          const rms = this.calculateRMS(this.buffer);
          this.smoothedEnergy = this.energySmoothing * rms +
                               (1 - this.energySmoothing) * this.smoothedEnergy;

          // Calculate spectral centroid
          const centroid = this.calculateSpectralCentroid(this.buffer, sampleRate);

          // Send data to main thread
          this.port.postMessage({
            type: 'audio-data',
            frequency: pitchResult.frequency,
            confidence: pitchResult.confidence,
            energy: this.smoothedEnergy,
            rms: rms,
            centroid: centroid,
            aecReduction: this.aecReduction,
            timestamp: currentTime
          });
        }
      }
    }

    return true;
  }
}

registerProcessor('pitch-processor-aec', PitchProcessorAEC);

