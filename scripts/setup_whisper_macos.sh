#!/usr/bin/env bash
set -euo pipefail

echo "[setup] Installing whisper-cpp via Homebrew (requires brew)..."
if ! command -v brew >/dev/null 2>&1; then
  echo "[error] Homebrew not found. Install from https://brew.sh/ and re-run."
  exit 1
fi

brew update
brew install whisper-cpp || true

WHISPER_BIN="/opt/homebrew/bin/whisper-cpp"
if [ ! -x "$WHISPER_BIN" ]; then
  echo "[warn] whisper-cpp not found at $WHISPER_BIN. If on Intel Mac, check /usr/local/bin/whisper-cpp"
fi

MODEL_DIR="$(cd "$(dirname "$0")/.." && pwd)/models"
mkdir -p "$MODEL_DIR"
MODEL_PATH="$MODEL_DIR/ggml-base.bin"

if [ ! -f "$MODEL_PATH" ]; then
  echo "[setup] Downloading ggml-base.bin model (~140MB)..."
  curl -L -o "$MODEL_PATH" "https://ggml.ggerganov.com/ggml-model-whisper-base.bin"
else
  echo "[setup] Model already present: $MODEL_PATH"
fi

echo "[setup] Done. To use transcription, you can set (optional):"
echo "  export WHISPER_BIN=$WHISPER_BIN"
echo "  export WHISPER_MODEL=$MODEL_PATH"
echo "If not set, server will try these defaults. Restart with: npm start"


