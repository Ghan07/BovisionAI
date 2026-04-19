"""
BovisionAI – Species Classification Microservice

Loads the Keras model once at startup and exposes a POST /predict endpoint.
Accepts a multipart image upload, resizes to (224, 224), runs inference,
and returns {"species": "cow"|"buffalo", "confidence": float}.

The model already includes preprocessing — DO NOT normalize manually.
"""

import os
import io
import numpy as np
from flask import Flask, request, jsonify
from PIL import Image

# Suppress TF info/warning logs
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import tensorflow as tf  # noqa: E402

app = Flask(__name__)

# ── Model loading (once at startup) ───────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "bovision_ai_classifier.h5")
CLASS_NAMES = ["buffalo", "cow"]  # index 0 → buffalo, index 1 → cow

print(f"[ml-service] Loading model from {MODEL_PATH} …")
try:
    model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    print(f"[ml-service] Model loaded. Input shape: {model.input_shape}")
except Exception as e:
    print("[ml-service] Model failed to load:", str(e))
    model = None

# ── Prediction endpoint ──────────────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
def predict():
    # Accept either a file upload or raw image bytes
    if "image" in request.files:
        img_bytes = request.files["image"].read()
    elif request.data:
        img_bytes = request.data
    else:
        return jsonify({"error": "No image provided"}), 400

    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img = img.resize((224, 224))

        # Convert to float32 array — shape (1, 224, 224, 3)
        # Model already includes preprocess_input, so just cast to float32.
        img_array = np.array(img, dtype=np.float32)
        img_array = np.expand_dims(img_array, axis=0)

        preds = model.predict(img_array, verbose=0)  # shape (1, 2)
        pred_index = int(np.argmax(preds[0]))
        confidence = float(preds[0][pred_index])

        return jsonify({
            "species": CLASS_NAMES[pred_index],
            "confidence": round(confidence, 4),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": model is not None})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", os.environ.get("ML_SERVICE_PORT", 5001)))
    print(f"[ml-service] Starting on port {port}")
    app.run(host="0.0.0.0", port=port)
