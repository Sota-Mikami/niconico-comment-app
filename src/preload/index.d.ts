import type { Settings } from '../main/settings'

interface DisplayInfo {
  index: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
}

interface ChannelInfo {
  id: string
  name: string
}

declare global {
  interface Window {
    api: {
      onComment: (callback: (text: string) => void) => () => void
    }
    settingsApi: {
      getSettings: () => Promise<Settings>
      saveSettings: (s: Settings) => Promise<void>
      getDisplays: () => Promise<DisplayInfo[]>
      getAllChannels: () => Promise<{ channels: ChannelInfo[]; error?: string }>
      closeWindow: () => void
    }
  }
}

export {}
