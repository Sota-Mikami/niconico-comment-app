import { app, BrowserWindow, screen, ipcMain, Tray, nativeImage, Menu } from 'electron'
import { join } from 'path'
import * as dotenv from 'dotenv'
import { App as SlackApp } from '@slack/bolt'
import { WebClient } from '@slack/web-api'
import { loadSettings, saveSettings } from './settings'
import type { Settings } from './settings'

// .envをロード（開発時はプロジェクトルート、本番時は userData 配下も試みる）
dotenv.config({ path: join(__dirname, '../../.env') })
dotenv.config({ path: join(process.cwd(), '.env') })

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let currentSlackApp: InstanceType<typeof SlackApp> | null = null
let webClient: WebClient | null = null
let currentSettings: Settings = { channelIds: [], displayIndex: 0, commentsEnabled: true, speed: 180, fontSize: 36, opacity: 1.0, botToken: '', appToken: '' }
let demoModeActive = false

/** settings または .env からトークンを取得（settings 優先） */
function getTokens(): { botToken: string | undefined; appToken: string | undefined } {
  return {
    botToken: currentSettings.botToken || process.env.SLACK_BOT_TOKEN || undefined,
    appToken: currentSettings.appToken || process.env.SLACK_APP_TOKEN || undefined
  }
}

function initWebClient(): void {
  const { botToken } = getTokens()
  if (botToken && !botToken.startsWith('xoxb-your')) {
    webClient = new WebClient(botToken)
  } else {
    webClient = null
  }
}

function getDisplayBounds(index: number): Electron.Rectangle {
  const displays = screen.getAllDisplays()
  const display = displays[index] ?? displays[0]
  return display.workArea
}

function sendOverlayState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-state', {
      commentsEnabled: currentSettings.commentsEnabled,
      demoMode: demoModeActive,
      speed: currentSettings.speed,
      fontSize: currentSettings.fontSize,
      opacity: currentSettings.opacity
    })
  }
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
  // macOS でフルスクリーンアプリの上にも表示されるよう最高レベルに設定
  mainWindow.setAlwaysOnTop(true, 'screen-saver')

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    sendOverlayState()
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
    height: 880,
    resizable: false,
    title: 'Niconico Slack Comment 設定',
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

async function restartApp(): Promise<void> {
  if (app.isPackaged) {
    // 本番: プロセスを完全に再起動
    if (currentSlackApp) {
      try { await currentSlackApp.stop() } catch (_) {}
      currentSlackApp = null
    }
    app.relaunch()
    app.exit(0)
  } else {
    // 開発中: electron-vite が Vite dev server を管理するため
    // ウィンドウは触らず、設定再読み込み + Slack 再接続のみ行う
    currentSettings = loadSettings()
    initWebClient()
    await startSlack(currentSettings.channelIds)
    sendOverlayState()
    // 設定ウィンドウが開いていれば再読み込み
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.reload()
    }
  }
}

function setupTray(): void {
  const iconPath = join(__dirname, '../../resources/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  if (!icon.isEmpty()) {
    icon.setTemplateImage(true)
  }
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('Niconico Slack Comment')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '設定を開く',
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: '再起動',
      click: () => restartApp()
    },
    {
      label: '終了',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)
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

  const { botToken, appToken } = getTokens()

  if (!botToken || !appToken) {
    console.log('[Slack] トークンが未設定です。設定UIまたは.envにトークンを入力してください。')
    return
  }

  if (botToken.startsWith('xoxb-your') || appToken.startsWith('xapp-your')) {
    console.log('[Slack] スタブ値が設定されています。実際のトークンを入力してください。')
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
  ipcMain.handle('get-settings', () => ({ ...currentSettings, demoModeActive }))

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
    const channelIdsChanged =
      JSON.stringify(newSettings.channelIds) !== JSON.stringify(currentSettings.channelIds)
    const displayChanged = newSettings.displayIndex !== currentSettings.displayIndex
    const tokenChanged =
      newSettings.botToken !== currentSettings.botToken ||
      newSettings.appToken !== currentSettings.appToken

    saveSettings(newSettings)
    currentSettings = newSettings

    if (displayChanged && mainWindow && !mainWindow.isDestroyed()) {
      const bounds = getDisplayBounds(newSettings.displayIndex)
      mainWindow.setBounds(bounds)
    }

    if (tokenChanged) {
      initWebClient()
    }

    if (channelIdsChanged || tokenChanged) {
      await startSlack(newSettings.channelIds)
    }

    sendOverlayState()
  })

  ipcMain.handle('set-demo-mode', (_event, active: boolean) => {
    demoModeActive = active
    sendOverlayState()
  })

  ipcMain.handle('preview-overlay-state', (_event, state: { commentsEnabled: boolean; speed: number; fontSize: number; opacity: number }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overlay-state', {
        ...state,
        demoMode: demoModeActive
      })
    }
  })

  ipcMain.handle('request-overlay-state', () => {
    sendOverlayState()
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
