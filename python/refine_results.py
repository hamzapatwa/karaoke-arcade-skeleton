#!/usr/bin/env python3
"""
Post-run refinement using phrase-local DTW.

After a performance, re-compute per-phrase accuracy and timing using
DTW alignment between singer's pitch contour and reference.

This provides more accurate phrase-level scoring for detailed results.

Usage:
    python refine_results.py \
        --reference reference.json \
        --performance performance_pitch.json \
        --output refined_results.json
"""

import argparse
import json
import sys
import numpy as np
from scipy.interpolate import interp1d
from dtaidistance import dtw
from typing import List, Dict, Tuple


def load_reference(path: str) -> Dict:
    """Load reference data."""
    with open(path, 'r') as f:
        return json.load(f)


def load_performance(path: str) -> Dict:
    """Load performance pitch data."""
    with open(path, 'r') as f:
        return json.load(f)


def extract_phrase_pitch(times: np.ndarray, f0: np.ndarray, start: float, end: float) -> Tuple[np.ndarray, np.ndarray]:
    """Extract pitch contour for a phrase."""
    mask = (times >= start) & (times <= end)
    return times[mask], f0[mask]


def align_phrase_dtw(ref_pitch: np.ndarray, singer_pitch: np.ndarray) -> Tuple[float, np.ndarray, np.ndarray]:
    """
    Align singer's pitch to reference using DTW.

    Returns:
        - alignment cost (normalized)
        - aligned indices for reference
        - aligned indices for singer
    """
    # Filter out unvoiced regions (f0 == 0)
    ref_voiced = ref_pitch[ref_pitch > 0]
    singer_voiced = singer_pitch[singer_pitch > 0]

    if len(ref_voiced) < 3 or len(singer_voiced) < 3:
        return 1.0, np.array([]), np.array([])

    # Compute DTW distance
    distance = dtw.distance(ref_voiced, singer_voiced)

    # Normalize by sequence length
    normalized_cost = distance / max(len(ref_voiced), len(singer_voiced))

    # Get alignment path
    path = dtw.warping_path(ref_voiced, singer_voiced)

    ref_indices = path[:, 0]
    singer_indices = path[:, 1]

    return normalized_cost, ref_indices, singer_indices


def calculate_phrase_metrics(
    ref_times: np.ndarray,
    ref_pitch: np.ndarray,
    singer_times: np.ndarray,
    singer_pitch: np.ndarray,
    phrase_start: float,
    phrase_end: float
) -> Dict:
    """
    Calculate detailed metrics for a phrase using DTW alignment.

    Returns:
        - accuracy: Overall pitch accuracy (0-1)
        - median_cents_error: Median pitch error in cents
        - on_beat_pct: Percentage of notes on beat
        - timing_offset: Average timing offset in seconds
    """
    # Extract phrase pitch
    ref_t, ref_f0 = extract_phrase_pitch(ref_times, ref_pitch, phrase_start, phrase_end)
    singer_t, singer_f0 = extract_phrase_pitch(singer_times, singer_pitch, phrase_start, phrase_end)

    if len(ref_f0) == 0 or len(singer_f0) == 0:
        return {
            'accuracy': 0.0,
            'median_cents_error': 0.0,
            'on_beat_pct': 0.0,
            'timing_offset': 0.0,
            'dtw_cost': 1.0
        }

    # DTW alignment
    dtw_cost, ref_idx, singer_idx = align_phrase_dtw(ref_f0, singer_f0)

    if len(ref_idx) == 0:
        return {
            'accuracy': 0.0,
            'median_cents_error': 0.0,
            'on_beat_pct': 0.0,
            'timing_offset': 0.0,
            'dtw_cost': dtw_cost
        }

    # Calculate cents errors on aligned frames
    cents_errors = []

    for r_idx, s_idx in zip(ref_idx, singer_idx):
        ref_freq = ref_f0[r_idx]
        singer_freq = singer_f0[s_idx]

        if ref_freq > 0 and singer_freq > 0:
            cents_error = 1200 * np.log2(singer_freq / ref_freq)
            cents_errors.append(cents_error)

    if len(cents_errors) == 0:
        median_cents_error = 0.0
        accuracy = 0.0
    else:
        median_cents_error = float(np.median(cents_errors))

        # Calculate accuracy (percentage within 50 cents)
        within_tolerance = sum(1 for e in cents_errors if abs(e) <= 50)
        accuracy = within_tolerance / len(cents_errors)

    # Calculate timing offset
    timing_offsets = []
    for r_idx, s_idx in zip(ref_idx, singer_idx):
        if r_idx < len(ref_t) and s_idx < len(singer_t):
            offset = singer_t[s_idx] - ref_t[r_idx]
            timing_offsets.append(offset)

    timing_offset = float(np.mean(timing_offsets)) if timing_offsets else 0.0

    # Calculate on-beat percentage (simplified)
    # In a full implementation, compare to beat grid
    on_beat_pct = accuracy  # Placeholder

    return {
        'accuracy': float(accuracy),
        'median_cents_error': median_cents_error,
        'on_beat_pct': float(on_beat_pct),
        'timing_offset': timing_offset,
        'dtw_cost': float(dtw_cost)
    }


