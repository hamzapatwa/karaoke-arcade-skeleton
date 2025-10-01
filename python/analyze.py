#!/usr/bin/env python3
"""
Enhanced audio analysis for karaoke arcade app.
Extracts beats, phrases, pitch contour using CREPE, and creates reference data.
"""

import json
import sys
import uuid
import numpy as np
import soundfile as sf
import librosa
import crepe
from scipy import signal
from scipy.spatial.distance import cdist
from sklearn.cluster import KMeans
import warnings
warnings.filterwarnings('ignore')

def extract_enhanced_features(audio_path, out_json):
    """Extract comprehensive audio features for karaoke scoring."""
    print(f"Loading audio: {audio_path}")

    # Load audio with higher quality settings
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    duration = len(y) / sr

    print("Extracting tempo and beats...")
    # Enhanced tempo detection
    tempo, beats = librosa.beat.beat_track(
        y=y, sr=sr,
        trim=True,
        units='time',
        hop_length=512,
        start_bpm=120
    )

    # Get downbeats (strong beats)
    downbeats = librosa.beat.tempo(
        y=y, sr=sr,
        hop_length=512,
        aggregate=np.median
    )

    print("Detecting onsets and phrases...")
    # Enhanced onset detection for phrase segmentation
    onset_env = librosa.onset.onset_strength(
        y=y, sr=sr,
        hop_length=512,
        aggregate=np.median
    )

    # Detect onsets with adaptive threshold
    onsets = librosa.onset.onset_detect(
        onset_envelope=onset_env,
        sr=sr,
        hop_length=512,
        units='time',
        delta=0.2,
        wait=0.1
    )

    # Create phrase segments based on onsets and musical structure
    phrases = create_phrase_segments(onsets, beats, duration)

    print("Extracting pitch contour with CREPE...")
    # Use CREPE for high-quality pitch estimation
    time, frequency, confidence, activation = crepe.predict(
        y, sr,
        model_capacity='full',
        viterbi=True,
        step_size=20,  # 20ms hop size for real-time compatibility
        verbose=0
    )

    # Convert to Hz and clean up
    f0_hz = frequency.copy()
    f0_hz[confidence < 0.3] = 0  # Low confidence = no pitch

    # Smooth pitch contour
    f0_hz = smooth_pitch_contour(f0_hz, confidence)

    print("Analyzing musical key...")
    # Enhanced key detection
    key_name, key_confidence = detect_key(y, sr)

    print("Extracting loudness profile...")
    # Perceptual loudness using RMS with smoothing
    S = librosa.feature.rms(
        y=y,
        frame_length=2048,
        hop_length=512
    )[0]

    # Smooth loudness profile
    loudness = signal.savgol_filter(S, window_length=11, polyorder=3)

    print("Detecting musical sections...")
    # Section detection using chroma features
    sections = detect_sections(y, sr)

    # Create comprehensive reference data
    reference = {
        "beats": beats.tolist(),
        "downbeats": [float(tempo)],
        "phrases": phrases,
        "refPitchHz": f0_hz.tolist(),
        "key": key_name,
        "keyConfidence": float(key_confidence),
        "sections": sections,
        "loudness": loudness.tolist(),
        "tempo": float(tempo),
        "duration": float(duration),
        "sampleRate": int(sr),
        "hopLength": 512,
        "confidence": confidence.tolist()
    }

    print(f"Saving reference data to: {out_json}")
    with open(out_json, "w") as f:
        json.dump(reference, f, indent=2)

    print("Analysis complete!")
    return reference

def create_phrase_segments(onsets, beats, duration):
    """Create musical phrase segments from onsets and beats."""
    phrases = []

    if len(onsets) < 2:
        # Fallback: create 4-beat phrases
        beat_interval = np.mean(np.diff(beats)) if len(beats) > 1 else 2.0
        for i in range(0, int(duration / (beat_interval * 4))):
            start = i * beat_interval * 4
            end = min((i + 1) * beat_interval * 4, duration)
            if end - start > 1.0:  # Minimum phrase length
                phrases.append({"start": float(start), "end": float(end)})
        return phrases

    # Group onsets into phrases
    current_start = 0.0
    for i, onset in enumerate(onsets):
        if onset - current_start > 1.0:  # Minimum phrase length
            phrases.append({
                "start": float(current_start),
                "end": float(onset)
            })
            current_start = onset

    # Add final phrase if needed
    if duration - current_start > 1.0:
        phrases.append({
            "start": float(current_start),
            "end": float(duration)
        })

    return phrases

def smooth_pitch_contour(f0, confidence, window_size=5):
    """Smooth pitch contour while preserving musical structure."""
    smoothed = f0.copy()

    # Only smooth regions with sufficient confidence
    valid_mask = confidence > 0.3

    if np.sum(valid_mask) < window_size:
        return smoothed

    # Apply median filter to reduce outliers
    smoothed[valid_mask] = signal.medfilt(f0[valid_mask], kernel_size=window_size)

    # Apply gentle smoothing
    smoothed[valid_mask] = signal.savgol_filter(
        smoothed[valid_mask],
        window_length=min(11, len(smoothed[valid_mask])),
        polyorder=3
    )

    return smoothed

