#!/usr/bin/env node
/**
 * scripts/set-secrets.js
 *
 * .env ファイルまたは環境変数から Cloudflare Pages シークレットを
 * 一括登録するスクリプト。
 *
 * 使い方:
 *   1. api-layer/.env.secrets を作成（.gitignore に追加済み）:
 *      FIREBASE_URL=https://your-project-default-rtdb.firebaseio.com
 *      SUPABASE_URL=https://xxxx.supabase.co
 *      SUPABASE_KEY=your-service-role-key
 *
 *   2. 実行:
 *      node scripts/set-secrets.js
 *
 *   または環境変数として渡す:
 *      FIREBASE_URL=xxx SUPABASE_URL=yyy SUPABASE_KEY=zzz node scripts/set-secrets.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT = 'microbiz-lab';
const ENV_FILE = path.join(__dirname, '..', 'api-layer', '.env.secrets');

// .env.secrets ファイルを読み込む
let envVars = {};
if (fs.existsSync(ENV_FILE)) {
  const content = fs.readFileSync(ENV_FILE, 'utf8');
  content.split('\n').forEach(line => {
    const [key, ...vals] = line.trim().split('=');
    if (key && vals.length > 0 && !key.startsWith('#')) {
      envVars[key] = vals.join('=');
    }
  });
  console.log(`✅ .env.secrets を読み込みました: ${Object.keys(envVars).length} 件`);
} else {
  console.log('ℹ️  .env.secrets が見つかりません。環境変数から読み込みます。');
}

// 環境変数で上書き
const SECRETS = ['FIREBASE_URL', 'SUPABASE_URL', 'SUPABASE_KEY', 'FIREBASE_TOKEN'];
SECRETS.forEach(key => {
  if (process.env[key]) envVars[key] = process.env[key];
});

// バリデーション
const required = ['FIREBASE_URL', 'SUPABASE_URL', 'SUPABASE_KEY'];
const missing = required.filter(k => !envVars[k]);
if (missing.length > 0) {
  console.error(`❌ 以下のシークレットが見つかりません: ${missing.join(', ')}`);
  console.error('api-layer/.env.secrets を作成してください:');
  missing.forEach(k => console.error(`  ${k}=your-value`));
  process.exit(1);
}

// Cloudflare Pages シークレットを登録
console.log(`\n🚀 Cloudflare Pages (${PROJECT}) にシークレットを登録中...\n`);

let success = 0, failed = 0;
Object.entries(envVars).forEach(([key, value]) => {
  if (!value || value.includes('your-')) {
    console.log(`  ⚠️  ${key} — プレースホルダーのためスキップ`);
    return;
  }
  try {
    // echo でパイプして wrangler に渡す（対話プロンプトを回避）
    execSync(
      `echo "${value}" | wrangler pages secret put ${key} --project-name ${PROJECT}`,
      { stdio: 'pipe', cwd: path.join(__dirname, '..', 'api-layer') }
    );
    console.log(`  ✅ ${key} — 登録完了`);
    success++;
  } catch (e) {
    console.error(`  ❌ ${key} — 失敗: ${e.message.slice(0, 80)}`);
    failed++;
  }
});

console.log(`\n完了: ${success} 件成功 / ${failed} 件失敗`);
if (failed > 0) process.exit(1);
