/* ==================================================================
   store.js — 데이터 계층
   Supabase 가 설정되어 있으면 Supabase(PostgREST)를, 아니면 브라우저
   저장소를 쓴다. 화면 코드는 어느 쪽인지 몰라도 된다.
   ================================================================== */
import { PROJECT, MILESTONES, AGENDA, TASKS, PHASE_WEIGHT } from './seed.js';

const CFG_KEY  = 'wbshub.config';
const DATA_KEY = 'wbshub.tasks.' + PROJECT.code;
const LOG_KEY  = 'wbshub.log.' + PROJECT.code;

/* --- 설정 --------------------------------------------------------- */

/* Supabase URL 정규화.
   PGRST125 "Invalid path specified in request URL" 는 경로 모양이 깨졌을 때
   나옵니다. 대표적으로 두 경우입니다.
     https://xxx.supabase.co/          -> //rest/v1/...        (끝 슬래시)
     https://xxx.supabase.co/rest/v1   -> /rest/v1/rest/v1/... (API 경로까지 붙여넣음)
   둘 다 여기서 걷어냅니다. */
export function normalizeUrl(raw){
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/^["'<]+|[">']+$/g, '');        // 따옴표·꺾쇠 붙여넣기
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return u.origin;                             // 경로·쿼리·해시 전부 제거
  } catch (_) {
    return s.replace(/\/rest\/v1.*$/i, '').replace(/\/+$/, '');
  }
}

export function getConfig(){
  // 1순위: 빌드 시 주입된 값 (Render 환경변수 → config.js)
  const inj = window.__WBS_ENV__ || {};
  const rawUrl = (inj.SUPABASE_URL || '').trim();
  const key = (inj.SUPABASE_ANON_KEY || '').trim();
  if (rawUrl && key && !rawUrl.startsWith('__')){
    return { url: normalizeUrl(rawUrl), key, source: 'env' };
  }
  // 2순위: 사용자가 설정 화면에서 입력한 값
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    if (c.url && c.key) return { url: normalizeUrl(c.url), key: c.key, source: 'local' };
  } catch (_) {}
  return null;
}
export function saveConfig(url, key){
  localStorage.setItem(CFG_KEY, JSON.stringify({
    url: normalizeUrl(url), key: String(key || '').trim()
  }));
}
export function clearConfig(){ localStorage.removeItem(CFG_KEY); }

/* 새 publishable 키(sb_publishable_...)는 JWT 가 아니라서 Authorization 헤더에
   넣으면 거부됩니다. 레거시 anon 키(JWT, eyJ... 로 시작)일 때만 붙입니다.
   apikey 헤더는 두 종류 모두 필요합니다. */
