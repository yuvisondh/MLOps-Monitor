import { useState, useEffect } from 'react'
import axios from 'axios'
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
      <h1>MLOps Monitoring Dashboard</h1>
      <p>Model Status: {health ? '✅ Online' : '❌ Offline'}</p>
      <section>
      <h2>Recent Predictions</h2>
      <table>
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
              <td>{pred.label}</td>
              <td>${pred.amount?.toFixed(2)}</td>
              <td>{(pred.confidence * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>

      </table>
    </section>
      <section>
       <h2>Data Drift Status</h2>
         {driftData ? (
          <div>
           <p>{driftData.drift_detected ? '⚠️ Drift Detected' : '✅ No Drift'}</p>
           <p>Predictions analyzed: {driftData.num_predictions_analyzed}</p>
           <p>Drifted columns: {driftData.number_of_drifted_columns} / 30</p>
           <p>Drift share: {(driftData.share_of_drifted_columns * 100).toFixed(1)}%</p>
         </div>
     ) : (
    <p>Loading drift data...</p>
  )}
    </section>
    </div>
  )
}

export default App

