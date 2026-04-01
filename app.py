from flask import Flask, jsonify, request

import os
import pickle
import numpy as np
import sys
import pandas as pd
from evidently.legacy.report import Report
from evidently.legacy.metric_preset import DataDriftPreset

import psycopg2
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"])
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REFERENCE_DATA_PATH = os.path.join(BASE_DIR, "reference_data.csv")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "mlops_monitor")
DB_USER = os.getenv("DB_USER", "yuviss")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

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


def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )

@app.route('/drift-report', methods=['GET'])
def drift_report():
    columns = ['Time','V1','V2','V3','V4','V5','V6','V7','V8','V9','V10',
               'V11','V12','V13','V14','V15','V16','V17','V18','V19','V20',
               'V21','V22','V23','V24','V25','V26','V27','V28','Amount']

    if not os.path.exists(REFERENCE_DATA_PATH):
        return jsonify({'error': f'Reference data file not found: {REFERENCE_DATA_PATH}'}), 500

    try:
        # Load reference data
        reference = pd.read_csv(REFERENCE_DATA_PATH)

        # Load recent predictions from database
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT time, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14,
                   v15, v16, v17, v18, v19, v20, v21, v22, v23, v24, v25, v26, v27, v28, amount
            FROM predictions
            ORDER BY created_at DESC
            LIMIT 100
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        # Need at least 10 predictions to compare
        if len(rows) < 10:
            return jsonify({'error': 'Not enough predictions yet, need at least 10'}), 400

        # Convert to dataframe with matching column names
        current = pd.DataFrame(rows, columns=columns)
        # Keep oldest-to-newest order for easier time-based interpretation.
        current = current.iloc[::-1].reset_index(drop=True)

        # Run Evidently drift report
        report = Report(metrics=[DataDriftPreset()])
        report.run(reference_data=reference[columns], current_data=current)

        result = report.as_dict()
        drift_result = result['metrics'][0]['result']

        return jsonify({
            'drift_detected': drift_result['dataset_drift'],
            'num_predictions_analyzed': len(rows),
            'number_of_drifted_columns': drift_result['number_of_drifted_columns'],
            'share_of_drifted_columns': drift_result['share_of_drifted_columns']
        })
    except Exception as e:
        return jsonify({'error': f'Failed to generate drift report: {str(e)}'}), 500


def log_prediction_to_db(features_row, prediction, confidence):
    conn = get_db_connection()
    cur = conn.cursor()

    insert_query = """
        INSERT INTO predictions (
            time, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15,
            v16, v17, v18, v19, v20, v21, v22, v23, v24, v25, v26, v27, v28, amount,
            prediction, confidence
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s
        )
    """

    values = list(features_row) + [int(prediction), float(confidence)]
    cur.execute(insert_query, values)
    conn.commit()

    cur.close()
    conn.close()


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

    try:
        # Save request features + prediction output for monitoring/drift analysis.
        log_prediction_to_db(result, prediction, confidence)
    except Exception as e:
        print(f"WARNING: Failed to log prediction to DB: {e}")

    # Return the prediction and confidence as JSON
    return jsonify({'prediction': prediction,
        'label': 'fraud' if prediction == 1 else 'legit',
        'confidence': confidence})

@app.route('/predictions/recent', methods=['GET'])
def recent_predictions():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, created_at, prediction, confidence, amount
        FROM predictions
        ORDER BY created_at DESC
        LIMIT 20
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return jsonify([
        {
            'id': row[0],
            'timestamp': row[1].isoformat(),
            'prediction': row[2],
            'label': 'fraud' if row[2] == 1 else 'legit',
            'confidence': row[3],
            'amount': row[4]
        }
        for row in rows
    ])
    


@app.route('/health', methods=['GET'])
def health():  
     return jsonify({'status': 'ok'})


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001)

