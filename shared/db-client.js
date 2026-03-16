/**
 * MicroBiz Lab — Data Layer Client
 * 三層アーキテクチャ: Data層
 *
 * Firebase Realtime Database → リアルタイムランキング・XP同期
 * Supabase (PostgreSQL)      → セッション履歴・詳細スコア永続化
 *
 * 設定方法:
 *   FIREBASE_URL  = your-project.firebaseio.com
 *   SUPABASE_URL  = https://xxxx.supabase.co
 *   SUPABASE_KEY  = your-anon-public-key
 */

// ============================================================
// CONFIG — 環境変数 or window.__ENV__ から読み込み
// ============================================================
function getConfig() {
  // Cloudflare Pages / Vercel は window.__ENV__ に注入
  const env = (typeof window !== 'undefined' && window.__ENV__) || {};
  return {
    firebaseUrl:  env.FIREBASE_URL  || 'https://microbiz-lab-default-rtdb.firebaseio.com',
    supabaseUrl:  env.SUPABASE_URL  || 'https://your-project.supabase.co',
    supabaseKey:  env.SUPABASE_KEY  || 'your-anon-key',
  };
}

// ============================================================
// FIREBASE REALTIME DATABASE CLIENT
// REST API経由（SDKなし・軽量）
// ============================================================
const FirebaseDB = {
  _base: null,

  init() {
    this._base = getConfig().firebaseUrl;
  },

  _url(path) {
    return `${this._base}/${path}.json`;
  },

  async get(path) {
    const res = await fetch(this._url(path));
    if (!res.ok) throw new Error(`Firebase GET failed: ${res.status}`);
    return res.json();
  },

  async set(path, data) {
    const res = await fetch(this._url(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Firebase SET failed: ${res.status}`);
    return res.json();
  },

  async push(path, data) {
    const res = await fetch(this._url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Firebase PUSH failed: ${res.status}`);
    return res.json();
  },

  async update(path, data) {
    const res = await fetch(this._url(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Firebase PATCH failed: ${res.status}`);
    return res.json();
  },

  // リアルタイム購読 (Server-Sent Events)
  subscribe(path, callback) {
    const url = `${this._base}/${path}.json`;
    const evtSource = new EventSource(url);
    evtSource.addEventListener('put', (e) => {
      const { data } = JSON.parse(e.data);
      callback(data);
    });
    evtSource.addEventListener('patch', (e) => {
      const { data } = JSON.parse(e.data);
      callback(data);
    });
    return () => evtSource.close(); // unsubscribe関数を返す
  },
};

// ============================================================
// SUPABASE CLIENT (PostgreSQL)
// REST API経由（SDKなし・軽量）
// ============================================================
const SupabaseDB = {
  _url: null,
  _key: null,

  init() {
    const cfg = getConfig();
    this._url = cfg.supabaseUrl;
    this._key = cfg.supabaseKey;
  },

  _headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': this._key,
      'Authorization': `Bearer ${this._key}`,
      'Prefer': 'return=representation',
    };
  },

  async select(table, query = '') {
    const res = await fetch(`${this._url}/rest/v1/${table}?${query}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`Supabase SELECT failed: ${res.status}`);
    return res.json();
  },

  async insert(table, data) {
    const res = await fetch(`${this._url}/rest/v1/${table}`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Supabase INSERT failed: ${res.status}`);
    return res.json();
  },

  async upsert(table, data, onConflict) {
    const url = `${this._url}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this._headers(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Supabase UPSERT failed: ${res.status}`);
    return res.json();
  },

  async rpc(fn, params) {
    const res = await fetch(`${this._url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Supabase RPC failed: ${res.status}`);
    return res.json();
  },
};

// ============================================================
// UNIFIED REPOSITORY — Application層が使うAPI
// ============================================================
const MicroBizRepo = {
  async init() {
    FirebaseDB.init();
    SupabaseDB.init();
  },

  // ---- ランキング (Firebase: リアルタイム) ----
  async getRanking(limit = 20) {
    try {
      const data = await FirebaseDB.get(
        `ranking?orderBy="xp"&limitToLast=${limit}`
      );
      if (!data) return [];
      return Object.values(data)
        .sort((a, b) => b.xp - a.xp)
        .slice(0, limit);
    } catch (e) {
      console.warn('Firebase offline, fallback to local:', e);
      return JSON.parse(localStorage.getItem('microbiz-ranking') || '[]');
    }
  },

  async submitScore({ nickname, game, xp, sessionId }) {
    const entry = {
      nickname,
      game,
      xp,
      sessionId,
      timestamp: Date.now(),
    };
    // Firebase: リアルタイム反映
    try {
      await FirebaseDB.push('ranking', entry);
    } catch (e) {
      console.warn('Firebase push failed, local fallback:', e);
    }
    // Supabase: 永続化
    try {
      await SupabaseDB.upsert('scores', {
        session_id: sessionId,
        nickname,
        game,
        xp,
        created_at: new Date().toISOString(),
      }, 'session_id');
    } catch (e) {
      console.warn('Supabase upsert failed:', e);
    }
    // ローカルキャッシュ
    const local = JSON.parse(localStorage.getItem('microbiz-ranking') || '[]');
    local.unshift(entry);
    localStorage.setItem('microbiz-ranking', JSON.stringify(local.slice(0, 50)));
    return entry;
  },

  subscribeRanking(callback) {
    try {
      return FirebaseDB.subscribe('ranking', callback);
    } catch (e) {
      return () => {};
    }
  },

  // ---- セッション (Supabase: 詳細記録) ----
  async saveSession({ sessionId, game, events, duration, finalXp }) {
    try {
      await SupabaseDB.insert('sessions', {
        session_id: sessionId,
        game,
        events: JSON.stringify(events),
        duration_ms: duration,
        final_xp: finalXp,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Session save failed:', e);
    }
  },

  async getTopSessions(game, limit = 10) {
    try {
      return await SupabaseDB.select(
        'scores',
        `game=eq.${game}&order=xp.desc&limit=${limit}`
      );
    } catch (e) {
      return [];
    }
  },
};

// ============================================================
// WEB SHARE API (Phase 4)
// ============================================================
const ShareAPI = {
  canShare() {
    return typeof navigator !== 'undefined' && !!navigator.share;
  },

  async shareScore({ nickname, game, xp, url }) {
    const gameNames = {
      physarum: '🍄 Physarum Solver',
      quorum:   '📡 Quorum Consensus',
      hgt:      '🧬 HGT Trader',
      redqueen: '🔴 Red Queen Security',
    };
    const text = `${gameNames[game] || game} で ${xp.toLocaleString()} XP を獲得！微生物の知恵でビジネスを学ぶ #MicroBizLab`;
    if (this.canShare()) {
      await navigator.share({ title: 'MicroBiz Lab', text, url: url || location.href });
    } else {
      // フォールバック: クリップボードコピー
      await navigator.clipboard.writeText(`${text}\n${url || location.href}`);
      return 'copied';
    }
    return 'shared';
  },
};

// ============================================================
// SESSION MANAGER
// ============================================================
const SessionManager = {
  _id: null,
  _events: [],
  _startTime: null,

  start(game) {
    this._id = `${game}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._events = [];
    this._startTime = Date.now();
    return this._id;
  },

  log(event, data = {}) {
    this._events.push({ event, data, t: Date.now() - (this._startTime || 0) });
  },

  async end(game, finalXp) {
    const duration = Date.now() - (this._startTime || Date.now());
    await MicroBizRepo.saveSession({
      sessionId: this._id,
      game,
      events: this._events,
      duration,
      finalXp,
    });
    return { sessionId: this._id, duration, eventCount: this._events.length };
  },

  getId() { return this._id; },
};

if (typeof module !== 'undefined') {
  module.exports = { FirebaseDB, SupabaseDB, MicroBizRepo, ShareAPI, SessionManager };
}
