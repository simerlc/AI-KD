import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { Provider as JotaiProvider } from 'jotai'
import { AppLayout } from './components/app-layout'
import { HomePage } from './pages/HomePage'
import { TaskPage } from './pages/TaskPage'
import { TasksListPage } from './pages/TasksListPage'
import { ThemeProvider } from './components/theme-provider'
import './index.css'

// Error boundary to catch runtime errors
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-background p-8">
          <div className="text-center max-w-lg">
            <h1 className="text-xl font-bold text-red-600 mb-4">Runtime Error</h1>
            <pre className="text-sm text-left bg-red-50 p-4 rounded overflow-auto max-h-64">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/apps"
          element={
            <AppLayout>
              <TasksListPage />
            </AppLayout>
          }
        />
        <Route
          path="/"
          element={
            <AppLayout>
              <HomePage />
            </AppLayout>
          }
        />
        <Route
          path="/apps/:appId"
          element={
            <AppLayout>
              <TaskPage />
            </AppLayout>
          }
        />
      </Routes>
    </ErrorBoundary>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JotaiProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster />
      </ThemeProvider>
    </JotaiProvider>
  </StrictMode>,
)
