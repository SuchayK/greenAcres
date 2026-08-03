"""Green Acres prediction service.

GET /predict?nitrogen=&phosphorus=&potassium=&temperature=&humidity=&ph=&rainfall=
    -> {"input": {...}, "keras_prediction": [...22], "tflite_prediction": [...22]}

See FIXES.md for what changed relative to the competition version on `main`.
"""

import os

import numpy as np
import tensorflow as tf
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Model files sit next to this script. The old code passed bare relative paths,
# which meant the service only started if your working directory happened to be
# frontend/response. Anchoring to __file__ lets it run from anywhere.
HERE = os.path.dirname(os.path.abspath(__file__))

keras_model = tf.keras.models.load_model(os.path.join(HERE, "my_model.keras"))
tflite_interpreter = tf.lite.Interpreter(os.path.join(HERE, "optimized_model.tflite"))
tflite_interpreter.allocate_tensors()
tflite_input_details = tflite_interpreter.get_input_details()
tflite_output_details = tflite_interpreter.get_output_details()

# Feature order must match the order the model was trained on.
FEATURES = ("nitrogen", "phosphorus", "potassium",
            "temperature", "humidity", "ph", "rainfall")

# Rejected outside these ranges. Wide enough not to fight real data, tight
# enough to catch a missing field arriving as 0 or a swapped-argument mistake.
BOUNDS = {
    "nitrogen": (0, 300),
    "phosphorus": (0, 300),
    "potassium": (0, 300),
    "temperature": (-50, 60),     # Celsius
    "humidity": (0, 100),         # percent
    "ph": (0, 14),
    "rainfall": (0, 2000),        # mm
}


@app.route("/")
def home():
    # The old code called render_template("ai.html"), but there is no templates/
    # directory, so this route raised TemplateNotFound on every request. The page
    # is a static file sitting beside this script.
    return send_from_directory(HERE, "ai.html")


@app.route("/<path:filename>")
def static_files(filename):
    """Serves ai.css / ai.js so the page works when opened through Flask."""
    return send_from_directory(HERE, filename)


@app.route("/health")
def health():
    return jsonify({"status": "ok", "features": list(FEATURES)})


def parse_features(args):
    """Validates and returns the 7 features, or raises ValueError."""
    values = []
    for name in FEATURES:
        raw = args.get(name)
        if raw is None or raw == "":
            raise ValueError(f"missing required parameter: {name}")
        try:
            value = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"{name} must be a number, got {raw!r}")
        if not np.isfinite(value):
            raise ValueError(f"{name} must be finite, got {raw!r}")
        low, high = BOUNDS[name]
        if not low <= value <= high:
            raise ValueError(f"{name} must be between {low} and {high}, got {value}")
        values.append(value)
    return values


@app.route("/predict", methods=["GET"])
def predict():
    # The old handler wrapped everything in a bare try/except and returned the
    # exception string with HTTP 200, so a bad request looked like a success to
    # the caller. Validation errors are now 400 and unexpected ones are 500.
    try:
        values = parse_features(request.args)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        features = np.array([values], dtype=np.float32)

        keras_prediction = keras_model.predict(features, verbose=0)

        tflite_interpreter.set_tensor(tflite_input_details[0]["index"], features)
        tflite_interpreter.invoke()
        tflite_prediction = tflite_interpreter.get_tensor(
            tflite_output_details[0]["index"]
        )

        return jsonify({
            "input": dict(zip(FEATURES, values)),
            "keras_prediction": keras_prediction[0].tolist(),
            "tflite_prediction": tflite_prediction[0].tolist(),
        })
    except Exception as exc:  # noqa: BLE001 - surfaced to the client as a 500
        app.logger.exception("prediction failed")
        return jsonify({"error": f"prediction failed: {exc}"}), 500


if __name__ == "__main__":
    app.run(debug=True)
