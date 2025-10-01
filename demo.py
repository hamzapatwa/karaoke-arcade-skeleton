#!/usr/bin/env python3
"""
Demo script for Karaoke Arcade
Creates test audio files and validates the analysis pipeline
"""

import os
import sys
import numpy as np
import soundfile as sf
import librosa
from pathlib import Path

def create_test_tracks():
    """Create synthetic test tracks for demo purposes."""

    # Create demo directory
    demo_dir = Path("demo_tracks")
    demo_dir.mkdir(exist_ok=True)

    print("🎵 Creating demo tracks...")

    # Track 1: Simple melody (ballad-style)
    create_simple_melody(demo_dir / "demo_ballad.wav")

    # Track 2: Upbeat track with clear beats
    create_upbeat_track(demo_dir / "demo_upbeat.wav")

    # Track 3: Rap-style track with spoken word
    create_rap_track(demo_dir / "demo_rap.wav")

    print("✅ Demo tracks created in demo_tracks/")
    print("   - demo_ballad.wav (60s ballad)")
    print("   - demo_upbeat.wav (75s pop)")
    print("   - demo_rap.wav (70s rap)")

def create_simple_melody(filename):
    """Create a simple ballad-style melody."""
    sr = 22050
    duration = 60  # seconds

    # Create time array
    t = np.linspace(0, duration, int(sr * duration))

    # Simple chord progression: C - Am - F - G
    chord_progression = [
        (261.63, 329.63, 392.00),  # C major
        (220.00, 261.63, 329.63),  # A minor
        (174.61, 220.00, 261.63),  # F major
        (196.00, 246.94, 293.66),  # G major
    ]

    # Create melody
    melody = np.zeros_like(t)
    chord_duration = duration / len(chord_progression)

    for i, chord in enumerate(chord_progression):
        start_time = i * chord_duration
        end_time = (i + 1) * chord_duration

        mask = (t >= start_time) & (t < end_time)

        # Add chord tones with slight melody variation
        for j, freq in enumerate(chord):
            amplitude = 0.3 * (1 - j * 0.2)  # Decreasing amplitude
            melody[mask] += amplitude * np.sin(2 * np.pi * freq * t[mask])

    # Add some vibrato and dynamics
    vibrato = 1 + 0.1 * np.sin(2 * np.pi * 5 * t)
    envelope = np.exp(-t / duration) * (1 + 0.3 * np.sin(2 * np.pi * t / 4))

    melody = melody * vibrato * envelope

    # Add some harmonic content
    melody += 0.1 * np.sin(2 * np.pi * 2 * melody)

    # Normalize and add slight noise
    melody = melody / np.max(np.abs(melody)) * 0.8
    melody += np.random.normal(0, 0.01, len(melody))

    # Save as WAV
    sf.write(filename, melody, sr)
    print(f"   Created {filename}")

