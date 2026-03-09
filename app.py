from flask import Flask, jsonify, request

import pickle
import numpy as np
import sys

app = Flask(__name__)

try:
    # Load the model and scaler
    model = pickle.load(open('fraud_model.pkl', 'rb'))
    scaler = pickle.load(open('scaler.pkl', 'rb'))
except FileNotFoundError as e:
    print(f"ERROR: Model file not found: {e}")
    sys.exit(1)  # Stop the app
except Exception as e:
    print(f"ERROR: Failed to load model: {e}")
    sys.exit(1)


def validate_features(data):
    """Validate that the request contains exactly 30 numeric features."""
    # Check if data is a dictionary
    if data is None or not isinstance(data, dict):
        return False, "Request body must be JSON with 'features' key"
    
    # Check if 'features' key exists
    if 'features' not in data:
        return False, "Missing required 'features' key in request body"
    
    features = data['features']
    
    # Check if features is a list or array
    if not isinstance(features, (list, tuple)):
        return False, "'features' must be a list or array"
    
    # Check if exactly 30 features are provided
    if len(features) != 30:
        return False, f"Expected 30 features, but got {len(features)}"
    
    # Check if all values are numeric
    try:
        numeric_features = [float(f) for f in features]
        return True, numeric_features
    except (ValueError, TypeError):
        return False, "All feature values must be numeric"


@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    
    # Validate input
    is_valid, result = validate_features(data)
    if not is_valid:
        return jsonify({'error': result}), 400
    
    # Use validated features
    features = np.array(result).reshape(1, -1)

    # scale only time and amount
    features[:,[0,29]] = scaler.transform(features[:,[0,29]])

    # Make prediction
    confidence = float(model.predict(features)[0,0])
    prediction = 1 if confidence > 0.5 else 0

    # Return the prediction and confidence as JSON
    return jsonify({'prediction': prediction,
        'label': 'fraud' if prediction == 1 else 'legit',
        'confidence': confidence})
    


@app.route('/health', methods=['GET'])
def hi():  
     return jsonify({'status': 'ok'})
if __name__ == '__main__':
    app.run(debug=True)

