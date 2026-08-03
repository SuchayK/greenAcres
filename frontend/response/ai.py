import os

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import numpy as np
import tensorflow as tf

app = Flask(__name__)
CORS(app)

# Resolve model and page paths against this file rather than the working directory,
# so the service can be started from anywhere.
HERE = os.path.dirname(os.path.abspath(__file__))

keras_model = tf.keras.models.load_model(os.path.join(HERE, 'my_model.keras'))
tflite_interpreter = tf.lite.Interpreter(os.path.join(HERE, "optimized_model.tflite"))
tflite_interpreter.allocate_tensors()
tflite_input_details = tflite_interpreter.get_input_details()
tflite_output_details = tflite_interpreter.get_output_details()

FEATURES = ('nitrogen', 'phosphorus', 'potassium', 'temperature', 'humidity', 'ph', 'rainfall')


@app.route('/')
def home():
    # Served as a static file -- there is no templates/ directory, so the previous
    # render_template('ai.html') raised TemplateNotFound on every request.
    return send_from_directory(HERE, 'ai.html')


@app.route('/<path:filename>')
def static_asset(filename):
    return send_from_directory(HERE, filename)


@app.route('/predict', methods=['GET'])
def predict():
    try:
        missing = [f for f in FEATURES if request.args.get(f) is None]
        if missing:
            return jsonify({'error': 'missing required parameters: ' + ', '.join(missing)}), 400
        try:
            values = [float(request.args.get(f)) for f in FEATURES]
        except ValueError:
            return jsonify({'error': 'all parameters must be numeric'}), 400

        nitrogen, phosphorus, potassium, temperature, humidity, ph, rainfall = values
        input_features = np.array([values], dtype=np.float32)

        keras_prediction = keras_model.predict(input_features)

        tflite_interpreter.set_tensor(tflite_input_details[0]['index'], np.array(input_features, dtype=np.float32))
        tflite_interpreter.invoke()
        tflite_prediction = tflite_interpreter.get_tensor(tflite_output_details[0]['index'])
        
        agriData = {
            'input': {
                'Nitrogen': nitrogen,
                'Phosphorus': phosphorus,
                'Potassium': potassium,
                'Temperature': temperature,
                'Humidity': humidity,
                'pH': ph,
                'Rainfall': rainfall
            },
            'keras_prediction': keras_prediction[0].tolist(),
            'tflite_prediction': tflite_prediction[0].tolist()
        }
        agriJson = jsonify(agriData)
        agriJson.headers.add('Access-Control-Allow-Origin', '*')
        return agriJson
    except Exception as e:
        # Previously returned 200 with an error body, so callers could not tell a
        # failed prediction from a successful one.
        app.logger.exception("prediction failed")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Werkzeug's debugger allows arbitrary code execution, so keep it opt-in.
    app.run(debug=os.environ.get("FLASK_DEBUG", "") == "1")