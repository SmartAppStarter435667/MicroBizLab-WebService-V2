# MicroBiz Lab v2 — 三層アーキテクチャ セットアップガイド

```
Presentation Layer  →  Application Layer  →  Data Layer
Mobile PWA              Cloudflare Pages        Firebase RTDB
Web Dashboard           Functions               Supabase PostgreSQL
```

---

## ディレクトリ構成

```
microbiz-v2/
├── mobile-pwa/              ← SYSTEM A: Android PWA
│   ├── index.html
│   ├── manifest.json
│   └── sw.js
├── web-dashboard/           ← SYSTEM B: Web ダッシュボード
│   └── index.html
├── api-layer/               ← APPLICATION LAYER
│   ├── functions/
│   │   └── api/
│   │       ├── ranking.js   ← GET/POST /api/ranking
│   │       └── sessions.js  ← GET/POST /api/sessions
│   ├── wrangler.toml        ← Cloudflare 設定
│   ├── supabase-schema.sql  ← PostgreSQL スキーマ
│   └── firebase-rules.json  ← Firebase セキュリティルール
└── shared/
    └── db-client.js         ← Firebase + Supabase クライアント
```

---

## STEP 1: Firebase Realtime Database 設定

1. https://console.firebase.google.com でプロジェクト作成
2. "Realtime Database" を有効化 → 「テストモードで開始」
3. Rules タブで `firebase-rules.json` の内容を貼り付けて「公開」
4. プロジェクト設定 → データベース URL をコピー
   例: `https://your-project-default-rtdb.firebaseio.com`

---

## STEP 2: Supabase (PostgreSQL) 設定

1. https://supabase.com でプロジェクト作成（無料プラン）
2. SQL Editor で `supabase-schema.sql` を全文貼り付けて実行
3. Settings → API から以下をコピー:
   - `Project URL` → SUPABASE_URL
   - `anon public` → SUPABASE_KEY (フロントエンド用)
   - `service_role` → SUPABASE_SERVICE_KEY (Cloudflare Functions用)

---

## STEP 3: Cloudflare Pages デプロイ（Application Layer）

```bash
# Cloudflare CLI インストール
npm install -g wrangler

# ログイン
npx wrangler login

# api-layer/ ディレクトリで実行
cd api-layer

# シークレット設定（Dashboardからも可能）
npx wrangler pages secret put FIREBASE_URL
npx wrangler pages secret put SUPABASE_URL
npx wrangler pages secret put SUPABASE_KEY

# デプロイ
npx wrangler pages deploy ./ --project-name microbiz-lab
```

デプロイ後のAPI URL例: `https://microbiz-lab.pages.dev`

---

## STEP 4: フロントエンドに API URL を設定

### mobile-pwa/index.html を編集:
```javascript
window.__ENV__ = {
  FIREBASE_URL: 'https://your-project-default-rtdb.firebaseio.com',
  API_BASE:     'https://microbiz-lab.pages.dev',  // Cloudflare Pages URL
};
```

### web-dashboard/index.html を編集:
```javascript
window.__ENV__ = {
  FIREBASE_URL: 'https://your-project-default-rtdb.firebaseio.com',
  API_BASE:     'https://microbiz-lab.pages.dev',
};
```

---

## STEP 5: 静的ファイルを GitHub Pages で公開

```bash
git init
git add .
git commit -m "feat: MicroBiz Lab v2 三層アーキテクチャ"
git remote add origin https://github.com/username/microbiz-lab-v2.git
git push -u origin main
```

GitHub リポジトリ → Settings → Pages → Deploy from branch (main)

### 公開URL:
- Mobile PWA:    `https://username.github.io/microbiz-lab-v2/mobile-pwa/`
- Web Dashboard: `https://username.github.io/microbiz-lab-v2/web-dashboard/`
- API:           `https://microbiz-lab.pages.dev/api/ranking`

---

## STEP 6: Android へのインストール

1. Chrome で Mobile PWA の URL を開く
2. アドレスバー右の「⋮」→「ホーム画面に追加」
3. 「追加」をタップ
4. ホーム画面にアイコンが出現 → アプリとして起動可能

---

## アーキテクチャ詳細

### Data Flow

```
[User Action]
     │
     ▼
[Presentation Layer]  ← Service Worker (オフラインキャッシュ)
Mobile PWA / Web Dashboard
     │  REST / SSE
     ▼
[Application Layer]
Cloudflare Pages Functions
/api/ranking  /api/sessions
     │  DB API
     ├──────────────────────────────────
     ▼                                 ▼
[Firebase RTDB]              [Supabase PostgreSQL]
リアルタイムランキング          スコア永続化・セッション記録
SSE 自動更新                  集計・分析クエリ
```

### Phase 実装状況

| Phase | 機能 | 状態 |
|-------|------|------|
| Phase 1 | Canvas2D 4ゲーム + XPシステム | ✅ 実装済 |
| Phase 2 | Firebase RTDB グローバルランキング | ✅ 実装済 |
| Phase 2 | Supabase セッション永続化 | ✅ 実装済 |
| Phase 3 | 三層アーキテクチャ (Cloudflare Functions) | ✅ 実装済 |
| Phase 4 | Web Share API SNSシェア | ✅ 実装済 |

### コスト試算（月額）

| サービス | 無料枠 | 月間上限 |
|----------|--------|----------|
| GitHub Pages | 完全無料 | 100GB転送 |
| Cloudflare Pages | 完全無料 | 500ビルド・無制限リクエスト |
| Firebase RTDB | 完全無料 | 1GB保存・10GB転送 |
| Supabase | 完全無料 | 500MB DB・50,000リクエスト |
| **合計** | **¥0/月** | |
