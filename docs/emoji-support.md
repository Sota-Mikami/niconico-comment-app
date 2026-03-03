# Emoji 対応実装ログ（2026-03-03）

## 課題
Slack メッセージ内の `:emoji_name:` 形式がそのまま文字列として表示されていた。

## 実装内容

### 対応範囲
- **標準 Unicode emoji**（`:smile:` → 😄 など） → `node-emoji` ライブラリで変換
- **カスタム Slack emoji**（`:nigatenaemoji:` など） → Slack API `emoji.list` で取得した URL を `<img>` タグで表示

### 変更ファイル
| ファイル | 変更内容 |
|---|---|
| `package.json` | `node-emoji` を追加 |
| `src/main/index.ts` | `fetchEmojiMap()` 関数、`get-emoji-map` IPC ハンドラを追加 |
| `src/preload/index.ts` | `getEmojiMap` IPC invoke を追加 |
| `src/preload/index.d.ts` | `getEmojiMap` の型定義を追加 |
| `src/renderer/src/App.tsx` | `parseTextToSegments()`、`processSlackText()` を追加。`CommentBubble` が Segment 配列をレンダリングするよう変更 |
| `tsconfig.web.json` | `src/preload/index.d.ts` を include に追加（既存の型エラーも修正） |

### 仕組み

```
起動時:
  initWebClient() → fetchEmojiMap()
    └ emoji.list API → alias を解決 → emojiMap にキャッシュ

メッセージ受信時:
  Slack raw text → IPC → renderer
    └ parseTextToSegments(text, emojiMap)
        ├ Slack 特殊記法を除去 (processSlackText)
        ├ /:([a-zA-Z0-9_+\-]+):/ でマッチ
        ├ node-emoji.has(name) → 標準 emoji → Unicode 文字
        ├ emojiMap[name] → カスタム emoji → <img src="...">
        └ 未知 → そのまま表示
```

### カスタム emoji のエイリアス処理
Slack の `emoji.list` は `"alias_name": "alias:original_name"` 形式を返す。
2パスで解決:
1. 非エイリアスを先に `resolved` に登録
2. エイリアスを解決して登録

### トークン更新時のリフレッシュ
設定画面でトークンを変更した際も `fetchEmojiMap()` を再実行してマップを更新する。
