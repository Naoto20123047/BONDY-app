import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App.tsx'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWAのインストール判定(beforeinstallprompt)にはfetchを処理するService Workerの
// 登録が必要なため登録する。詳細は public/sw.js のコメント参照
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.error('Service Workerの登録に失敗しました', e)
    })
  })
}