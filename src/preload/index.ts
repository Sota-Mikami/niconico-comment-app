import { contextBridge, ipcRenderer } from 'electron'

// リスナーはモジュール起動時に1度だけ登録。コールバック参照を差し替える方式。
let currentCallback: ((text: string) => void) | null = null

ipcRenderer.on('slack-comment', (_event, text: string) => {
  if (currentCallback) currentCallback(text)
})

const api = {
  onComment: (callback: (text: string) => void) => {
    currentCallback = callback
    return () => {
      currentCallback = null
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
