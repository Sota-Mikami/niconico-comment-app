import { useCallback, useEffect, useRef, useState } from 'react'
import * as nodeEmoji from 'node-emoji'
import './assets/app.css'

interface Comment {
  id: string
  text: string
  top: number    // px (ランダムY座標)
  speed: number  // px/s
  fontSize: number
}

// フォントサイズのランダム幅: 基準値の ±25%
const FONT_SIZE_VARIANCE = 0.25

// デフォルトのオーバーレイ設定値
const DEFAULT_OVERLAY = {
  commentsEnabled: true,
  demoMode: false,
  speed: 180,
  fontSize: 36,
  opacity: 1.0
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Slack の特殊記法をプレーンテキストに変換
function processSlackText(text: string): string {
  return text
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')          // <URL|display> → display
    .replace(/<https?:\/\/[^>]+>/g, (m) => m.slice(1, -1)) // <URL> → URL
    .replace(/<@[A-Z0-9]+>/g, '@user')               // <@U...> → @user
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')        // <#C...|name> → #name
    .replace(/<!here>/g, '@here')
    .replace(/<!channel>/g, '@channel')
    .replace(/<!everyone>/g, '@everyone')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

type Segment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; url: string; name: string }

function parseTextToSegments(text: string, emojiMap: Record<string, string>): Segment[] {
  const processed = processSlackText(text)
  const segments: Segment[] = []
  const emojiRegex = /:([a-zA-Z0-9_+\-]+):/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = emojiRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: processed.slice(lastIndex, match.index) })
    }

    const name = match[1]

    if (nodeEmoji.has(name)) {
      // 標準 Unicode emoji
      segments.push({ type: 'text', value: nodeEmoji.get(name) as string })
    } else if (emojiMap[name]) {
      // カスタム Slack emoji
      segments.push({ type: 'emoji', url: emojiMap[name], name })
    } else {
      // 未知のコード → そのまま表示
      segments.push({ type: 'text', value: match[0] })
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < processed.length) {
    segments.push({ type: 'text', value: processed.slice(lastIndex) })
  }

  return segments
}

function App(): JSX.Element {
  const [comments, setComments] = useState<Comment[]>([])
  const [overlayState, setOverlayState] = useState(DEFAULT_OVERLAY)
  const overlayStateRef = useRef(DEFAULT_OVERLAY)
  const [emojiMap, setEmojiMap] = useState<Record<string, string>>({})

  // overlay-state IPC を受信して overlayState を更新
  useEffect(() => {
    if (!window.api?.onOverlayState) return
    const cleanup = window.api.onOverlayState((state) => {
      overlayStateRef.current = state
      setOverlayState(state)
    })
    // マウント後に main へ現在の overlay state を要求（push タイミングがずれても確実に取得）
    window.api.requestOverlayState?.()
    return cleanup
  }, [])

  // カスタム emoji マップをロード
  useEffect(() => {
    if (!window.api?.getEmojiMap) return
    window.api.getEmojiMap().then(setEmojiMap).catch(console.error)
  }, [])

  // コメントを追加するハンドラ
  const handler = useCallback((text: string): void => {
    if (!overlayStateRef.current.commentsEnabled) return

    const { speed: baseSpeed, fontSize: baseFontSize } = overlayStateRef.current

    // 速度: 基準値 ± 20%
    const speed = baseSpeed * (0.8 + Math.random() * 0.4)

    // フォントサイズ: 基準値 ± 25%
    const fontSize = Math.round(
      baseFontSize * (1 - FONT_SIZE_VARIANCE + Math.random() * FONT_SIZE_VARIANCE * 2)
    )

    // Y座標: 画面全体からランダム（フォントサイズ分の余白を確保）
    const maxTop = Math.max(window.innerHeight - fontSize - 8, 0)
    const top = Math.random() * maxTop

    setComments((prev) => [...prev, { id: generateId(), text, top, speed, fontSize }])
  }, [])

  // IPCでコメントを受信
  useEffect(() => {
    if (!window.api?.onComment) return
    return window.api.onComment(handler)
  }, [handler])

  // デモモード: overlayState.demoMode が true の間だけ interval を起動
  useEffect(() => {
    if (!overlayState.demoMode) return
    const demoTexts = [
      'こんにちは！',
      'すごい！！！',
      'なるほどね',
      'ワロタwww',
      'いい発表ですね',
      '初見です',
      'ありがとうございます',
      '面白い！',
      'なるほど〜',
      'やばすぎｗｗｗ',
      'LGTM 👍',
      '質問あります！',
      'めちゃくちゃいいですね',
      '草ｗｗｗ'
    ]
    let i = 0
    const interval = setInterval(() => {
      handler(demoTexts[i % demoTexts.length])
      i++
    }, 1500)
    return () => clearInterval(interval)
  }, [overlayState.demoMode, handler])

  const handleAnimationEnd = (id: string): void => {
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="stage" style={{ opacity: overlayState.opacity }}>
      {comments.map((comment) => (
        <CommentBubble
          key={comment.id}
          comment={comment}
          emojiMap={emojiMap}
          onEnd={() => handleAnimationEnd(comment.id)}
        />
      ))}
    </div>
  )
}

interface CommentBubbleProps {
  comment: Comment
  emojiMap: Record<string, string>
  onEnd: () => void
}

function CommentBubble({ comment, emojiMap, onEnd }: CommentBubbleProps): JSX.Element {
  const distance = window.innerWidth + 600
  const duration = (distance / comment.speed) * 1000 // ms
  const segments = parseTextToSegments(comment.text, emojiMap)

  return (
    <div
      className="comment"
      style={
        {
          top: comment.top,
          fontSize: comment.fontSize,
          animationDuration: `${duration}ms`,
          '--distance': `-${distance}px`
        } as React.CSSProperties
      }
      onAnimationEnd={onEnd}
    >
      {segments.map((seg, i) =>
        seg.type === 'emoji' ? (
          <img
            key={i}
            src={seg.url}
            alt={`:${seg.name}:`}
            style={{ height: '1em', verticalAlign: '-0.15em', display: 'inline-block' }}
          />
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </div>
  )
}

export default App
