# MLOps Monitoring Dashboard
**Built by Yuvraj Sondh — University of Calgary, 2nd Year CS**

A production MLOps monitoring system for a fraud detection neural network. 
The system serves real-time predictions, logs every transaction to a database, 
detects data drift, and displays calibrated confidence scores on a live dashboard.

Visitors can try it instantly — the dashboard wakes the API automatically, and 
preset transactions (legit, suspicious, fraud) let anyone test the pipeline 
without needing to understand PCA features.

**Live Dashboard:** https://mlops-monitor.vercel.app
**Live API:** https://mlops-api-k3r7.onrender.com/health


## Demo

[▶ Watch the demo on Loom](https://www.loom.com/share/ed82c705628d44c8a5bad190227833a4)

---

## What It Does

- Serves fraud detection predictions via a REST API with calibrated confidence scores
- Logs every prediction with features, confidence score, and timestamp to PostgreSQL
- Detects data drift using Evidently AI — compares recent predictions against training data
- Displays live predictions, drift status, and confidence charts on a 2-column React dashboard
- Auto-wakes the Render API on first visit with a spinner + retry indicator
- Provides preset sample transactions so visitors can test without technical knowledge
- Auto-refreshes every 30 seconds without page reload

---

## Dashboard

![Dashboard Top](assets/dashboard-top.png?v=2)
![Dashboard Bottom](assets/dashboard-bottom.png?v=2)

## Architecture
```
React Dashboard (Vercel)
        │
        │ HTTP requests
        ▼
Flask REST API (Render)
├── POST /predict
├── GET  /predictions/recent
├── GET  /drift-report
├── GET  /metrics/summary
└── GET  /health
        │
        ├─────────────────────────┐
        ▼                         ▼
Fraud Detection Model      PostgreSQL (Render)
(Neural Network)           └── predictions table
fraud_model.pkl                 ├── id, timestamp
scaler.pkl                      ├── 30 features (V1-V28, Time, Amount)
                                ├── prediction (0/1)
                                └── confidence score
        │                         │
        └─────────────────────────┘
                    │
                    ▼
            Evidently AI
            Drift Detection
            Compares last 100 predictions
            against 1000-row reference dataset
```

---

## Tech Stack

| Layer           | Technology                           |
|-----------------|--------------------------------------|
| ML Model        | TensorFlow/Keras Neural Network      |
| Backend         | Flask, Python                        |
| Database        | PostgreSQL (psycopg2)                |
| Drift Detection | Evidently AI                         |
| Frontend        | React, Recharts                      |
| Deployment      | Render (API + DB), Vercel (Frontend) |

---

## Model Performance

Trained with class weights (balanced), L2 regularization (1e-3), and label smoothing (0.05) on the UCI Credit Card Fraud dataset (284,807 transactions, 0.17% fraud rate):

| Metric    | Score |
|-----------|-------|
| ROC-AUC   | 0.989 |
| PR-AUC    | 0.740 |
| Recall    | 0.890 |
| Accuracy  | 0.990 |

Confidence is displayed as certainty in the predicted label — legit transactions show ~97% confidence, fraud shows ~98%, and borderline cases show lower values. The model was specifically tuned to avoid saturated (0% or 100%) outputs.

Model training code: [CreditCardModel repo](https://github.com/yuvisondh/CreditCardModel)

---

## Try It Yourself

Just visit the **[Live Dashboard](https://mlops-monitor.vercel.app)** — it will wake the API automatically and show a loading spinner while the backend starts (~30-60s on Render's free tier).

Once online, click one of the preset buttons:
- **Legitimate — Small Purchase** (green)
- **Suspicious — Unusual Pattern** (yellow)
- **Fraud — High-Risk Transaction** (red)

Or use curl:

**Send a legitimate transaction:**
```bash
curl -s -X POST https://mlops-api-k3r7.onrender.com/predict \
-H "Content-Type: application/json" \
-d '{"features": [35484, 1.3996, -0.5907, 0.1686, -1.0300, -0.5398, 0.0404, -0.7126, 0.0023, -0.9717, 0.7568, 0.5438, 0.1125, 1.0754, -0.2458, 0.1805, 1.7699, -0.5332, -0.5333, 1.1922, 0.2129, 0.1024, 0.1683, -0.1666, -0.8102, 0.5051, -0.2323, 0.0114, 0.0046, 31.0]}'
```

**Send a fraud transaction:**
```bash
curl -s -X POST https://mlops-api-k3r7.onrender.com/predict \
-H "Content-Type: application/json" \
-d '{"features": [41505, -16.5265, 8.5850, -18.6499, 9.5056, -13.7938, -2.8324, -16.7017, 7.5173, -8.5071, -14.1102, 5.2992, -10.8340, 1.6711, -9.3739, 0.3608, -9.8992, -19.2363, -8.3986, 3.1017, -1.5149, 1.1907, -1.1277, -2.3586, 0.6735, -1.4137, -0.4628, -2.0186, -1.0428, 364.19]}'
```

---

## Run Locally

**Backend:**
```bash
git clone https://github.com/yuvisondh/MLOps-Monitor
cd MLOps-Monitor
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

**Environment variables needed:**
```
DATABASE_URL=your_postgresql_connection_string
CORS_ORIGINS=http://localhost:3000
PREDICTION_THRESHOLD=0.5
```

---

## What I Learned

- Building and deploying a REST API that serves a trained ML model in production
- Logging prediction data to PostgreSQL for monitoring and auditability
- Detecting data drift using statistical tests with Evidently AI
- Building a responsive React dashboard with 2-column grid layout
- Retraining a model with proper regularization (L2, label smoothing, class weights) to produce calibrated probability outputs instead of saturated 0/1 values
- Handling cloud cold-start UX (Render free tier wake-up with retry + spinner)
- Deploying a full stack application across multiple cloud platforms