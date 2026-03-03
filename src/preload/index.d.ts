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

interface OverlayState {
  commentsEnabled: boolean
  demoMode: boolean
  speed: number
  fontSize: number
  opacity: number
}

declare global {
  interface Window {
    api: {
      onComment: (callback: (text: string) => void) => () => void
      onOverlayState: (callback: (state: OverlayState) => void) => () => void
      requestOverlayState: () => Promise<void>
      getEmojiMap: () => Promise<Record<string, string>>
    }
    settingsApi: {
      getSettings: () => Promise<Settings & { demoModeActive: boolean }>
      saveSettings: (s: Settings) => Promise<void>
      getDisplays: () => Promise<DisplayInfo[]>
      getAllChannels: () => Promise<{ channels: ChannelInfo[]; error?: string }>
      setDemoMode: (active: boolean) => Promise<void>
      previewOverlayState: (state: { commentsEnabled: boolean; speed: number; fontSize: number; opacity: number }) => Promise<void>
      closeWindow: () => void
    }
  }
}

export {}
