import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { seedIfEmpty } from './db/seed.ts'

async function bootstrap() {
  await seedIfEmpty()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
