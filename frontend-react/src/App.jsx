import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import HomePage from './pages/HomePage.jsx'
import VaultPage from './pages/VaultPage.jsx'
import SourcesPage from './pages/SourcesPage.jsx'

const IntelligencePage = lazy(() => import('./pages/IntelligencePage.jsx'))
const IntelCardsPage = lazy(() => import('./pages/IntelCardsPage.jsx'))
const CuratorPage = lazy(() => import('./pages/CuratorPage.jsx'))
const SubmitPage = lazy(() => import('./pages/SubmitPage.jsx'))
const WikiBrowserPage = lazy(() => import('./pages/WikiBrowserPage.jsx'))
const BattlecardsPage = lazy(() => import('./pages/BattlecardsPage.jsx'))

// Pages with their own built-in sidebars — suppress the global one
const NO_GLOBAL_SIDEBAR = ['/', '/intelligence', '/vault', '/battlecards', '/curator', '/sources']

function RouteFallback() {
  return (
    <div style={{
      height: '100%', width: '100%', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: 'rgba(0,0,0,0.35)', fontSize: 12, letterSpacing: '0.18em',
      textTransform: 'uppercase',
    }}>
      Loading…
    </div>
  )
}

function AppShell() {
  const location = useLocation()
  const noGlobalSidebar = NO_GLOBAL_SIDEBAR.includes(location.pathname)

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: '#f1f6fa' }}>
      {!noGlobalSidebar && <Sidebar />}
      <main className="flex-1 overflow-hidden">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/intelligence" element={<IntelligencePage />} />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/intel-cards" element={<IntelCardsPage />} />
            <Route path="/battlecards" element={<BattlecardsPage />} />
            <Route path="/wiki" element={<WikiBrowserPage />} />
            <Route path="/curator" element={<CuratorPage />} />
            <Route path="/submit" element={<SubmitPage />} />
            <Route path="/sources" element={<SourcesPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
