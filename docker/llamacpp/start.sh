#!/usr/bin/env bash
set -euo pipefail

# Supported model: https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/tree/main
MODEL=/model/SmolVLM-500M-Instruct-f16.gguf
MMPROJ=/model/mmproj-SmolVLM-500M-Instruct-f16.gguf

if [ ! -f "$MODEL" ]; then
    echo "* downloading SmolVLM-500M-Instruct (f16)…"
    wget -O "$MODEL" \
     https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/SmolVLM-500M-Instruct-f16.gguf
fi

if [ ! -f "$MMPROJ" ]; then
  echo "* downloading SmolVLM-500M-Instruct mmproj (f16)…"
  wget -O "$MMPROJ" \
   https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/mmproj-SmolVLM-500M-Instruct-f16.gguf
fi

echo "* starting llama.cpp server on :7860 with improved vision parameters"
(/opt/llama.cpp/server -m "$MODEL" --mmproj "$MMPROJ" \
  --host 0.0.0.0 --port 7860 \
  -ngl 99 \
  --ctx-size 4096 \
  --batch-size 512 \
  --temp 0.1 \
  --repeat-penalty 1.1 \
  --seed 42 \
  --n-predict 256) &
sleep 5

echo "* starting Flask CORS proxy on :8080"
exec python3 /opt/llama.cpp/cors_proxy.py 