#!/usr/bin/env bash
set -euo pipefail

FPS=15
TARGET_DURATION=""
OVERWRITE=0

usage() {
  cat <<'USAGE'
Usage: bash scripts/extract-frames.sh [--duration SECONDS] [--overwrite] <input.mp4> <output-dir>

Extract PNG frames at 15fps from a source clip.

Arguments:
  <input.mp4>    Source clip path.
  <output-dir>   Directory that will receive %04d.png frames.

Options:
  --duration S   Retimes the clip to exactly S seconds before extraction.
                 If omitted, the script preserves the source duration.
  --overwrite    Allow ffmpeg to overwrite matching output filenames.
  -h, --help     Show this help text.

Notes:
  - Frame counts come from the files ffmpeg actually writes.
  - The script never deletes existing files or directories.
USAGE
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || fail "Required command not found: $name"
}

is_positive_number() {
  [[ "$1" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk "BEGIN { exit !($1 > 0) }"
}

while (($# > 0)); do
  case "$1" in
    --duration)
      (($# >= 2)) || fail "--duration requires a value"
      TARGET_DURATION="$2"
      shift 2
      ;;
    --overwrite)
      OVERWRITE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      fail "Unknown option: $1"
      ;;
    *)
      break
      ;;
  esac
done

(($# == 2)) || {
  usage >&2
  exit 1
}

INPUT_PATH="$1"
OUTPUT_DIR="$2"

require_command ffmpeg
require_command ffprobe
require_command awk
require_command find
require_command sort

[[ -f "$INPUT_PATH" ]] || fail "Input file does not exist: $INPUT_PATH"

if [[ -n "$TARGET_DURATION" ]]; then
  is_positive_number "$TARGET_DURATION" || fail "--duration must be a positive number"
fi

mkdir -p "$OUTPUT_DIR"

if [[ "$OVERWRITE" -eq 0 ]] && find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 | grep -q .; then
  fail "Output directory must be empty unless --overwrite is supplied: $OUTPUT_DIR"
fi

SOURCE_DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$INPUT_PATH")"
[[ -n "$SOURCE_DURATION" ]] || fail "Could not determine source duration for: $INPUT_PATH"
is_positive_number "$SOURCE_DURATION" || fail "Invalid source duration returned by ffprobe: $SOURCE_DURATION"

VIDEO_FILTER="fps=${FPS}"
MODE_LABEL="preserve-duration"

if [[ -n "$TARGET_DURATION" ]]; then
  SPEED_FACTOR="$(awk -v src="$SOURCE_DURATION" -v dst="$TARGET_DURATION" 'BEGIN { printf "%.12f", dst / src }')"
  VIDEO_FILTER="setpts=${SPEED_FACTOR}*PTS,fps=${FPS}"
  MODE_LABEL="retime-to-${TARGET_DURATION}s"
fi

OUTPUT_PATTERN="${OUTPUT_DIR}/%04d.png"
FFMPEG_OVERWRITE_FLAG="-n"
if [[ "$OVERWRITE" -eq 1 ]]; then
  FFMPEG_OVERWRITE_FLAG="-y"
fi

printf 'Extracting frames\n'
printf '  input: %s\n' "$INPUT_PATH"
printf '  output: %s\n' "$OUTPUT_DIR"
printf '  fps: %s\n' "$FPS"
printf '  source duration: %ss\n' "$SOURCE_DURATION"
printf '  mode: %s\n' "$MODE_LABEL"

ffmpeg \
  -hide_banner \
  -loglevel error \
  -stats \
  "$FFMPEG_OVERWRITE_FLAG" \
  -i "$INPUT_PATH" \
  -an \
  -vf "$VIDEO_FILTER" \
  -start_number 1 \
  "$OUTPUT_PATTERN"

FRAME_COUNT="$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -type f -name '*.png' | sort | wc -l | awk '{print $1}')"
FIRST_FRAME="$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -type f -name '*.png' | sort | head -n 1 || true)"
LAST_FRAME="$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -type f -name '*.png' | sort | tail -n 1 || true)"

printf 'Done\n'
printf '  extracted frames: %s\n' "$FRAME_COUNT"
if [[ -n "$FIRST_FRAME" ]]; then
  printf '  first frame: %s\n' "$FIRST_FRAME"
  printf '  last frame: %s\n' "$LAST_FRAME"
fi
