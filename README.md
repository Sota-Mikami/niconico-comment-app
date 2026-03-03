# Niconico Slack Comment

Slack のメッセージをニコニコ動画風にオーバーレイ表示する macOS アプリです。

---

## ダウンロード

**→ [Releases](https://github.com/Sota-Mikami/niconico-comment-app/releases/latest) から最新の `.dmg` をダウンロードしてください**

| ファイル名 | 対象 Mac |
|---|---|
| `niconico-comment-slack-app-x.x.x-arm64.dmg` | Apple Silicon (M1 / M2 / M3) |
| `niconico-comment-slack-app-x.x.x-x64.dmg` | Intel Mac |

自分の Mac のチップが分からない場合: Apple メニュー（左上）→ 「この Mac について」で確認できます。

---

## インストール方法

1. ダウンロードした `.dmg` ファイルをダブルクリックで開く
2. 「Niconico Slack Comment」を `Applications` フォルダへドラッグ＆ドロップ
3. **初回のみ**: ターミナルで以下を実行
   ```
   xattr -cr /Applications/Niconico\ Slack\ Comment.app
   ```

> ⚠️ Apple の公証を受けていないため、初回のみ上記コマンドが必要です。実行後は通常通り起動できます。

---

## 初期設定

起動するとメニューバー（画面右上）にアプリアイコンが現れます。

**アイコンをクリック → 「設定を開く」**

### 1. Slack 接続設定

設定ウィンドウ最下部の「Slack 接続設定」に以下を入力します。

| 項目 | 値 |
|---|---|
| Bot Token | `xoxb-` から始まるトークン |
| App-Level Token | `xapp-` から始まるトークン |

入力すると自動的に保存・接続されます。

**トークンの取得方法** は下の「Slack App の準備」セクションを参照してください。

### 2. 監視チャンネルを追加

チャンネル名で検索 → クリックで追加します（Bot が参加しているチャンネルのみ表示されます）。

### 3. 表示スクリーンを選択

複数モニターがある場合、コメントを流したいスクリーンをマップからクリックして選択します。

---

## Slack App の準備（初回のみ）

1. [api.slack.com/apps](https://api.slack.com/apps) を開き **Create New App → From scratch** で作成
2. **Socket Mode を有効化**
   - 左メニュー: **Socket Mode** → Enable → App-Level Token を生成（スコープ: `connections:write`）
   - 表示された `xapp-...` トークンをコピー
3. **Bot Token Scopes を設定**
   - 左メニュー: **OAuth & Permissions → Scopes → Bot Token Scopes** に以下を追加:
     - `channels:history`
     - `channels:read`
     - `chat:write`
4. **ワークスペースにインストール**
   - **OAuth & Permissions → Install to Workspace**
   - 表示された `xoxb-...` トークンをコピー
5. **監視チャンネルに Bot を招待**
   - Slack で対象チャンネルを開き `/invite @アプリ名` と入力

---

## トラブルシューティング

| 症状 | 対処法 |
|---|---|
| コメントが流れない | 設定 → デモモードを ON にして動作確認。OFF でも流れない場合はトークンを再確認 |
| チャンネルが検索できない | Bot Token Scopes に `channels:read` が追加されているか確認 |
| 「Apple could not verify…」が出る | ターミナルで `xattr -cr /Applications/Niconico\ Slack\ Comment.app` を実行 |

---

## 開発者向け

```bash
git clone https://github.com/Sota-Mikami/niconico-comment-app.git
cd niconico-comment-app
npm install
npm run dev       # 開発サーバー起動
npm run dist      # dmg ビルド → dist/ に出力
```

**技術スタック**: Electron 29 + electron-vite + React 18 + TypeScript + Slack Bolt (Socket Mode)
