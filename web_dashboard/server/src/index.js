import 'dotenv/config'
import './firebase-admin.js'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import zonesRoutes from './routes/zones.js'
import plantsRoutes from './routes/plants.js'
import devicesRoutes from './routes/devices.js'
import analyticsRoutes from './routes/analytics.js'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors({ origin: 'http://localhost:3000' }))
app.use(express.json())

app.use('/api/auth',      authRoutes)
app.use('/api/zones',     zonesRoutes)
app.use('/api/plants',    plantsRoutes)
app.use('/api/devices',   devicesRoutes)
app.use('/api/analytics', analyticsRoutes)

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`GrowNex server running on http://localhost:${PORT}`)
})
