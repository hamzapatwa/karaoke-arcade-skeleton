#!/usr/bin/env bash
# Script to upload all songs from demo_tracks directory
# Usage: ./upload_demo_tracks.sh

API_URL="http://localhost:8080/songs/upload"
BASE_DIR="demo_tracks"

# Map folder name to a nicely formatted "Artist - Song" title
format_song_name() {
    local folder_name="$1"
    case "$folder_name" in
        CallMeMaybe)
            echo "Carly Rae Jepsen - Call Me Maybe"
            ;;
        CountryRoads)
            echo "John Denver - Take Me Home, Country Roads"
            ;;
        DancingQueen)
            echo "ABBA - Dancing Queen"
            ;;
        Diamonds)
            echo "Rihanna - Diamonds"
            ;;
        Dynamite)
            echo "Taio Cruz - Dynamite"
            ;;
        ImagineDragons)
            echo "Imagine Dragons - Radioactive"
            ;;
        LetItGo)
            echo "Idina Menzel - Let It Go"
            ;;
        MovesLikeJagger)
            echo "Maroon 5 ft. Christina Aguilera - Moves Like Jagger"
            ;;
        OnlyGirl)
            echo "Rihanna - Only Girl (In The World)"
            ;;
        Perfect)
            echo "Ed Sheeran - Perfect"
            ;;
        PokerFace)
            echo "Lady Gaga - Poker Face"
            ;;
        SomeoneLikeYou)
            echo "Adele - Someone Like You"
            ;;
        TikTok)
            echo "Kesha - TiK ToK"
            ;;
        WeWillRockYou)
            echo "Queen - We Will Rock You"
            ;;
        *)
            # Fallback: basic formatting of the folder name
            # e.g., "MySongName" -> "My Song Name"
            local result
            result=$(echo "$folder_name" | sed 's/\([a-z]\)\([A-Z]\)/\1 \2/g')
            echo "${result^}"
            ;;
    esac
}

# Check if API is running
if ! curl -s "$API_URL" > /dev/null 2>&1; then
    echo "Warning: Could not reach API at $API_URL"
    echo "Make sure the backend server is running on port 8080"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Counter for tracking
total=0
success=0
failed=0
skipped=0

# Iterate through each folder in demo_tracks
for folder in "$BASE_DIR"/*/; do
    if [ ! -d "$folder" ]; then
        continue
    fi

    folder_name=$(basename "$folder")

    song_name=$(format_song_name "$folder_name")

    # Find video file (.mp4)
    video_file=$(find "$folder" -maxdepth 1 -type f \( -iname "*.mp4" \) | head -n 1)

    # Find audio file (.mp3 or .wav)
    audio_file=$(find "$folder" -maxdepth 1 -type f \( -iname "*.mp3" -o -iname "*.wav" \) | head -n 1)

    # Check if both files exist
    if [ -z "$video_file" ]; then
        echo "⚠️  Skipping $folder_name: No video file (.mp4) found"
        ((failed++))
        continue
    fi

    if [ -z "$audio_file" ]; then
        echo "⚠️  Skipping $folder_name: No audio file (.mp3 or .wav) found"
        ((failed++))
        continue
    fi

    # Prompt user before uploading
    echo "📋 Next song: $song_name"
    echo "   Video: $(basename "$video_file")"
    echo "   Audio: $(basename "$audio_file")"
    echo ""
    read -p "Upload this song? (y/n/s=skip/q=quit): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Qq]$ ]]; then
        echo "Upload stopped by user."
        break
    elif [[ $REPLY =~ ^[Ss]$ ]]; then
        echo "⏭️  Skipping $song_name"
        ((skipped++))
        echo ""
        continue
    elif [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "⏭️  Skipping $song_name"
        ((skipped++))
        echo ""
        continue
    fi

    echo "📤 Uploading: $song_name"

    # Upload the song
    response=$(curl -s -X POST "$API_URL" \
        -F "song_name=$song_name" \
        -F "karaoke_video=@$video_file" \
        -F "original_audio=@$audio_file")

    # Check if upload was successful
    if echo "$response" | grep -q "song_id"; then
        song_id=$(echo "$response" | grep -o '"song_id":"[^"]*"' | cut -d'"' -f4)
        echo "   ✅ Success! Song ID: $song_id"
        echo "   ⏳ Preprocessing started..."
        ((success++))
    else
        echo "   ❌ Failed: $response"
        ((failed++))
    fi

    echo ""
    ((total++))

    # Prompt user before continuing to next upload
    echo "Press Enter to continue to next song, or 'q' to quit..."
    read -r input
    if [[ "$input" == "q" || "$input" == "Q" ]]; then
        echo "Upload stopped by user."
        break
    fi
done

echo "=========================================="
echo "Upload Summary:"
echo "  Total processed: $total"
echo "  Success: $success"
echo "  Failed: $failed"
echo "  Skipped: $skipped"
echo "=========================================="