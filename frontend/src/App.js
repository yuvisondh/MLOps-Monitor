import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'

const API_BASE = 'http://127.0.0.1:5001'

function App() {
  const [predictions, setPredictions] = useState([])
  const [driftData, setDriftData] = useState(null)
  const [health, setHealth] = useState(false)

  useEffect(() => {
    axios.get(`${API_BASE}/health`)
      .then(res => setHealth(res.data.status === 'ok'))

    axios.get(`${API_BASE}/predictions/recent`)
      .then(res => setPredictions(res.data))

    axios.get(`${API_BASE}/drift-report`)
      .then(res => setDriftData(res.data))
  }, [])

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>MLOps Monitoring Dashboard</h1>
        <span className={`status-badge ${health ? '' : 'offline'}`}>
          {health ? '● Online' : '● Offline'}
        </span>
      </div>

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
            {predictions.map(pred => (
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
          <p>Loading drift data...</p>
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
    </div>
  )
}

export default App