def refine_results(reference: Dict, performance: Dict) -> Dict:
    """
    Refine performance results using phrase-local DTW.

    Args:
        reference: Reference data with phrases and pitch
        performance: Performance data with timestamps and pitch

    Returns:
        Refined results with per-phrase metrics
    """
    # Extract reference data
    phrases = reference.get('phrases_k', [])
    ref_pitch_data = reference.get('f0_ref_on_k', [])

    # Convert to arrays
    ref_times = np.array([p['t'] for p in ref_pitch_data])
    ref_pitch = np.array([p['f0'] for p in ref_pitch_data])

    # Extract performance data
    perf_times = np.array(performance.get('timestamps', []))
    perf_pitch = np.array(performance.get('pitch', []))

    # Refine each phrase
    refined_phrases = []

    for phrase in phrases:
        phrase_id = phrase['id']
        start = phrase['start']
        end = phrase['end']

        metrics = calculate_phrase_metrics(
            ref_times,
            ref_pitch,
            perf_times,
            perf_pitch,
            start,
            end
        )

        refined_phrases.append({
            'id': phrase_id,
            'start': start,
            'end': end,
            **metrics
        })

    # Calculate overall metrics
    overall_accuracy = np.mean([p['accuracy'] for p in refined_phrases]) if refined_phrases else 0.0
    median_error = np.median([p['median_cents_error'] for p in refined_phrases]) if refined_phrases else 0.0

    return {
        'version': '2.0',
        'overall': {
            'accuracy': float(overall_accuracy),
            'median_cents_error': float(median_error)
        },
        'phrases': refined_phrases,
        'charts': {
            'pitch_timeline': generate_pitch_chart(ref_times, ref_pitch, perf_times, perf_pitch),
            'phrase_accuracy': [p['accuracy'] for p in refined_phrases]
        }
    }


def generate_pitch_chart(ref_times, ref_pitch, perf_times, perf_pitch) -> List[Dict]:
    """Generate pitch overlay chart data."""
    # Resample to common timeline
    if len(ref_times) == 0 or len(perf_times) == 0:
        return []

    # Create dense timeline
    t_min = min(ref_times[0], perf_times[0])
    t_max = max(ref_times[-1], perf_times[-1])
    t_common = np.linspace(t_min, t_max, 500)

    # Interpolate both pitch contours
    ref_interp = interp1d(ref_times, ref_pitch, kind='linear', bounds_error=False, fill_value=0)
    perf_interp = interp1d(perf_times, perf_pitch, kind='linear', bounds_error=False, fill_value=0)

    ref_resampled = ref_interp(t_common)
    perf_resampled = perf_interp(t_common)

    # Create chart data
    chart = []
    for t, ref_f0, perf_f0 in zip(t_common, ref_resampled, perf_resampled):
        chart.append({
            't': float(t),
            'ref_f0': float(ref_f0),
            'perf_f0': float(perf_f0)
        })

    return chart


def main():
    parser = argparse.ArgumentParser(description='Refine karaoke results with phrase-local DTW')
    parser.add_argument('--reference', required=True, help='Reference JSON file')
    parser.add_argument('--performance', required=True, help='Performance data JSON')
    parser.add_argument('--output', required=True, help='Output refined results JSON')

    args = parser.parse_args()

    # Load data
    print('Loading reference data...')
    reference = load_reference(args.reference)

    print('Loading performance data...')
    performance = load_performance(args.performance)

    # Refine results
    print('Refining results with phrase-local DTW...')
    refined = refine_results(reference, performance)

    # Save output
    print(f'Saving refined results to: {args.output}')
    with open(args.output, 'w') as f:
        json.dump(refined, f, indent=2)

    print('✅ Refinement complete!')
    print(f'   Overall accuracy: {refined["overall"]["accuracy"]*100:.1f}%')
    print(f'   Median cents error: {refined["overall"]["median_cents_error"]:.1f} ¢')
    print(f'   Phrases analyzed: {len(refined["phrases"])}')

    return 0


if __name__ == '__main__':
    sys.exit(main())

