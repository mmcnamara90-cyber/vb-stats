import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { PlayerVoteApp } from './features/captains/vote/PlayerVoteApp.tsx'

// Hash-based routing (no router library, and no server-side rewrites
// available on GitHub Pages' static hosting) — a `#vote` link opens the
// player captain-vote flow instead of the coach app, entirely separate
// login included. Decided once at load, not reactive to later hash
// changes: the two flows are never meant to hand off to each other
// client-side, only via a distinct link the coach shares.
const isVoteRoute = window.location.hash === '#vote'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isVoteRoute ? <PlayerVoteApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
