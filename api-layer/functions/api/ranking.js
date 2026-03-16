/**
 * MicroBiz Lab — Application Layer
 * Cloudflare Pages Functions: /api/ranking
 *
 * 三層アーキテクチャ Application層
 * GET  /api/ranking        → ランキング取得
 * POST /api/ranking        → スコア登録
 *
 * Environment Variables (Cloudflare Dashboard で設定):
 *   FIREBASE_URL   = https://microbiz-lab-default-rtdb.firebaseio.com
 *   FIREBASE_TOKEN = your-firebase-database-secret (オプション)
 *   SUPABASE_URL   = https://xxxx.supabase.co
 *   SUPABASE_KEY   = your-service-role-key
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

// ---- Firebase REST helper ----
async function firebaseFetch(env, path, method = 'GET', body = null) {
  const base = env.FIREBASE_URL || 'https://microbiz-lab-default-rtdb.firebaseio.com';
  const auth  = env.FIREBASE_TOKEN ? `?auth=${env.FIREBASE_TOKEN}` : '';
  const res = await fetch(`${base}/${path}.json${auth}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

// ---- Supabase REST helper ----
async function supabaseFetch(env, table, method = 'GET', body = null, query = '') {
  const base = env.SUPABASE_URL || '';
  const key  = env.SUPABASE_KEY || '';
  const res = await fetch(`${base}/rest/v1/${table}?${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${table} failed: ${res.status}`);
  return res.json();
}

// ---- Input validation ----
function validateScore({ nickname, game, xp }) {
  if (!nickname || typeof nickname !== 'string' || nickname.length > 30)
    return 'nickname は30文字以内の文字列で指定してください';
  const validGames = ['physarum', 'quorum', 'hgt', 'redqueen'];
  if (!validGames.includes(game))
    return `game は ${validGames.join(' | ')} のいずれかで指定してください`;
  if (typeof xp !== 'number' || xp < 0 || xp > 999999)
    return 'xp は 0〜999999 の数値で指定してください';
  return null;
}

// ============================================================
// HANDLER
// ============================================================
export async function onRequest({ request, env }) {
  const { method } = request;

  // Preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);

  // ---- GET /api/ranking ----
  if (method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '20');
    try {
      // Firebase から取得（リアルタイムDB）
      const raw = await firebaseFetch(
        env,
        `ranking?orderBy="xp"&limitToLast=${Math.min(limit, 100)}`
      );
      const entries = raw
        ? Object.values(raw).sort((a, b) => b.xp - a.xp).slice(0, limit)
        : [];
      return json({ ok: true, data: entries, source: 'firebase', count: entries.length });
    } catch (e) {
      // Firebase 失敗時 Supabase にフォールバック
      try {
        const rows = await supabaseFetch(
          env, 'scores', 'GET', null,
          `order=xp.desc&limit=${limit}`
        );
        return json({ ok: true, data: rows, source: 'supabase', count: rows.length });
      } catch (e2) {
        return json({ ok: true, data: [], source: 'offline', count: 0 });
      }
    }
  }

  // ---- POST /api/ranking ----
  if (method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return error('リクエストボディが不正なJSONです');
    }

    const validErr = validateScore(body);
    if (validErr) return error(validErr);

    const entry = {
      nickname:   body.nickname.trim(),
      game:       body.game,
      xp:         Number(body.xp),
      session_id: body.sessionId || `anon-${Date.now()}`,
      timestamp:  Date.now(),
      created_at: new Date().toISOString(),
    };

    const results = { firebase: false, supabase: false };

    // Firebase に書き込み（ランキング即時反映）
    try {
      await firebaseFetch(env, 'ranking', 'POST', entry);
      results.firebase = true;
    } catch (e) {
      console.error('Firebase push error:', e.message);
    }

    // Supabase に書き込み（永続化・集計用）
    try {
      await supabaseFetch(env, 'scores', 'POST', entry);
      results.supabase = true;
    } catch (e) {
      console.error('Supabase insert error:', e.message);
    }

    if (!results.firebase && !results.supabase) {
      return json({ ok: false, error: 'DB書き込みに失敗しました', entry }, 503);
    }

    return json({ ok: true, entry, saved: results }, 201);
  }

  return error('Method Not Allowed', 405);
                             }
