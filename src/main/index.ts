import { app, BrowserWindow, screen, ipcMain, Tray, nativeImage } from 'electron'
import { join } from 'path'
import * as dotenv from 'dotenv'
import { App as SlackApp } from '@slack/bolt'
import { WebClient } from '@slack/web-api'
import { loadSettings, saveSettings } from './settings'
import type { Settings } from './settings'

// .envをロード（開発時はプロジェクトルート、本番時はappPath配下）
dotenv.config({ path: join(__dirname, '../../.env') })
dotenv.config({ path: join(process.cwd(), '.env') })

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let currentSlackApp: InstanceType<typeof SlackApp> | null = null
let webClient: WebClient | null = null
let currentSettings: Settings = { channelIds: [], displayIndex: 0 }

function initWebClient(): void {
  const botToken = process.env.SLACK_BOT_TOKEN
  if (botToken && !botToken.startsWith('xoxb-your')) {
    webClient = new WebClient(botToken)
  }
}

function getDisplayBounds(index: number): Electron.Rectangle {
  const displays = screen.getAllDisplays()
  const display = displays[index] ?? displays[0]
  return display.workArea
}

function createWindow(): void {
  const bounds = getDisplayBounds(currentSettings.displayIndex)

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.setIgnoreMouseEvents(true, { forward: true })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 660,
    resizable: false,
    title: 'コメントアプリ 設定',
    webPreferences: {
      preload: join(__dirname, '../preload/settings.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    settingsWindow.loadURL(rendererUrl.replace(/\/$/, '') + '/settings.html')
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'))
  }
}

function setupTray(): void {
  const iconPath = join(__dirname, '../../resources/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  if (!icon.isEmpty()) {
    icon.setTemplateImage(true)
  }
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('コメントアプリ 設定')
  tray.on('click', () => {
    createSettingsWindow()
  })
}

function sendCommentToRenderer(text: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('slack-comment', text)
  }
}

async function startSlack(channelIds: string[]): Promise<void> {
  if (currentSlackApp) {
    try {
      await currentSlackApp.stop()
    } catch (_) {
      // ignore
    }
    currentSlackApp = null
  }

  if (channelIds.length === 0) {
    console.log('[Slack] 監視チャンネルが未設定です。設定UIからチャンネルIDを追加してください。')
    return
  }

  const botToken = process.env.SLACK_BOT_TOKEN
  const appToken = process.env.SLACK_APP_TOKEN

  if (!botToken || !appToken) {
    console.log('[Slack] トークンが未設定です。.envを確認してください。')
    return
  }

  if (botToken.startsWith('xoxb-your') || appToken.startsWith('xapp-your')) {
    console.log('[Slack] .envにスタブ値が設定されています。実際のトークンを設定してください。')
    return
  }

  try {
    const slackApp = new SlackApp({
      token: botToken,
      appToken: appToken,
      socketMode: true
    })
    currentSlackApp = slackApp

    slackApp.message(async ({ message }) => {
      if (message.subtype) return

      const text = (message as { text?: string }).text
      if (!text) return

      const channel = (message as { channel?: string }).channel
      console.log(`[Slack] メッセージ受信: channel=${channel}, 監視対象=${channelIds.join(',')}`)

      if (!channelIds.includes(channel ?? '')) {
        console.log(`[Slack] チャンネル不一致のためスキップ`)
        return
      }

      console.log(`[Slack] コメント送信: ${text}`)
      sendCommentToRenderer(text)
    })

    await slackApp.start()
    console.log(`[Slack] Socket Mode で接続しました (チャンネル: ${channelIds.join(', ')})`)
  } catch (err) {
    console.error('[Slack] 起動エラー:', err)
  }
}

function setupIpcHandlers(): void {
  ipcMain.handle('get-settings', () => currentSettings)

  ipcMain.handle('get-displays', () => {
    const primary = screen.getPrimaryDisplay()
    return screen.getAllDisplays().map((d, i) => ({
      index: i,
      label: `ディスプレイ ${i + 1} (${d.size.width} × ${d.size.height})`,
      bounds: d.bounds,
      isPrimary: d.id === primary.id
    }))
  })

  ipcMain.handle('get-all-channels', async () => {
    if (!webClient) {
      return { error: 'Slackトークンが未設定です', channels: [] }
    }
    try {
      const channels: { id: string; name: string }[] = []
      let cursor: string | undefined
      do {
        const result = await webClient.conversations.list({
          types: 'public_channel',
          limit: 200,
          exclude_archived: true,
          cursor
        })
        for (const c of result.channels ?? []) {
          if (c.id && c.name) channels.push({ id: c.id, name: c.name })
        }
        cursor = result.response_metadata?.next_cursor || undefined
      } while (cursor)
      channels.sort((a, b) => a.name.localeCompare(b.name))
      return { channels }
    } catch (e) {
      console.error('[Slack] チャンネル一覧取得エラー:', e)
      return { error: String(e), channels: [] }
    }
  })

  ipcMain.handle('save-settings', async (_event, newSettings: Settings) => {
    saveSettings(newSettings)
    currentSettings = newSettings

    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = getDisplayBounds(newSettings.displayIndex)
      mainWindow.setBounds(bounds)
    }

    await startSlack(newSettings.channelIds)
  })

  ipcMain.on('close-settings-window', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close()
    }
  })
}

app.whenReady().then(async () => {
  currentSettings = loadSettings()
  initWebClient()
  setupIpcHandlers()
  createWindow()
  setupTray()
  await startSlack(currentSettings.channelIds)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
