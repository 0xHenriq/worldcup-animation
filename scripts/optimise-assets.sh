#!/usr/bin/env bash
set -euo pipefail

TIER_NAMES=(thumb medium large)
TIER_WIDTHS=(480 960 1920)
TIER_QUALITIES=(70 76 80)

MODE=""
KIND=""
CLIP=""
OVERWRITE=0
CRUSH_BLACKS=0
LOSSLESS=0

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/optimise-assets.sh image --kind KIND [--overwrite] <input-file> <output.webp>
  bash scripts/optimise-assets.sh frames --clip CLIP [--overwrite] [--crush-blacks] <input-dir> <output-root>

Convert source media into WebP assets for the World Cup hero pipeline.

Modes:
  image   Convert a single static source image using a preset from spec section 5.1.
  frames  Convert extracted PNG frames into thumb / medium / large WebP tiers.

Image kinds:
  portal-composite
  portal-cosmos
  arm-left
  arm-right
  trophy
  stadium-poster

Frame clips:
  celebration
  sparkle

Options:
  --kind KIND       Required for image mode.
  --clip CLIP       Required for frames mode.
  --crush-blacks    Force black-threshold preprocessing before encoding.
                    Automatically enabled for --clip sparkle.
  --overwrite       Allow encoders to overwrite existing output files.
  -h, --help        Show this help text.

Notes:
  - Prefers cwebp when available for direct resize-only encodes.
  - Falls back to ffmpeg when cwebp is unavailable or when black crushing is needed.
  - The script never deletes files or directories.
USAGE
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

have_command() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  have_command "$1" || fail "Required command not found: $1"
}

is_supported_image_kind() {
  case "$1" in
    portal-composite|portal-cosmos|arm-left|arm-right|trophy|stadium-poster)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_supported_clip() {
  case "$1" in
    celebration|sparkle)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

ensure_output_is_writable() {
  local output_path="$1"
  mkdir -p "$(dirname "$output_path")"
  if [[ -f "$output_path" && "$OVERWRITE" -ne 1 ]]; then
    fail "Output exists; rerun with --overwrite to replace it: $output_path"
  fi
}

ensure_directory_is_ready() {
  local dir_path="$1"
  mkdir -p "$dir_path"
  if [[ "$OVERWRITE" -ne 1 ]] && find "$dir_path" -mindepth 1 -maxdepth 1 -type f | grep -q .; then
    fail "Output directory must be empty unless --overwrite is supplied: $dir_path"
  fi
}

read_dimensions() {
  local input_path="$1"
  ffprobe \
    -v error \
    -select_streams v:0 \
    -show_entries stream=width,height \
    -of csv=p=0:s=x \
    "$input_path"
}

static_preset() {
  local kind="$1"
  case "$kind" in
    portal-composite|portal-cosmos|stadium-poster)
      printf 'width 1920 80 0\n'
      ;;
    arm-left|arm-right)
      printf 'width 1920 80 1\n'
      ;;
    trophy)
      printf 'long-edge 1200 85 1\n'
      ;;
    *)
      fail "Unsupported image kind: $kind"
      ;;
  esac
}

long_edge_scale_filter() {
  local input_path="$1"
  local long_edge="$2"
  local dims width height

  dims="$(read_dimensions "$input_path")"
  width="${dims%x*}"
  height="${dims#*x}"

  [[ -n "$width" && -n "$height" ]] || fail "Could not read dimensions for: $input_path"

  if (( width >= height )); then
    printf 'scale=%s:-2:flags=lanczos' "$long_edge"
  else
    printf 'scale=-2:%s:flags=lanczos' "$long_edge"
  fi
}

append_black_crush_filter() {
  local base_filter="$1"
  printf "%s,format=rgba,lutrgb=r='if(lte(val,8),0,val)':g='if(lte(val,8),0,val)':b='if(lte(val,8),0,val)'" "$base_filter"
}

ffmpeg_overwrite_flag() {
  if [[ "$OVERWRITE" -eq 1 ]]; then
    printf '%s' '-y'
  else
    printf '%s' '-n'
  fi
}

