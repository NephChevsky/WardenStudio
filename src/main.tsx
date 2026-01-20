import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { OAuthCallback } from './components/OAuthCallback.tsx'
import { TwitchOAuthService } from './services/TwitchOAuthService.ts'

const oauthService = new TwitchOAuthService(
  import.meta.env.VITE_TWITCH_CLIENT_ID || ''
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/callback" element={<OAuthCallback oauthService={oauthService} />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
