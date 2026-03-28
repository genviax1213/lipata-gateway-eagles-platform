import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installChunkRecovery } from './utils/chunkRecovery.ts'

installChunkRecovery()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('React root element not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