encode_with_ffmpeg() {
  local input_path="$1"
  local output_path="$2"
  local filter_graph="$3"
  local quality="$4"
  local preserve_alpha="$5"
  local pixel_format='yuv420p'
  local encode_quality="$quality"

  if [[ "$preserve_alpha" -eq 1 ]]; then
    pixel_format='yuva420p'
  fi

  if [[ "$LOSSLESS" -eq 1 ]]; then
    encode_quality=100
  fi

  ffmpeg \
    -hide_banner \
    -loglevel error \
    -stats \
    "$(ffmpeg_overwrite_flag)" \
    -i "$input_path" \
    -vf "$filter_graph" \
    -frames:v 1 \
    -an \
    -c:v libwebp \
    -lossless "$LOSSLESS" \
    -compression_level 6 \
    -preset picture \
    -q:v "$encode_quality" \
    -pix_fmt "$pixel_format" \
    "$output_path"
}

encode_with_cwebp() {
  local input_path="$1"
  local output_path="$2"
  local resize_mode="$3"
  local resize_value="$4"
  local quality="$5"
  local preserve_alpha="$6"
  local resize_width resize_height dims width height
  local args=()

  if [[ "$resize_mode" == 'width' ]]; then
    resize_width="$resize_value"
    resize_height=0
  else
    dims="$(read_dimensions "$input_path")"
    width="${dims%x*}"
    height="${dims#*x}"
    [[ -n "$width" && -n "$height" ]] || fail "Could not read dimensions for: $input_path"

    if (( width >= height )); then
      resize_width="$resize_value"
      resize_height=0
    else
      resize_width=0
      resize_height="$resize_value"
    fi
  fi

  args=(-mt -m 6 -q "$quality" -resize "$resize_width" "$resize_height")
  if [[ "$LOSSLESS" -eq 1 ]]; then
    args=(-mt -m 6 -lossless -q 100 -resize "$resize_width" "$resize_height")
  fi
  if [[ "$preserve_alpha" -eq 1 ]]; then
    args+=(-alpha_q 100)
  fi

  if [[ -f "$output_path" && "$OVERWRITE" -eq 1 ]]; then
    args+=(-o "$output_path")
  else
    args+=(-o "$output_path")
  fi

  cwebp "${args[@]}" "$input_path"
}

encode_image_variant() {
  local input_path="$1"
  local output_path="$2"
  local resize_mode="$3"
  local resize_value="$4"
  local quality="$5"
  local preserve_alpha="$6"
  local filter_graph=""

  ensure_output_is_writable "$output_path"

  if [[ "$resize_mode" == 'width' ]]; then
    filter_graph="scale=${resize_value}:-2:flags=lanczos"
  else
    filter_graph="$(long_edge_scale_filter "$input_path" "$resize_value")"
  fi

  if [[ "$CRUSH_BLACKS" -eq 1 ]]; then
    filter_graph="$(append_black_crush_filter "$filter_graph")"
  fi

  if have_command cwebp && [[ "$CRUSH_BLACKS" -eq 0 ]]; then
    encode_with_cwebp "$input_path" "$output_path" "$resize_mode" "$resize_value" "$quality" "$preserve_alpha"
  else
    require_command ffmpeg
    require_command ffprobe
    encode_with_ffmpeg "$input_path" "$output_path" "$filter_graph" "$quality" "$preserve_alpha"
  fi
}

convert_static_image() {
  local input_path="$1"
  local output_path="$2"
  local resize_mode resize_value quality preserve_alpha

  [[ -f "$input_path" ]] || fail "Input file does not exist: $input_path"
  is_supported_image_kind "$KIND" || fail "Unsupported --kind value: $KIND"

  read -r resize_mode resize_value quality preserve_alpha <<<"$(static_preset "$KIND")"

  printf 'Optimising image\n'
  printf '  kind: %s\n' "$KIND"
  printf '  input: %s\n' "$input_path"
  printf '  output: %s\n' "$output_path"
  printf '  resize: %s %s\n' "$resize_mode" "$resize_value"
  printf '  quality: %s\n' "$quality"
  if [[ "$CRUSH_BLACKS" -eq 1 ]]; then
    printf '  black crush: enabled\n'
  fi

  encode_image_variant "$input_path" "$output_path" "$resize_mode" "$resize_value" "$quality" "$preserve_alpha"
}

