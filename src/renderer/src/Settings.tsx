import { useEffect, useRef, useState } from 'react'

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

interface Settings {
  channelIds: string[]
  displayIndex: number
  commentsEnabled: boolean
  speed: number
  fontSize: number
  opacity: number
}

declare global {
  interface Window {
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

// ---------------------------------------------------------------
// DisplayMap: 各ディスプレイを比例配置したミニマップ
// ---------------------------------------------------------------
interface DisplayMapProps {
  displays: DisplayInfo[]
  selectedIndex: number
  onSelect: (index: number) => void
}

function DisplayMap({ displays, selectedIndex, onSelect }: DisplayMapProps): JSX.Element {
  if (displays.length === 0) return <div className="display-map-empty">読み込み中...</div>

  const minX = Math.min(...displays.map((d) => d.bounds.x))
  const minY = Math.min(...displays.map((d) => d.bounds.y))
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
  const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))

  const totalW = maxX - minX
  const totalH = maxY - minY

  const containerW = 420
  const containerH = 120

  const scale = Math.min(containerW / totalW, containerH / totalH) * 0.85
  const offsetX = (containerW - totalW * scale) / 2
  const offsetY = (containerH - totalH * scale) / 2

  return (
    <div
      className="display-map"
      style={{ width: containerW, height: containerH, position: 'relative' }}
    >
      {displays.map((d) => {
        const left = (d.bounds.x - minX) * scale + offsetX
        const top = (d.bounds.y - minY) * scale + offsetY
        const width = d.bounds.width * scale
        const height = d.bounds.height * scale
        const isSelected = d.index === selectedIndex

        return (
          <div
            key={d.index}
            className={`display-rect${isSelected ? ' selected' : ''}`}
            style={{ left, top, width, height, position: 'absolute' }}
            onClick={() => onSelect(d.index)}
            title={d.label}
          >
            <span className="display-rect-num">{d.index + 1}</span>
            {d.isPrimary && <span className="display-rect-primary">主</span>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------
// Toggle: iOS風トグルスイッチ
// ---------------------------------------------------------------
interface ToggleProps {
  active: boolean
  onChange: (active: boolean) => void
}

function Toggle({ active, onChange }: ToggleProps): JSX.Element {
  return (
    <button
      className={`toggle-switch${active ? ' active' : ''}`}
      onClick={() => onChange(!active)}
      type="button"
      role="switch"
      aria-checked={active}
    >
      <span className="toggle-knob" />
    </button>
  )
}

// ---------------------------------------------------------------
// メイン Settings コンポーネント
// ---------------------------------------------------------------
export default function Settings(): JSX.Element {
  // --- チャンネル・ディスプレイ設定 ---
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [displayIndex, setDisplayIndex] = useState(0)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  // --- オーバーレイ設定 ---
  const [commentsEnabled, setCommentsEnabled] = useState(true)
  const [demoMode, setDemoMode] = useState(false)
  const [speed, setSpeed] = useState(180)
  const [fontSize, setFontSize] = useState(36)
  const [opacity, setOpacity] = useState(1.0)

  // --- 自動保存フィードバック ---
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初回マウント時は自動保存をスキップするフラグ
  const settingsLoadedRef = useRef(false)

  // --- チャンネル検索 ---
  const [allChannels, setAllChannels] = useState<ChannelInfo[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const channelNameMap = Object.fromEntries(allChannels.map((c) => [c.id, c.name]))

  useEffect(() => {
    window.settingsApi.getSettings().then((s) => {
      setChannelIds(s.channelIds)
      setDisplayIndex(s.displayIndex)
      setCommentsEnabled(s.commentsEnabled ?? true)
      setSpeed(s.speed ?? 180)
      setFontSize(s.fontSize ?? 36)
      setOpacity(s.opacity ?? 1.0)
      setDemoMode(s.demoModeActive ?? false)
      settingsLoadedRef.current = true
    })
    window.settingsApi.getDisplays().then(setDisplays)
    window.settingsApi.getAllChannels().then((result) => {
      setChannelsLoading(false)
      if (result.error) {
        setChannelsError(result.error)
        setManualMode(true)
      } else {
        setAllChannels(result.channels)
      }
    })
  }, [])

  // 全設定値が変わるたびに自動保存（デバウンス400ms）
  useEffect(() => {
    if (!settingsLoadedRef.current) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)

    setSaveStatus('saving')

    saveTimerRef.current = setTimeout(async () => {
      await window.settingsApi.saveSettings({
        channelIds,
        displayIndex,
        commentsEnabled,
        speed,
        fontSize,
        opacity
      })
      setSaveStatus('saved')
      feedbackTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }, 400)
  }, [channelIds, displayIndex, commentsEnabled, speed, fontSize, opacity])

  // オーバーレイ設定が変わるたびに即時反映
  useEffect(() => {
    if (!settingsLoadedRef.current) return
    window.settingsApi.previewOverlayState({ commentsEnabled, speed, fontSize, opacity })
  }, [commentsEnabled, speed, fontSize, opacity])

  const suggestions =
    searchQuery.length >= 1
      ? allChannels
          .filter(
            (c) =>
              c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              c.id.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .slice(0, 8)
      : []

  function addChannelById(id: string, name?: string): void {
    if (!id || channelIds.includes(id)) return
    setChannelIds((prev) => [...prev, id])
    if (name && !allChannels.find((c) => c.id === id)) {
      setAllChannels((prev) => [...prev, { id, name }])
    }
  }

  function selectSuggestion(channel: ChannelInfo): void {
    addChannelById(channel.id, channel.name)
    setSearchQuery('')
    setShowSuggestions(false)
    searchRef.current?.focus()
  }

  function removeChannel(id: string): void {
    setChannelIds((prev) => prev.filter((c) => c !== id))
  }

  function handleManualAdd(): void {
    const id = manualInput.trim()
    if (!id) return
    addChannelById(id)
    setManualInput('')
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        searchRef.current &&
        !searchRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleDemoToggle(active: boolean): Promise<void> {
    setDemoMode(active)
    await window.settingsApi.setDemoMode(active)
  }

  const selectedDisplayLabel = displays[displayIndex]?.label ?? ''

  return (
    <div className="settings-root">
      <div className="settings-header">
        <h1 className="settings-title">設定</h1>
        <span className={`save-status save-status-${saveStatus}`}>
          {saveStatus === 'saving' && '保存中…'}
          {saveStatus === 'saved' && '保存済み ✓'}
        </span>
      </div>

      {/* ── チャンネル管理 ─────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">監視チャンネル</h2>

        {channelsLoading && (
          <>
            <div className="channel-loading-row">
              <span className="spinner" />
              <span className="channel-loading-text">Slackからチャンネル一覧を取得中…</span>
            </div>
            <div className="channel-search-wrap">
              <input
                className="channel-input channel-input-skeleton"
                type="text"
                placeholder="チャンネルを検索..."
                disabled
              />
            </div>
          </>
        )}

        {!channelsLoading && !manualMode && (
          <>
            <p className="settings-hint">
              チャンネル名またはIDで検索して追加できます
            </p>
            <div className="channel-search-wrap">
              <input
                ref={searchRef}
                className="channel-input"
                type="text"
                placeholder="チャンネルを検索..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowSuggestions(true)
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSuggestions(false)
                    setSearchQuery('')
                  }
                  if (e.key === 'Enter' && suggestions.length === 1) {
                    selectSuggestion(suggestions[0])
                  }
                }}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="channel-suggestions" ref={suggestionsRef}>
                  {suggestions.map((c) => (
                    <div
                      key={c.id}
                      className={`channel-suggestion-item${channelIds.includes(c.id) ? ' already-added' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        if (!channelIds.includes(c.id)) selectSuggestion(c)
                      }}
                    >
                      <span className="channel-suggestion-name">#{c.name}</span>
                      <span className="channel-suggestion-id">{c.id}</span>
                      {channelIds.includes(c.id) && (
                        <span className="channel-suggestion-badge">追加済み</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn-fallback"
              onClick={() => setManualMode(true)}
            >
              IDを直接入力する
            </button>
          </>
        )}

        {!channelsLoading && manualMode && (
          <>
            {channelsError && (
              <p className="settings-error">
                チャンネル一覧の取得に失敗しました。<br />
                Slack App の Bot Token Scopes に <strong>channels:read</strong> を追加して Reinstall してください。
              </p>
            )}
            <p className="settings-hint">SlackチャンネルID（例: C012AB3CD45）を直接入力してください</p>
            <div className="channel-input-row">
              <input
                className="channel-input"
                type="text"
                placeholder="C012AB3CD45"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
              />
              <button className="btn-add" onClick={handleManualAdd}>
                追加
              </button>
            </div>
            {!channelsError && (
              <button className="btn-fallback" onClick={() => setManualMode(false)}>
                ← 検索に戻る
              </button>
            )}
          </>
        )}

        {channelIds.length === 0 ? (
          <p className="channel-empty">チャンネルが未設定です</p>
        ) : (
          <ul className="channel-list">
            {channelIds.map((id) => (
              <li key={id} className="channel-item">
                <span className="channel-name-label">
                  {channelNameMap[id] ? (
                    <>
                      <span className="channel-name-text">#{channelNameMap[id]}</span>
                      <span className="channel-id-sub">{id}</span>
                    </>
                  ) : (
                    <span className="channel-id">{id}</span>
                  )}
                </span>
                <button className="btn-remove" onClick={() => removeChannel(id)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 表示スクリーン ──────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">表示スクリーン</h2>
        <p className="settings-hint">
          コメントを表示するスクリーンをクリックして選択してください
        </p>

        <DisplayMap
          displays={displays}
          selectedIndex={displayIndex}
          onSelect={setDisplayIndex}
        />

        {selectedDisplayLabel && (
          <p className="display-selected-label">{selectedDisplayLabel}</p>
        )}
      </section>

      {/* ── オーバーレイ設定 ────────────────────── */}
      <section className="settings-section">
        <div className="section-header-row">
          <h2 className="settings-section-title">オーバーレイ設定</h2>
          <button
            className="btn-reset"
            onClick={() => {
              setCommentsEnabled(true)
              setSpeed(180)
              setFontSize(36)
              setOpacity(1.0)
            }}
          >
            デフォルトに戻す
          </button>
        </div>

        <div className="toggle-row">
          <span className="toggle-label">コメント表示</span>
          <Toggle active={commentsEnabled} onChange={setCommentsEnabled} />
        </div>

        <div className="toggle-row">
          <div>
            <span className="toggle-label">デモモード</span>
            <p className="settings-hint" style={{ marginBottom: 0, marginTop: 2 }}>
              Slackなしでコメントを流してプレビュー
            </p>
          </div>
          <Toggle active={demoMode} onChange={handleDemoToggle} />
        </div>

        <div className="slider-divider" />

        <div className="slider-row">
          <span className="slider-label">コメント速度</span>
          <span className="slider-hint">遅</span>
          <input
            type="range"
            min={60}
            max={360}
            step={10}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          <span className="slider-hint">速</span>
          <span className="slider-value">{speed}<span className="slider-unit">px/s</span></span>
        </div>

        <div className="slider-row">
          <span className="slider-label">フォントサイズ</span>
          <span className="slider-hint">小</span>
          <input
            type="range"
            min={20}
            max={72}
            step={2}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <span className="slider-hint">大</span>
          <span className="slider-value">{fontSize}<span className="slider-unit">px</span></span>
        </div>

        <div className="slider-row">
          <span className="slider-label">不透明度</span>
          <span className="slider-hint">淡</span>
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
          />
          <span className="slider-hint">濃</span>
          <span className="slider-value">{Math.round(opacity * 100)}<span className="slider-unit">%</span></span>
        </div>
      </section>
    </div>
  )
}
