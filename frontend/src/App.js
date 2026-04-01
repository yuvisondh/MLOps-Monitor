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
      <p>Predictions loaded: {predictions.length}</p>
      <p>Drift: {driftData ? JSON.stringify(driftData) : 'Loading...'}</p>
    </div>
  )
}

export default App

