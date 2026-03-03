import { contextBridge, ipcRenderer } from 'electron'

// リスナーはモジュール起動時に1度だけ登録。コールバック参照を差し替える方式。
let currentCallback: ((text: string) => void) | null = null

ipcRenderer.on('slack-comment', (_event, text: string) => {
  if (currentCallback) currentCallback(text)
})

export type OverlayState = {
  commentsEnabled: boolean
  demoMode: boolean
  speed: number
  fontSize: number
  opacity: number
}

let currentOverlayCallback: ((state: OverlayState) => void) | null = null

ipcRenderer.on('overlay-state', (_event, state: OverlayState) => {
  if (currentOverlayCallback) currentOverlayCallback(state)
})

const api = {
  onComment: (callback: (text: string) => void) => {
    currentCallback = callback
    return () => {
      currentCallback = null
    }
  },
  onOverlayState: (callback: (state: OverlayState) => void) => {
    currentOverlayCallback = callback
    return () => {
      currentOverlayCallback = null
    }
  },
  // マウント後に main プロセスへ初期 overlay-state を要求する
  requestOverlayState: (): Promise<void> => ipcRenderer.invoke('request-overlay-state')
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