function authHeaders(key){
  const h = { apikey: key };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

/* --- Supabase REST 호출 ------------------------------------------- */
function explain(status, body, base){
  if (body.includes('PGRST125'))
    return `경로 오류. Project URL 은 ${base} 형태여야 합니다. 뒤에 /rest/v1 이나 슬래시를 붙이지 마세요.`;
  if (body.includes('PGRST205') || body.includes('PGRST106'))
    return 'DB 는 붙었지만 테이블이 없습니다. schema.sql 과 seed.sql 을 먼저 실행하세요.';
  if (status === 401 || body.includes('PGRST301'))
    return '키가 거부됐습니다. Publishable 또는 anon 키가 맞는지 확인하세요.';
  return `${status} ${body.slice(0,140)}`;
}

async function sb(path, opts = {}){
  const c = getConfig();
  if (!c) throw new Error('Supabase 설정이 없습니다.');
  const res = await fetch(`${c.url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      ...authHeaders(c.key),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {})
    }
  });
  if (!res.ok){
    const body = await res.text();
    throw new Error(explain(res.status, body, c.url));
  }
  return res.status === 204 ? null : res.json();
}

export async function testConnection(url, key){
  const base = normalizeUrl(url);
  if (!base) throw new Error('URL 이 비어 있습니다.');
  let res;
  try {
    res = await fetch(`${base}/rest/v1/projects?select=code&limit=1`, {
      headers: authHeaders(String(key || '').trim())
    });
  } catch (_) {
    throw new Error(`${base} 에 접속할 수 없습니다. 주소를 확인하세요.`);
  }
  if (!res.ok) throw new Error(explain(res.status, await res.text(), base));
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

/* --- 로컬 저장소 --------------------------------------------------- */
function localTasks(){
  try {
    const saved = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (_) {}
  return TASKS.map(t => ({ ...t }));
}
function saveLocal(tasks){
  localStorage.setItem(DATA_KEY, JSON.stringify(tasks));
}
function pushLocalLog(entry){
  let log = [];
  try { log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (_) {}
  log.unshift(entry);
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 300)));
}

/* --- 공개 API ------------------------------------------------------ */
export const state = {
  mode: 'local',        // 'supabase' | 'local'
  project: { ...PROJECT },
  milestones: MILESTONES.map(m => ({ ...m })),
  agenda: [...AGENDA],
  weights: PHASE_WEIGHT,
  tasks: [],
  error: null
};

export async function load(){
  const c = getConfig();
  if (c){
    try {
      const [proj, tasks, ms] = await Promise.all([
        sb(`projects?code=eq.${encodeURIComponent(PROJECT.code)}&select=*`),
        sb(`tasks?select=*&order=code.asc&limit=2000`),
        sb(`milestones?select=*&order=sort_order.asc`)
      ]);
      if (tasks && tasks.length){
        state.mode = 'supabase';
        state.error = null;
        if (proj && proj[0]) state.project = {
          code: proj[0].code, name: proj[0].name, version: proj[0].version,
          start: proj[0].start_date, end: proj[0].end_date
        };
        state.tasks = tasks.map(r => ({
          id: r.id, code: r.code, level: r.level, parent: r.parent_code || '',
          name: r.name, deliverable: r.deliverable || '', owner: r.owner || '',
          start: r.plan_start, end: r.plan_end, days: r.days || 0,
          progress: r.progress || 0, status: r.status || 'not_started',
          dateSource: r.date_source || 'auto', note: r.note || ''
        }));
        if (ms && ms.length) state.milestones = ms.map(m => ({
          name: m.name, start: m.start_date, end: m.end_date,
          note: m.note || '', adjusted: /보정/.test(m.note || '')
        }));
        return state;
      }
      state.error = 'Supabase 는 연결됐지만 tasks 테이블이 비어 있습니다. seed.sql 을 실행하세요.';
    } catch (e){
      state.error = e.message;
    }
  }
  state.mode = 'local';
  state.tasks = localTasks();
  return state;
}

export async function updateTask(code, patch){
  const t = state.tasks.find(x => x.code === code);
  if (!t) return null;
  const before = { progress: t.progress, status: t.status };
  Object.assign(t, patch);

  // 진척률 100 이면 완료, 0 이면 미착수로 자동 정리 (사람이 상태를 직접 고른 경우는 존중)
  if (patch.progress !== undefined && patch.status === undefined){
    if (patch.progress >= 100) t.status = 'done';
    else if (patch.progress <= 0) t.status = 'not_started';
    else if (t.status === 'not_started' || t.status === 'done') t.status = 'in_progress';
  }
  if (patch.status === 'done') t.progress = 100;
  if (patch.status === 'not_started') t.progress = 0;

  if (state.mode === 'supabase'){
    try {
      await sb(`tasks?code=eq.${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          progress: t.progress, status: t.status,
          owner: t.owner, plan_start: t.start, plan_end: t.end
        })
      });
    } catch (e){
      Object.assign(t, before);
      throw e;
    }
  } else {
    saveLocal(state.tasks);
    if (before.progress !== t.progress || before.status !== t.status){
      pushLocalLog({
        at: new Date().toISOString(), code, name: t.name,
        fromProgress: before.progress, toProgress: t.progress,
        fromStatus: before.status, toStatus: t.status
      });
    }
  }
  return t;
}

export async function fetchLog(){
  if (state.mode === 'supabase'){
    try {
      const rows = await sb('task_log?select=*&order=changed_at.desc&limit=120');
      return rows.map(r => ({
        at: r.changed_at, code: r.task_code, name: '',
        fromProgress: r.from_progress, toProgress: r.to_progress,
        fromStatus: r.from_status, toStatus: r.to_status
      }));
    } catch (_) { return []; }
  }
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (_) { return []; }
}

export function resetLocal(){
  localStorage.removeItem(DATA_KEY);
  localStorage.removeItem(LOG_KEY);
}
