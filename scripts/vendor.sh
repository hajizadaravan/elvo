#!/usr/bin/env sh
# Səhnə üçün oflayn rejim: TF.js, MediaPipe və modelləri vendor/ qovluğuna endirir.
# Sonra Dilmanc internet olmadan işləyir (şriftlərdən başqa; onlar sistem şriftinə keçir).
set -e
cd "$(dirname "$0")/.."
mkdir -p vendor/tasks-vision/wasm vendor/models
V=0.10.14
curl -fsSL -o vendor/tf.min.js https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js
curl -fsSL -o vendor/tasks-vision/vision_bundle.mjs https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$V/vision_bundle.mjs
for f in vision_wasm_internal.js vision_wasm_internal.wasm vision_wasm_nosimd_internal.js vision_wasm_nosimd_internal.wasm; do
  curl -fsSL -o vendor/tasks-vision/wasm/$f https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$V/wasm/$f
done
curl -fsSL -o vendor/models/hand_landmarker.task https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
curl -fsSL -o vendor/models/pose_landmarker_lite.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
echo "Hazırdır: vendor/ doldu."
