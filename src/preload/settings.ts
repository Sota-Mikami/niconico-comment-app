import { contextBridge, ipcRenderer } from 'electron'
import type { Settings } from '../main/settings'

const settingsApi = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (s: Settings): Promise<void> => ipcRenderer.invoke('save-settings', s),
  getDisplays: (): Promise<
    {
      index: number
      label: string
      bounds: { x: number; y: number; width: number; height: number }
      isPrimary: boolean
    }[]
  > => ipcRenderer.invoke('get-displays'),
  getAllChannels: (): Promise<{ channels: { id: string; name: string }[]; error?: string }> =>
    ipcRenderer.invoke('get-all-channels'),
  closeWindow: (): void => ipcRenderer.send('close-settings-window')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('settingsApi', settingsApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.settingsApi = settingsApi
}
