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
const DEFAULT_V_VALUES = Array(28).fill(0).join(', ')
const HEALTH_RETRY_DELAYS_MS = [0, 2000, 5000]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function App() {
  const [predictions, setPredictions] = useState([])
  const [driftData, setDriftData] = useState(null)
  const [summaryData, setSummaryData] = useState(null)
  const [health, setHealth] = useState(false)
  const [apiError, setApiError] = useState('')
  const [formTime, setFormTime] = useState('00:30')
  const [formAmount, setFormAmount] = useState('50')
  const [formVValues, setFormVValues] = useState(DEFAULT_V_VALUES)
  const [lastPrediction, setLastPrediction] = useState(null)

  const fetchHealthWithRetry = async () => {
    for (const delayMs of HEALTH_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await sleep(delayMs)
      }

      try {
        const healthRes = await axios.get(`${API_BASE}/health`, { timeout: 10000 })
        if (healthRes.data.status === 'ok') {
          return true
        }
      } catch {
        // Keep retrying; Render can take time to wake from cold start.
      }
    }

    return false
  }

  const fetchDashboardData = useCallback(async () => {
    setApiError('')

    const isHealthy = await fetchHealthWithRetry()
    setHealth(isHealthy)

    if (!isHealthy) {
      setApiError('API is offline or waking up. Try again in a few seconds.')
      setHealth(false)
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
      const rawIndex = Math.floor(pred.confidence * 10)
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

      {apiError && <p className="error-banner">{apiError}</p>}

      <section className="card">
        <h2>Quick Prediction</h2>
        <form className="prediction-form" onSubmit={submitPrediction}>
          <div className="form-grid">
            <label>
              Transaction Time (24h)
              <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} />
            </label>
            <label>
              Amount
              <input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} />
            </label>
          </div>
          <p className="time-help-text">
            Model Time value sent: {(() => {
              const [h = '0', m = '0'] = (formTime || '00:00').split(':')
              return (Number(h) * 3600) + (Number(m) * 60)
            })()} seconds
          </p>
          <label>
            V1-V28 (comma-separated)
            <textarea
              rows="3"
              value={formVValues}
              onChange={e => setFormVValues(e.target.value)}
            />
          </label>
          <button type="submit">Run Prediction</button>
        </form>
        {lastPrediction && (
          <div className="prediction-result">
            <strong>Latest Result:</strong> {lastPrediction.label} ({(lastPrediction.confidence * 100).toFixed(2)}%)
          </div>
        )}
      </section>

      <section className="card">
        <h2>Model Summary</h2>
        {summaryData ? (
          <div className="drift-metrics">
            <div className="drift-metric">
              <div className="metric-label">Threshold</div>
              <div className="metric-value">{summaryData.threshold}</div>
            </div>
            <div className="drift-metric">
              <div className="metric-label">Avg Confidence (24h)</div>
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

      <section className="card">
        <h2>Recent Predictions</h2>
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
                <td>{(pred.confidence * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
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
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Not enough predictions yet — send at least 10 transactions to enable drift detection.
          </p>
        )}
      </section>
      <section className="card">
        <h2>Confidence Over Time</h2>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[...predictions].reverse()}>
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
                dataKey="confidence"
                stroke="#3b82f6"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card">
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

