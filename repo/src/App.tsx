import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth.ts'
import { AppRouter } from './router/index.tsx'
import { ToastProvider } from './components/ui/Toast.tsx'
import { fishService } from './services/fishService.ts'
import { campaignService } from './services/campaignService.ts'
import { orderService } from './services/orderService.ts'
import { notificationService } from './services/notificationService.ts'

function App() {
  useEffect(() => {
    // Process any notifications that were pending at last shutdown immediately on startup.
    void notificationService.processRetryQueue()

    const minuteTimer = window.setInterval(() => {
      void fishService.processScheduledPublish()
      void campaignService.checkAndCloseExpired()
      void orderService.autoCloseUnpaid()
    }, 60_000)

    const retryTimer = window.setInterval(() => {
      void notificationService.processRetryQueue()
    }, 30_000)

    return () => {
      window.clearInterval(minuteTimer)
      window.clearInterval(retryTimer)
    }
  }, [])

  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
