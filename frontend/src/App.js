import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import './App.css'

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:5001'

// Render free-tier cold starts can take 60–180 s.  Strategy: a few quick
// pings (short timeout) followed by progressively longer waits so we don't
// give up before the server finishes booting.
const WAKE_STEPS = [
  { delay: 0,     timeout: 10000 },   // instant ping
  { delay: 3000,  timeout: 10000 },
  { delay: 6000,  timeout: 10000 },
  { delay: 10000, timeout: 30000 },   // server may still be booting
  { delay: 15000, timeout: 30000 },
  { delay: 20000, timeout: 60000 },   // long wait — covers ~120 s cold start
  { delay: 30000, timeout: 60000 },   // ~180 s cumulative
  { delay: 40000, timeout: 60000 },   // safety net
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Raw model output is fraud probability (0 = legit, 1 = fraud).
// Display confidence = how sure the model is about the label it picked.
const displayConfidence = (fraudProb, label) =>
  label === 'fraud' ? fraudProb : 1 - fraudProb

const SAMPLE_TRANSACTIONS = [
  {
    name: 'Legitimate — Small Purchase',
    time: '09:51',
    amount: '31.00',
    v: '1.3996, -0.5907, 0.1686, -1.0300, -0.5398, 0.0404, -0.7126, 0.0023, -0.9717, 0.7568, 0.5438, 0.1125, 1.0754, -0.2458, 0.1805, 1.7699, -0.5332, -0.5333, 1.1922, 0.2129, 0.1024, 0.1683, -0.1666, -0.8102, 0.5051, -0.2323, 0.0114, 0.0046',
  },
  {
    name: 'Suspicious — Unusual Pattern',
    time: '22:25',
    amount: '1.50',
    v: '-0.4321, 1.6479, -1.6694, -0.3495, 0.7858, -0.6306, 0.2770, 0.5860, -0.4847, -1.3766, -1.3283, 0.2236, 1.1326, -0.5509, 0.6166, 0.4980, 0.5022, 0.9813, 0.1013, -0.2446, 0.3589, 0.8737, -0.1786, -0.0172, -0.2074, -0.1578, -0.2374, 0.0019',
  },
  {
    name: 'Fraud — High-Risk Transaction',
    time: '11:31',
    amount: '364.19',
    v: '-16.5265, 8.5850, -18.6499, 9.5056, -13.7938, -2.8324, -16.7017, 7.5173, -8.5071, -14.1102, 5.2992, -10.8340, 1.6711, -9.3739, 0.3608, -9.8992, -19.2363, -8.3986, 3.1017, -1.5149, 1.1907, -1.1277, -2.3586, 0.6735, -1.4137, -0.4628, -2.0186, -1.0428',
  },
]

function App() {
  const [predictions, setPredictions] = useState([])
  const [driftData, setDriftData] = useState(null)
  const [summaryData, setSummaryData] = useState(null)
  const [health, setHealth] = useState(false)
  const [apiError, setApiError] = useState('')
  const [formTime, setFormTime] = useState(SAMPLE_TRANSACTIONS[0].time)
  const [formAmount, setFormAmount] = useState(SAMPLE_TRANSACTIONS[0].amount)
  const [formVValues, setFormVValues] = useState(SAMPLE_TRANSACTIONS[0].v)
  const [lastPrediction, setLastPrediction] = useState(null)
  const [wakeStatus, setWakeStatus] = useState('connecting') // 'connecting' | 'online' | 'offline'
  const [wakeAttempt, setWakeAttempt] = useState(0)

  const loadPreset = (preset) => {
    setFormTime(preset.time)
    setFormAmount(preset.amount)
    setFormVValues(preset.v)
  }

  const fetchHealthWithRetry = async () => {
    for (let i = 0; i < WAKE_STEPS.length; i++) {
      const { delay, timeout } = WAKE_STEPS[i]
      if (delay > 0) {
        await sleep(delay)
      }
      setWakeAttempt(i + 1)

      try {
        const healthRes = await axios.get(`${API_BASE}/health`, { timeout })
        if (healthRes.data.status === 'ok') {
          return true
        }
      } catch {
        // Render free tier can take up to 2-3 min to wake from cold start.
      }
    }

    return false
  }

  const fetchDashboardData = useCallback(async () => {
    setApiError('')
    setWakeStatus('connecting')

    const isHealthy = await fetchHealthWithRetry()
    setHealth(isHealthy)
    setWakeStatus(isHealthy ? 'online' : 'offline')

    if (!isHealthy) {
      setApiError('API could not be reached. It may still be waking up — try refreshing in 30 seconds.')
      return
    }

    const [predsResult, summaryResult, driftResult] = await Promise.allSettled([
      axios.get(`${API_BASE}/predictions/recent?limit=200`),
      axios.get(`${API_BASE}/metrics/summary`),
      axios.get(`${API_BASE}/drift-report`),
    ])

    if (predsResult.status === 'fulfilled') {
      setPredictions(predsResult.value.data)
    }

    if (summaryResult.status === 'fulfilled') {
      setSummaryData(summaryResult.value.data)
    }

    if (driftResult.status === 'fulfilled') {
      setDriftData(driftResult.value.data)
    } else {
      setDriftData(null)
    }

    if (predsResult.status === 'rejected' || summaryResult.status === 'rejected') {
      setApiError('Connected to API, but some dashboard sections failed to load. Auto-refresh will retry.')
    }
  }, [])

  useEffect(() => {
  fetchDashboardData()
  const interval = setInterval(fetchDashboardData, 30000)
  return () => clearInterval(interval)
}, [fetchDashboardData])

  const buildHistogramData = () => {
    const bins = Array.from({ length: 10 }, (_, idx) => ({
      range: `${idx * 10}-${(idx + 1) * 10}%`,
      count: 0,
    }))

    predictions.forEach(pred => {
      const conf = displayConfidence(pred.confidence, pred.label)
      const rawIndex = Math.floor(conf * 10)
      const index = Math.max(0, Math.min(9, rawIndex))
      bins[index].count += 1
    })

    return bins
  }

  const submitPrediction = async e => {
    e.preventDefault()

    const [hoursText, minutesText] = formTime.split(':')
    const parsedHours = Number(hoursText)
    const parsedMinutes = Number(minutesText)
    const parsedAmount = Number(formAmount)
    const parsedVValues = formVValues
      .split(',')
      .map(v => Number(v.trim()))
      .filter(v => !Number.isNaN(v))

    const parsedTime = (parsedHours * 3600) + (parsedMinutes * 60)

    if (Number.isNaN(parsedHours) || Number.isNaN(parsedMinutes) || Number.isNaN(parsedAmount)) {
      setApiError('Time (HH:MM) and amount must be valid numbers.')
      return
    }

    if (parsedHours < 0 || parsedHours > 23 || parsedMinutes < 0 || parsedMinutes > 59) {
      setApiError('Use valid military time from 00:00 to 23:59.')
      return
    }

    if (parsedVValues.length !== 28) {
      setApiError('Please provide exactly 28 comma-separated V1-V28 values.')
      return
    }

    try {
      setApiError('')
      const features = [parsedTime, ...parsedVValues, parsedAmount]
      const res = await axios.post(`${API_BASE}/predict`, { features })
      setLastPrediction(res.data)
      fetchDashboardData()
    } catch (err) {
      setApiError(err.response?.data?.error || err.message || 'Prediction request failed')
    }
  }

  const histogramData = buildHistogramData()

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>MLOps Monitoring Dashboard</h1>
        <span className={`status-badge ${health ? '' : 'offline'}`}>
          {health ? '● Online' : '● Offline'}
        </span>
      </div>

      {wakeStatus === 'connecting' && (
        <div className="wake-banner">
          <div className="wake-spinner" />
          <div>
            <strong>Waking up the API...</strong>
            <p>The backend runs on Render's free tier and sleeps after inactivity. Cold starts typically take 1–2 minutes — hang tight! (Attempt {wakeAttempt}/{WAKE_STEPS.length})</p>
          </div>
        </div>
      )}

      {wakeStatus === 'offline' && (
        <div className="error-banner">
          <strong>Could not reach the API.</strong> The Render backend may still be starting. Click <button className="inline-link-btn" onClick={fetchDashboardData}>Retry</button> or refresh in 30 seconds.
        </div>
      )}

      {apiError && wakeStatus !== 'offline' && <p className="error-banner">{apiError}</p>}

      {wakeStatus === 'online' && predictions.length === 0 && (
        <div className="info-banner">
          <strong>Welcome!</strong> This is a live MLOps fraud-detection pipeline. The API is online — use the presets below to submit sample transactions and watch the dashboard populate with predictions, confidence charts, and drift analysis.
        </div>
      )}

      <section className="card card-summary">
        <h2>Model Summary</h2>
        {summaryData ? (
          <div className="drift-metrics">
            <div className="drift-metric">
              <div className="metric-label">Threshold</div>
              <div className="metric-value">{summaryData.threshold}</div>
            </div>
            <div className="drift-metric">
              <div className="metric-label">Avg Fraud Probability (24h)</div>
              <div className="metric-value">{(summaryData.avg_confidence_last_24h * 100).toFixed(2)}%</div>
            </div>
            <div className="drift-metric">
              <div className="metric-label">Fraud Rate (24h)</div>
              <div className="metric-value">{(summaryData.fraud_rate_last_24h * 100).toFixed(2)}%</div>
            </div>
          </div>
        ) : (
          <p>Loading summary...</p>
        )}
      </section>

      <section className="card card-drift">
        <h2>Data Drift Status</h2>
        {driftData ? (
          <>
            <div className="drift-status">
              <span className={`drift-badge ${driftData.drift_detected ? 'detected' : 'clear'}`}>
                {driftData.drift_detected ? '⚠ Drift Detected' : '✓ No Drift'}
              </span>
            </div>
            <div className="drift-metrics">
              <div className="drift-metric">
                <div className="metric-label">Predictions Analyzed</div>
                <div className="metric-value">{driftData.num_predictions_analyzed}</div>
              </div>
              <div className="drift-metric">
                <div className="metric-label">Drifted Columns</div>
                <div className="metric-value">{driftData.number_of_drifted_columns} / 30</div>
              </div>
              <div className="drift-metric">
                <div className="metric-label">Drift Share</div>
                <div className="metric-value">{(driftData.share_of_drifted_columns * 100).toFixed(1)}%</div>
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: '#64748b' }}>
            Not enough predictions yet — send at least 10 transactions to enable drift detection.
          </p>
        )}
      </section>

      <section className="card card-predict">
        <h2>Quick Prediction</h2>

        <div className="preset-buttons">
          {SAMPLE_TRANSACTIONS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              className={`preset-btn preset-btn-${idx}`}
              onClick={() => loadPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <form className="prediction-form" onSubmit={submitPrediction}>
          <div className="form-grid">
            <label>
              Transaction Time (24h)
              <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} />
            </label>
            <label>
              Amount ($)
              <input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} />
            </label>
          </div>
          <details className="v-details">
            <summary>Advanced: V1–V28 PCA features</summary>
            <p className="v-help-text">
              These are PCA-transformed features from the original credit card dataset. Use a preset above or enter 28 comma-separated values.
            </p>
            <textarea
              rows="3"
              value={formVValues}
              onChange={e => setFormVValues(e.target.value)}
            />
          </details>
          <button type="submit" disabled={!health}>
            {health ? 'Run Prediction' : 'Waiting for API...'}
          </button>
        </form>
        {lastPrediction && (
          <div className="prediction-result">
            <strong>Latest Result:</strong> {lastPrediction.label} ({(displayConfidence(lastPrediction.confidence, lastPrediction.label) * 100).toFixed(2)}% confidence)
          </div>
        )}
      </section>

      <section className="card card-table">
        <h2>Recent Predictions</h2>
        <div className="table-scroll">
          <table className="predictions-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Time</th>
                <th>Label</th>
                <th>Amount</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {predictions.slice(0, 20).map(pred => (
                <tr key={pred.id}>
                  <td>{pred.id}</td>
                  <td>{new Date(pred.timestamp).toLocaleString()}</td>
                  <td className={pred.label === 'fraud' ? 'label-fraud' : 'label-legit'}>
                    {pred.label}
                  </td>
                  <td>${pred.amount?.toFixed(2)}</td>
                  <td>{(displayConfidence(pred.confidence, pred.label) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-chart-line">
        <h2>Confidence Over Time</h2>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[...predictions].reverse().map(p => ({ ...p, displayConf: displayConfidence(p.confidence, p.label) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="id"
                label={{ value: 'Prediction ID', position: 'insideBottom', offset: -2 }}
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                formatter={v => `${(v * 100).toFixed(1)}%`}
                labelFormatter={id => `Prediction #${id}`}
              />
              <Line
                type="monotone"
                dataKey="displayConf"
                stroke="#3b82f6"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card card-chart-bar">
        <h2>Confidence Histogram</h2>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}

export default App