convert_frame_directory() {
  local input_dir="$1"
  local output_root="$2"
  local source_files=()
  local tier_name tier_width tier_quality tier_index source_path base_name output_path

  [[ -d "$input_dir" ]] || fail "Input directory does not exist: $input_dir"
  is_supported_clip "$CLIP" || fail "Unsupported --clip value: $CLIP"

  if [[ "$CLIP" == 'sparkle' ]]; then
    CRUSH_BLACKS=1
    LOSSLESS=1
  fi

  mapfile -d '' -t source_files < <(find "$input_dir" -mindepth 1 -maxdepth 1 -type f -name '*.png' -print0 | sort -z)
  ((${#source_files[@]} > 0)) || fail "No PNG frames found in: $input_dir"

  for tier_name in "${TIER_NAMES[@]}"; do
    ensure_directory_is_ready "${output_root}/${tier_name}"
  done

  printf 'Optimising frame sequence\n'
  printf '  clip: %s\n' "$CLIP"
  printf '  input: %s\n' "$input_dir"
  printf '  output root: %s\n' "$output_root"
  printf '  frames: %s\n' "${#source_files[@]}"
  if [[ "$CRUSH_BLACKS" -eq 1 ]]; then
    printf '  black crush: enabled\n'
  fi

  for tier_index in "${!TIER_NAMES[@]}"; do
    tier_name="${TIER_NAMES[$tier_index]}"
    tier_width="${TIER_WIDTHS[$tier_index]}"
    tier_quality="${TIER_QUALITIES[$tier_index]}"

    printf '  tier %s -> width %s, quality %s\n' "$tier_name" "$tier_width" "$tier_quality"

    for source_path in "${source_files[@]}"; do
      base_name="$(basename "${source_path%.*}")"
      output_path="${output_root}/${tier_name}/${base_name}.webp"
      encode_image_variant "$source_path" "$output_path" width "$tier_width" "$tier_quality" 0
    done
  done
}

parse_image_mode() {
  while (($# > 0)); do
    case "$1" in
      --kind)
        (($# >= 2)) || fail "--kind requires a value"
        KIND="$2"
        shift 2
        ;;
      --crush-blacks)
        CRUSH_BLACKS=1
        LOSSLESS=1
        shift
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
        fail "Unknown option for image mode: $1"
        ;;
      *)
        break
        ;;
    esac
  done

  [[ -n "$KIND" ]] || fail "image mode requires --kind"
  (($# == 2)) || fail "image mode expects <input-file> <output.webp>"

  convert_static_image "$1" "$2"
}

parse_frames_mode() {
  while (($# > 0)); do
    case "$1" in
      --clip)
        (($# >= 2)) || fail "--clip requires a value"
        CLIP="$2"
        shift 2
        ;;
      --crush-blacks)
        CRUSH_BLACKS=1
        LOSSLESS=1
        shift
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
        fail "Unknown option for frames mode: $1"
        ;;
      *)
        break
        ;;
    esac
  done

  [[ -n "$CLIP" ]] || fail "frames mode requires --clip"
  (($# == 2)) || fail "frames mode expects <input-dir> <output-root>"

  convert_frame_directory "$1" "$2"
}

require_command find
require_command grep
require_command sort
require_command ffprobe

(($# >= 1)) || {
  usage >&2
  exit 1
}

MODE="$1"
shift

case "$MODE" in
  image)
    parse_image_mode "$@"
    ;;
  frames)
    parse_frames_mode "$@"
    ;;
  -h|--help)
    usage
    ;;
  *)
    fail "Unknown mode: $MODE"
    ;;
esac
