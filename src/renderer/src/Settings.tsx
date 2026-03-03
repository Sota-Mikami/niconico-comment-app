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
}

declare global {
  interface Window {
    settingsApi: {
      getSettings: () => Promise<Settings>
      saveSettings: (s: Settings) => Promise<void>
      getDisplays: () => Promise<DisplayInfo[]>
      getAllChannels: () => Promise<{ channels: ChannelInfo[]; error?: string }>
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

  // 全体の仮想スクリーン範囲を計算
  const minX = Math.min(...displays.map((d) => d.bounds.x))
  const minY = Math.min(...displays.map((d) => d.bounds.y))
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
  const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))

  const totalW = maxX - minX
  const totalH = maxY - minY

  // コンテナサイズ (CSS で固定)
  const containerW = 420
  const containerH = 120

  // アスペクト比を保ちながらスケール
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
// メイン Settings コンポーネント
// ---------------------------------------------------------------
export default function Settings(): JSX.Element {
  // --- 設定値 ---
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [displayIndex, setDisplayIndex] = useState(0)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [saved, setSaved] = useState(false)

  // --- チャンネル検索 ---
  const [allChannels, setAllChannels] = useState<ChannelInfo[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [manualMode, setManualMode] = useState(false) // フォールバック手動入力
  const [manualInput, setManualInput] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // 追加済みチャンネルの名前キャッシュ（channelId → name）
  const channelNameMap = Object.fromEntries(allChannels.map((c) => [c.id, c.name]))

  useEffect(() => {
    window.settingsApi.getSettings().then((s) => {
      setChannelIds(s.channelIds)
      setDisplayIndex(s.displayIndex)
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

  // 検索候補: searchQuery でフィルタリング (最大8件)
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
    // allChannels に未登録なら追加（手動入力ケース）
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

  // 外側クリックでドロップダウンを閉じる
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

  async function handleSave(): Promise<void> {
    await window.settingsApi.saveSettings({ channelIds, displayIndex })
    setSaved(true)
    setTimeout(() => {
      window.settingsApi.closeWindow()
    }, 600)
  }

  const selectedDisplayLabel = displays[displayIndex]?.label ?? ''

  return (
    <div className="settings-root">
      <h1 className="settings-title">設定</h1>

      {/* ── チャンネル管理 ─────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">監視チャンネル</h2>

        {channelsLoading && (
          <p className="settings-hint">チャンネル一覧を読み込み中...</p>
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
                        e.preventDefault() // blur 前に fire
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

      {/* ── 保存ボタン ─────────────────────────── */}
      <div className="settings-footer">
        <button className={`btn-save ${saved ? 'btn-saved' : ''}`} onClick={handleSave}>
          {saved ? '保存しました ✓' : '保存'}
        </button>
      </div>
    </div>
  )
}
