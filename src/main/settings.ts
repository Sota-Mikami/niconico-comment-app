import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export interface Settings {
  channelIds: string[]
  displayIndex: number
  commentsEnabled: boolean
  speed: number
  fontSize: number
  opacity: number
}

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

const DEFAULT_SETTINGS: Settings = {
  channelIds: [],
  displayIndex: 0,
  commentsEnabled: true,
  speed: 180,
  fontSize: 36,
  opacity: 1.0
}

export function loadSettings(): Settings {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = readFileSync(SETTINGS_PATH, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<Settings>
      return {
        channelIds: Array.isArray(parsed.channelIds) ? parsed.channelIds : DEFAULT_SETTINGS.channelIds,
        displayIndex: typeof parsed.displayIndex === 'number' ? parsed.displayIndex : DEFAULT_SETTINGS.displayIndex,
        commentsEnabled: typeof parsed.commentsEnabled === 'boolean' ? parsed.commentsEnabled : true,
        speed: typeof parsed.speed === 'number' ? parsed.speed : 180,
        fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : 36,
        opacity: typeof parsed.opacity === 'number' ? parsed.opacity : 1.0
      }
    }
  } catch (e) {
    console.error('[Settings] 読み込みエラー:', e)
  }

  // .env の SLACK_CHANNEL_ID が設定されていれば移行
  const envChannelId = process.env.SLACK_CHANNEL_ID
  if (envChannelId) {
    const migrated: Settings = { channelIds: [envChannelId], displayIndex: 0, commentsEnabled: true, speed: 180, fontSize: 36, opacity: 1.0 }
    saveSettings(migrated)
    return migrated
  }

  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(settings: Settings): void {
  try {
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Settings] 保存エラー:', e)
  }
}
