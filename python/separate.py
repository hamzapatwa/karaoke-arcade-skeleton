#!/usr/bin/env python3
"""
Vocal separation using Demucs v4 optimized for Apple Silicon (MPS).

Extracts vocals and accompaniment from a full-mix studio track for karaoke reference.
Supports both UVR MDX-Net models and Demucs v4 with PyTorch MPS backend.

Usage:
    python separate.py --input original_audio.wav --output-dir ./stems --device mps

Output:
    - vocals.wav: Isolated vocals
    - accompaniment.wav: Everything else (instrumental)
"""

import argparse
import os
import sys
import warnings
from pathlib import Path
import torch
import torchaudio
import soundfile as sf
import numpy as np

# Suppress excessive warnings
warnings.filterwarnings('ignore')


def check_mps_availability():
    """Check if MPS (Metal Performance Shaders) is available on macOS."""
    if not torch.backends.mps.is_available():
        if not torch.backends.mps.is_built():
            print("⚠️  MPS not available: PyTorch was not built with MPS support.")
        else:
            print("⚠️  MPS not available: check macOS version (requires 12.3+).")
        return False
    return True


def get_device(requested_device='auto'):
    """Select best available device (MPS > CUDA > CPU)."""
    if requested_device == 'auto':
        if torch.backends.mps.is_available():
            return torch.device('mps')
        elif torch.cuda.is_available():
            return torch.device('cuda')
        else:
            return torch.device('cpu')
    return torch.device(requested_device)


def separate_with_demucs(input_path, output_dir, device='mps', model_name='htdemucs_ft'):
    """
    Separate vocals using Demucs v4.

    Args:
        input_path: Path to input audio file
        output_dir: Directory to save separated stems
        device: 'mps', 'cuda', 'cpu', or 'auto'
        model_name: Demucs model to use:
            - 'htdemucs': Hybrid Transformer Demucs (best quality, slower)
            - 'htdemucs_ft': Fine-tuned version (recommended)
            - 'htdemucs_6s': 6-source separation
            - 'mdx_extra': MDX-Net model (faster, good quality)

    Returns:
        Tuple of (vocals_path, accompaniment_path)
    """
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import save_audio

    print(f"🎵 Loading Demucs model: {model_name}")

    # Get device
    torch_device = get_device(device)
    print(f"🔧 Using device: {torch_device}")

    # Load model
    try:
        model = get_model(model_name)
        model.to(torch_device)
        model.eval()
    except Exception as e:
        print(f"❌ Failed to load model {model_name}: {e}")
        print("⚙️  Falling back to htdemucs (base model)")
        model = get_model('htdemucs')
        model.to(torch_device)
        model.eval()

    # Load audio
    print(f"📂 Loading audio: {input_path}")
    wav, sr = torchaudio.load(input_path)

    # Demucs expects 44.1kHz or 48kHz
    target_sr = 44100
    if sr != target_sr:
        print(f"🔄 Resampling {sr}Hz → {target_sr}Hz")
        resampler = torchaudio.transforms.Resample(sr, target_sr)
        wav = resampler(wav)
        sr = target_sr

    # Move to device
    wav = wav.to(torch_device)

    # Ensure stereo (Demucs expects stereo)
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)

    # Add batch dimension
    wav = wav.unsqueeze(0)

    print("🔬 Separating sources (this may take a few minutes)...")

    # Apply model
    with torch.no_grad():
        sources = apply_model(
            model,
            wav,
            device=torch_device,
            split=True,  # Split into chunks to save memory
            overlap=0.25,  # Overlap between chunks
            progress=True
        )

    # Extract sources
    # sources shape: [batch, sources, channels, samples]
    # Demucs v4 source order: drums, bass, other, vocals
    sources = sources.squeeze(0)  # Remove batch dimension

    # Get source names
    source_names = model.sources
    vocals_idx = source_names.index('vocals')

    # Extract vocals
    vocals = sources[vocals_idx].cpu().numpy()

    # Create accompaniment (everything except vocals)
    accompaniment = sources.sum(dim=0).cpu().numpy() - vocals

    # Save outputs
    os.makedirs(output_dir, exist_ok=True)

    vocals_path = os.path.join(output_dir, 'vocals.wav')
    accompaniment_path = os.path.join(output_dir, 'accompaniment.wav')

    print(f"💾 Saving vocals: {vocals_path}")
    sf.write(vocals_path, vocals.T, sr)

    print(f"💾 Saving accompaniment: {accompaniment_path}")
    sf.write(accompaniment_path, accompaniment.T, sr)

    print("✅ Separation complete!")

    return vocals_path, accompaniment_path


def separate_with_mdx(input_path, output_dir, device='mps'):
    """
    Separate vocals using MDX-Net (UVR model).
    Faster than Demucs, good quality for karaoke use.

    Note: This is a placeholder. Full MDX implementation requires
    ONNX Runtime with CoreML EP or PyTorch implementation.
    """
    print("⚠️  MDX-Net separation not yet implemented.")
    print("🔄 Falling back to Demucs...")
    return separate_with_demucs(input_path, output_dir, device, model_name='mdx_extra')


def main():
    parser = argparse.ArgumentParser(
        description='Separate vocals from audio using Demucs v4 (Apple Silicon optimized)'
    )
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='Input audio file path'
    )
    parser.add_argument(
        '--output-dir', '-o',
        required=True,
        help='Output directory for separated stems'
    )
    parser.add_argument(
        '--device', '-d',
        default='auto',
        choices=['auto', 'mps', 'cuda', 'cpu'],
        help='Device to use for inference (default: auto)'
    )
    parser.add_argument(
        '--model', '-m',
        default='htdemucs_ft',
        choices=['htdemucs', 'htdemucs_ft', 'htdemucs_6s', 'mdx_extra'],
        help='Demucs model to use (default: htdemucs_ft)'
    )
    parser.add_argument(
        '--check-mps',
        action='store_true',
        help='Check MPS availability and exit'
    )

    args = parser.parse_args()

    # Check MPS availability
    if args.check_mps:
        if check_mps_availability():
            print("✅ MPS is available and ready to use!")
            return 0
        else:
            return 1

    # Validate input
    if not os.path.exists(args.input):
        print(f"❌ Input file not found: {args.input}")
        return 1

    # Run separation
    try:
        vocals_path, accompaniment_path = separate_with_demucs(
            args.input,
            args.output_dir,
            device=args.device,
            model_name=args.model
        )

        print(f"\n🎉 Success!")
        print(f"   Vocals: {vocals_path}")
        print(f"   Accompaniment: {accompaniment_path}")

        return 0

    except Exception as e:
        print(f"\n❌ Separation failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())

