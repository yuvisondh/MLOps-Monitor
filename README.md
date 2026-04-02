## MLOps Fraud Monitoring Dashboard

Production-style monitoring stack for a credit card fraud model:
- Flask inference API
- PostgreSQL prediction logging
- Evidently drift reporting
- React monitoring dashboard

## Local Run

Backend:
```bash
python app.py
```

Frontend:
```bash
cd frontend
npm start
```

## Model Evaluation

```bash
python evaluate_model.py
```

## Deployment

### Backend on Render

This repo includes:
- `Dockerfile`
- `requirements.txt`
- `render.yaml`

Required environment variables:
- `DATABASE_URL`
- `PREDICTION_THRESHOLD` (optional, default `0.5`)
- `CORS_ORIGINS`
- `MODEL_PATH`
- `SCALER_PATH`
- `REFERENCE_DATA_PATH`

Important: the files `fraud_model.pkl`, `scaler.pkl`, and `reference_data.csv` are currently ignored by git, so Render will not receive them automatically from this repository. Before deployment, do one of these:

1. Track those files in git deliberately.
2. Mount or copy them into the Render service at deploy time.
3. Download them from cloud storage during startup.

Without those files, the API will fail at startup.

### Frontend on Netlify

The frontend includes `frontend/netlify.toml`.

Set this environment variable in Netlify:
- `REACT_APP_API_BASE_URL=https://<your-render-service>.onrender.com`

Build settings:
- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `build`