def detect_key(y, sr):
    """Detect musical key using chroma features."""
    try:
        # Extract chroma features
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)

        # Average chroma across time
        chroma_mean = np.mean(chroma, axis=1)

        # Key profiles (Krumhansl-Schmuckler)
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

        # Normalize profiles
        major_profile = major_profile / np.sum(major_profile)
        minor_profile = minor_profile / np.sum(minor_profile)

        # Calculate correlations for all keys
        major_correlations = []
        minor_correlations = []

        for shift in range(12):
            shifted_chroma = np.roll(chroma_mean, shift)
            major_correlations.append(np.corrcoef(shifted_chroma, major_profile)[0, 1])
            minor_correlations.append(np.corrcoef(shifted_chroma, minor_profile)[0, 1])

        # Find best match
        major_max_idx = np.argmax(major_correlations)
        minor_max_idx = np.argmax(minor_correlations)

        major_corr = major_correlations[major_max_idx]
        minor_corr = minor_correlations[minor_max_idx]

        # Choose major or minor
        if major_corr > minor_corr:
            key_idx = major_max_idx
            mode = "major"
            confidence = major_corr
        else:
            key_idx = minor_max_idx
            mode = "minor"
            confidence = minor_corr

        # Convert to key name
        key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        key_name = f"{key_names[key_idx]} {mode}"

        return key_name, confidence

    except Exception as e:
        print(f"Key detection failed: {e}")
        return "C major", 0.5

def detect_sections(y, sr):
    """Detect musical sections (verse, chorus, etc.) using chroma and tempo."""
    try:
        # Extract features for section detection
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)
        tempo = librosa.feature.tempo(y=y, sr=sr, hop_length=512)[0]

        # Simple section detection based on chroma similarity
        sections = []

        # Use chroma correlation to find section boundaries
        frame_length = 50  # ~1 second frames
        similarities = []

        for i in range(0, chroma.shape[1] - frame_length, frame_length):
            frame1 = chroma[:, i:i+frame_length]
            frame2 = chroma[:, i+frame_length:i+2*frame_length]

            if frame2.shape[1] == frame_length:
                sim = np.corrcoef(frame1.flatten(), frame2.flatten())[0, 1]
                similarities.append(sim)
            else:
                similarities.append(0)

        # Find section boundaries (low similarity)
        threshold = np.mean(similarities) - np.std(similarities)
        boundaries = []

        for i, sim in enumerate(similarities):
            if sim < threshold and i > 0:
                time_boundary = (i * frame_length * 512) / sr
                boundaries.append(time_boundary)

        # Create sections
        current_time = 0.0
        section_labels = ["intro", "verse", "chorus", "bridge", "outro"]
        label_idx = 0

        for boundary in boundaries:
            if boundary - current_time > 5.0:  # Minimum section length
                sections.append({
                    "start": float(current_time),
                    "label": section_labels[label_idx % len(section_labels)]
                })
                current_time = boundary
                label_idx += 1

        # Add final section
        if len(y) / sr - current_time > 5.0:
            sections.append({
                "start": float(current_time),
                "label": section_labels[label_idx % len(section_labels)]
            })

        return sections

    except Exception as e:
        print(f"Section detection failed: {e}")
        return []

def calculate_dtw_alignment(reference_pitch, live_pitch):
    """Calculate DTW alignment between reference and live pitch contours."""
    try:
        from scipy.spatial.distance import euclidean

        # Simple DTW implementation
        def dtw_distance(seq1, seq2):
            n, m = len(seq1), len(seq2)
            dtw_matrix = np.full((n + 1, m + 1), np.inf)
            dtw_matrix[0, 0] = 0

            for i in range(1, n + 1):
                for j in range(1, m + 1):
                    cost = abs(seq1[i-1] - seq2[j-1]) if seq1[i-1] > 0 and seq2[j-1] > 0 else 100
                    dtw_matrix[i, j] = cost + min(
                        dtw_matrix[i-1, j],      # insertion
                        dtw_matrix[i, j-1],      # deletion
                        dtw_matrix[i-1, j-1]     # match
                    )

            return dtw_matrix[n, m]

        # Calculate alignment cost
        alignment_cost = dtw_distance(reference_pitch, live_pitch)

        # Normalize by sequence length
        normalized_cost = alignment_cost / max(len(reference_pitch), len(live_pitch))

        return normalized_cost

    except Exception as e:
        print(f"DTW calculation failed: {e}")
        return 1.0

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python analyze.py <audio_path> <out_json>")
        sys.exit(1)

    audio_path = sys.argv[1]
    out_json = sys.argv[2]

    try:
        reference = extract_enhanced_features(audio_path, out_json)
        print(f"Successfully analyzed {audio_path}")
        print(f"Duration: {reference['duration']:.2f}s")
        print(f"Tempo: {reference['tempo']:.1f} BPM")
        print(f"Key: {reference['key']} (confidence: {reference['keyConfidence']:.2f})")
        print(f"Phrases: {len(reference['phrases'])}")
        print(f"Sections: {len(reference['sections'])}")

    except Exception as e:
        print(f"Analysis failed: {e}")
        sys.exit(1)