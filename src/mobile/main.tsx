import React from 'react'
import ReactDOM from 'react-dom/client'

import { App } from './App'
import './styles/mobile.css'

ReactDOM.createRoot(document.getElementById('mobile-root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
