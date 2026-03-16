/**
 * MicroBiz Lab — Application Layer
 * Cloudflare Pages Functions: /api/sessions
 *
 * POST /api/sessions   → ゲームセッション詳細を Supabase に保存
 * GET  /api/sessions   → ゲーム別セッション統計を返す
 *
 * Supabase スキーマ:
 *   CREATE TABLE sessions (
 *     id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 *     session_id  TEXT UNIQUE NOT NULL,
 *     game        TEXT NOT NULL,
 *     events      JSONB,
 *     duration_ms INTEGER,
 *     final_xp    INTEGER,
 *     created_at  TIMESTAMPTZ DEFAULT NOW()
 *   );
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function supabase(env, table, method, body, query = '') {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} — ${txt}`);
  }
  return res.json();
}

export async function onRequest({ request, env }) {
  const { method } = request;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(request.url);

  // ---- GET /api/sessions?game=physarum ----
  if (method === 'GET') {
    const game = url.searchParams.get('game');
    const query = game
      ? `game=eq.${game}&order=final_xp.desc&limit=20`
      : `order=created_at.desc&limit=50`;
    try {
      const rows = await supabase(env, 'sessions', 'GET', null, query);
      // 集計統計
      const stats = rows.reduce((acc, r) => {
        acc.totalXp    += r.final_xp || 0;
        acc.totalMs    += r.duration_ms || 0;
        acc.count      += 1;
        acc.avgXp       = Math.round(acc.totalXp / acc.count);
        acc.avgDuration = Math.round(acc.totalMs / acc.count);
        return acc;
      }, { totalXp: 0, totalMs: 0, count: 0, avgXp: 0, avgDuration: 0 });
      return json({ ok: true, sessions: rows, stats });
    } catch (e) {
      return json({ ok: false, error: e.message, sessions: [], stats: {} });
    }
  }

  // ---- POST /api/sessions ----
  if (method === 'POST') {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400); }

    const { sessionId, game, events, durationMs, finalXp } = body;
    if (!sessionId || !game) return json({ error: 'sessionId と game は必須です' }, 400);

    try {
      const row = await supabase(env, 'sessions', 'POST', {
        session_id:  sessionId,
        game,
        events:      events || [],
        duration_ms: durationMs || 0,
        final_xp:    finalXp || 0,
        created_at:  new Date().toISOString(),
      });
      return json({ ok: true, session: row[0] }, 201);
    } catch (e) {
      return json({ ok: false, error: e.message }, 503);
    }
  }

  return json({ error: 'Method Not Allowed' }, 405);
    }