def create_upbeat_track(filename):
    """Create an upbeat pop-style track."""
    sr = 22050
    duration = 75  # seconds

    # Create time array
    t = np.linspace(0, duration, int(sr * duration))

    # Upbeat tempo (120 BPM)
    beat_duration = 60 / 120  # seconds per beat
    beats = np.arange(0, duration, beat_duration)

    # Create kick drum pattern
    kick = np.zeros_like(t)
    for beat in beats:
        if beat < duration:
            beat_idx = int(beat * sr)
            if beat_idx < len(kick):
                # Kick drum: low frequency burst
                kick_duration = int(0.1 * sr)
                end_idx = min(beat_idx + kick_duration, len(kick))
                kick[beat_idx:end_idx] += 0.5 * np.sin(2 * np.pi * 60 * t[beat_idx:end_idx])

    # Create snare pattern (on beats 2 and 4)
    snare = np.zeros_like(t)
    for i, beat in enumerate(beats):
        if i % 2 == 1 and beat < duration:  # Beats 2, 4, 6, etc.
            beat_idx = int(beat * sr)
            if beat_idx < len(snare):
                snare_duration = int(0.05 * sr)
                end_idx = min(beat_idx + snare_duration, len(snare))
                snare[beat_idx:end_idx] += 0.3 * np.random.normal(0, 1, end_idx - beat_idx)

    # Create melody (simple pentatonic scale)
    melody_freqs = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]  # C pentatonic
    melody = np.zeros_like(t)

    # Melody changes every 4 beats
    for i in range(0, len(beats) - 4, 4):
        start_beat = beats[i]
        end_beat = beats[i + 4] if i + 4 < len(beats) else duration

        start_idx = int(start_beat * sr)
        end_idx = int(end_beat * sr)

        if end_idx <= len(melody):
            # Choose a random frequency for this phrase
            freq = melody_freqs[i // 4 % len(melody_freqs)]
            phrase_t = t[start_idx:end_idx]
            melody[start_idx:end_idx] += 0.4 * np.sin(2 * np.pi * freq * phrase_t)

    # Combine all elements
    track = kick + snare + melody

    # Add some reverb-like effect
    track = np.convolve(track, np.exp(-np.linspace(0, 5, int(0.1 * sr))), mode='same')

    # Normalize
    track = track / np.max(np.abs(track)) * 0.8

    # Save as WAV
    sf.write(filename, track, sr)
    print(f"   Created {filename}")

def create_rap_track(filename):
    """Create a rap-style track with spoken word elements."""
    sr = 22050
    duration = 70  # seconds

    # Create time array
    t = np.linspace(0, duration, int(sr * duration))

    # Slower tempo (90 BPM) typical for rap
    beat_duration = 60 / 90
    beats = np.arange(0, duration, beat_duration)

    # Create heavy bass line
    bass = np.zeros_like(t)
    bass_pattern = [1, 0, 1, 0, 1, 0, 1, 0]  # Simple pattern

    for i, beat in enumerate(beats):
        if beat < duration and bass_pattern[i % len(bass_pattern)]:
            beat_idx = int(beat * sr)
            if beat_idx < len(bass):
                bass_duration = int(0.2 * sr)
                end_idx = min(beat_idx + bass_duration, len(bass))
                bass[beat_idx:end_idx] += 0.6 * np.sin(2 * np.pi * 80 * t[beat_idx:end_idx])

    # Create hi-hat pattern
    hihat = np.zeros_like(t)
    for beat in beats:
        if beat < duration:
            beat_idx = int(beat * sr)
            if beat_idx < len(hihat):
                # Hi-hat on every beat
                hihat_duration = int(0.02 * sr)
                end_idx = min(beat_idx + hihat_duration, len(hihat))
                hihat[beat_idx:end_idx] += 0.2 * np.random.normal(0, 1, end_idx - beat_idx)

    # Create vocal-like elements (formant-like frequencies)
    vocals = np.zeros_like(t)

    # Simulate speech-like patterns with formant frequencies
    formants = [
        (800, 1200, 2500),   # "ah" sound
        (300, 2300, 3000),   # "ee" sound
        (400, 1000, 2000),   # "oh" sound
        (500, 1500, 2500),   # "uh" sound
    ]

    # Change formants every 2 seconds
    for i in range(0, int(duration), 2):
        start_time = i
        end_time = min(i + 2, duration)

        mask = (t >= start_time) & (t < end_time)
        formant = formants[i // 2 % len(formants)]

        for freq in formant:
            vocals[mask] += 0.1 * np.sin(2 * np.pi * freq * t[mask])

    # Add some rhythmic elements to vocals
    for i, beat in enumerate(beats):
        if i % 4 == 0 and beat < duration:  # Emphasize every 4th beat
            beat_idx = int(beat * sr)
            if beat_idx < len(vocals):
                emphasis_duration = int(0.1 * sr)
                end_idx = min(beat_idx + emphasis_duration, len(vocals))
                vocals[beat_idx:end_idx] *= 2

    # Combine all elements
    track = bass + hihat + vocals

    # Add some distortion for rap feel
    track = np.tanh(track * 1.5)

    # Normalize
    track = track / np.max(np.abs(track)) * 0.8

    # Save as WAV
    sf.write(filename, track, sr)
    print(f"   Created {filename}")

def validate_analysis():
    """Test the analysis pipeline with demo tracks."""
    print("\n🧪 Testing analysis pipeline...")

    demo_dir = Path("demo_tracks")
    if not demo_dir.exists():
        print("❌ Demo tracks not found. Run create_test_tracks() first.")
        return

    # Test each track
    for track_file in demo_dir.glob("*.wav"):
        print(f"\n📊 Analyzing {track_file.name}...")

        try:
            # Run analysis
            import subprocess
            result = subprocess.run([
                sys.executable,
                "../python/analyze.py",
                str(track_file),
                f"test_output_{track_file.stem}.json"
            ], capture_output=True, text=True, cwd=demo_dir)

            if result.returncode == 0:
                print(f"   ✅ Analysis successful")

                # Load and display results
                import json
                output_file = demo_dir / f"test_output_{track_file.stem}.json"
                if output_file.exists():
                    with open(output_file) as f:
                        data = json.load(f)

                    print(f"   📈 Duration: {data.get('duration', 0):.1f}s")
                    print(f"   🎵 Tempo: {data.get('tempo', 0):.1f} BPM")
                    print(f"   🎼 Key: {data.get('key', 'Unknown')}")
                    print(f"   📝 Phrases: {len(data.get('phrases', []))}")
                    print(f"   🎯 Sections: {len(data.get('sections', []))}")

                    # Clean up test output
                    output_file.unlink()
            else:
                print(f"   ❌ Analysis failed: {result.stderr}")

        except Exception as e:
            print(f"   ❌ Error: {e}")

def main():
    """Main demo function."""
    print("🎤 Karaoke Arcade Demo Script")
    print("=" * 40)

    if len(sys.argv) > 1 and sys.argv[1] == "test":
        validate_analysis()
    else:
        create_test_tracks()
        print("\n💡 Run 'python demo.py test' to validate analysis pipeline")

if __name__ == "__main__":
    main()
