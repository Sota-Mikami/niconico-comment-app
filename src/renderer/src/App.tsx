import { useEffect, useRef, useState } from 'react'
import './assets/app.css'

interface Comment {
  id: string
  text: string
  lane: number
  speed: number // px/ms
}

// レーン数と行の高さ
const LANE_HEIGHT = 60 // px
const FONT_SIZE = 36 // px
const ANIMATION_SPEED = 180 // px/s (基準速度)
const SPEED_VARIANCE = 40 // px/s (ランダム幅)
// 右端に新コメントを出す際、先行コメントと最低この距離(px)空いていること
const MIN_GAP = 350 // px

// レーンの使用状況を管理
type LaneState = {
  placedAt: number // 直近コメントを右端に配置した時刻 (ms)
  placedSpeed: number // その時の速度 (px/s)
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function App(): JSX.Element {
  const [comments, setComments] = useState<Comment[]>([])
  const laneCount = useRef(Math.floor(window.innerHeight / LANE_HEIGHT))
  const laneStates = useRef<LaneState[]>([])

  // レーン状態の初期化
  useEffect(() => {
    laneStates.current = Array.from({ length: laneCount.current }, () => ({
      placedAt: 0,
      placedSpeed: ANIMATION_SPEED
    }))
  }, [])

  // ウィンドウリサイズ時にレーン数を更新
  useEffect(() => {
    const handleResize = (): void => {
      laneCount.current = Math.floor(window.innerHeight / LANE_HEIGHT)
      laneStates.current = Array.from({ length: laneCount.current }, () => ({
        placedAt: 0,
        placedSpeed: ANIMATION_SPEED
      }))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 先行コメントが右端から何px離れたか計算
  function getLaneGap(lane: LaneState): number {
    const elapsed = (Date.now() - lane.placedAt) / 1000 // 秒
    return elapsed * lane.placedSpeed // px
  }

  // 安全なレーンを探す
  // 優先順位: ① 間隔が十分空いているレーン（上から順に） → ② 最も間隔が広いレーン
  function findAvailableLane(): number {
    let bestLane = 0
    let maxGap = -Infinity

    for (let i = 0; i < laneCount.current; i++) {
      const gap = getLaneGap(laneStates.current[i])
      // 十分な間隔があれば即採用（上のレーン優先）
      if (gap >= MIN_GAP) {
        return i
      }
      // 全レーンが塞がっている場合の保険: 最も間隔が広いレーン
      if (gap > maxGap) {
        maxGap = gap
        bestLane = i
      }
    }
    return bestLane
  }

  // IPCでコメントを受信
  useEffect(() => {
    const handler = (text: string): void => {
      const lane = findAvailableLane()
      const speed = ANIMATION_SPEED + (Math.random() - 0.5) * SPEED_VARIANCE
      const id = generateId()

      // このレーンの状態を更新（速度も一緒に保存）
      laneStates.current[lane] = { placedAt: Date.now(), placedSpeed: speed }

      setComments((prev) => [...prev, { id, text, lane, speed }])
    }

    // Electron環境でのIPC受信（クリーンアップ関数を保持）
    let cleanupIpc: (() => void) | undefined
    if (window.api?.onComment) {
      cleanupIpc = window.api.onComment(handler)
    }

    // デモモード: URL ?demo=1 の場合のみ自動コメント（Slack接続時は不要）
    const isDemoMode =
      new URLSearchParams(window.location.search).get('demo') === '1'

    if (isDemoMode) {
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
    }

    return () => {
      cleanupIpc?.()
    }
  }, [])

  // アニメーション完了したコメントを削除
  const handleAnimationEnd = (id: string): void => {
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="stage">
      {comments.map((comment) => (
        <CommentBubble
          key={comment.id}
          comment={comment}
          onEnd={() => handleAnimationEnd(comment.id)}
        />
      ))}
    </div>
  )
}

interface CommentBubbleProps {
  comment: Comment
  onEnd: () => void
}

function CommentBubble({ comment, onEnd }: CommentBubbleProps): JSX.Element {
  const screenWidth = window.innerWidth
  // 画面幅 + 余裕を移動距離とする
  const distance = screenWidth + 600
  const duration = (distance / comment.speed) * 1000 // ms

  const top = comment.lane * LANE_HEIGHT + (LANE_HEIGHT - FONT_SIZE) / 2

  return (
    <div
      className="comment"
      style={
        {
          top,
          animationDuration: `${duration}ms`,
          '--distance': `-${distance}px`
        } as React.CSSProperties
      }
      onAnimationEnd={onEnd}
    >
      {comment.text}
    </div>
  )
}

export default App
