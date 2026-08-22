/* ==================================================================
   store.js — 데이터 계층
   Supabase 가 설정되어 있으면 Supabase(PostgREST)를, 아니면 브라우저
   저장소를 쓴다. 화면 코드는 어느 쪽인지 몰라도 된다.
   ================================================================== */
import { PROJECT, MILESTONES, AGENDA, TASKS, PHASE_WEIGHT } from './seed.js';
import { bizDays } from './excel.js';

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
/* 원인을 추측해 알려주되, 실제 응답을 절대 감추지 않는다.
   추측이 틀렸을 때 엉뚱한 곳을 파게 만드는 것이 가장 나쁘다. */
function explain(status, body, base){
  let hint = '';
  if (body.includes('PGRST125'))
    hint = `Project URL 은 ${base} 형태여야 합니다.`;
  else if (body.includes('PGRST205') || body.includes('PGRST106'))
    hint = 'schema.sql 과 seed.sql 을 먼저 실행하세요.';
  else if (body.includes('42501') || /row-level security|permission denied/i.test(body))
    hint = 'DB 쓰기 권한이 막혔습니다. supabase/fix-write-permission.sql 을 실행하세요.';
  else if (body.includes('task_log'))
    hint = '변경이력 트리거가 막혔습니다. supabase/fix-write-permission.sql 을 실행하세요.';
  else if (status === 401 || status === 403)
    hint = '키 또는 권한 문제입니다. 설정 화면의 [쓰기 테스트] 를 눌러 원문을 확인하세요.';
  const raw = `${status} ${body.replace(/\s+/g,' ').slice(0,150)}`;
  return hint ? `${hint}  (${raw})` : raw;
}

/* 실제로 한 건을 썼다가 되돌려 본다. 원문 응답을 그대로 돌려준다. */
export async function writeSelfTest(){
  const c = getConfig();
  if (!c) return { ok:false, step:'설정', detail:'Supabase 가 설정되지 않았습니다.' };
  const t = state.tasks.find(x => x.level === 4);
  if (!t) return { ok:false, step:'대상', detail:'L4 Task 가 없습니다.' };

  const url = `${c.url}/rest/v1/tasks?code=eq.${encodeURIComponent(t.code)}`;
  const headers = { ...authHeaders(c.key), 'Content-Type':'application/json', Prefer:'return=representation' };

  const attempt = async (value) => {
    const res = await fetch(url, { method:'PATCH', headers, body: JSON.stringify({ progress: value }) });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  };

  try {
    const before = t.progress ?? 0;
    const probe = before === 42 ? 43 : 42;
    const r1 = await attempt(probe);
    if (!r1.ok){
      return { ok:false, step:'쓰기', code:t.code, status:r1.status,
               detail: r1.text.replace(/\s+/g,' ').slice(0,300),
               headers: Object.keys(headers).join(', ') };
    }
    if (r1.text.trim() === '[]'){
      return { ok:false, step:'쓰기', code:t.code, status:r1.status,
               detail:'응답이 빈 배열입니다. RLS 의 UPDATE 정책이 이 행을 가리고 있습니다. fix-write-permission.sql 을 실행하세요.',
               headers: Object.keys(headers).join(', ') };
    }
    await attempt(before);
    return { ok:true, step:'쓰기', code:t.code, status:r1.status, detail:'쓰고 되돌리기까지 성공했습니다.' };
  } catch (e){
    return { ok:false, step:'요청', detail:e.message };
  }
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
  return TASKS.map(t => ({ ...t, days: bizDays(t.start, t.end) }));
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
          start: r.plan_start, end: r.plan_end,
          days: bizDays(r.plan_start, r.plan_end),
          progress: r.progress || 0, status: r.status || 'not_started',
          dateSource: r.date_source || 'auto', note: r.note || ''
        }));
        recalcParents();
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
  recalcParents();
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
  if (patch.start !== undefined || patch.end !== undefined) t.days = bizDays(t.start, t.end);

  if (state.mode === 'supabase'){
    try {
      await sb(`tasks?code=eq.${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          progress: t.progress, status: t.status,
          owner: t.owner || '',
          plan_start: t.start || null,      // 빈 문자열은 date 컬럼이 거부한다
          plan_end:   t.end   || null
        })
      });
    } catch (e){
      Object.assign(t, before);
      throw e;
    }
  } else {
    recalcParents();
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

/* ==================================================================
   엑셀 반영 — 여러 건을 한 번에 처리한다.
   Supabase 모드에서는 실패 시 화면 상태를 되돌린다.
   ================================================================== */
export async function applyBulk({ updates = [], adds = [], removes = [], source = '엑셀' }){
  const snapshot = JSON.parse(JSON.stringify(state.tasks));
  const result = { updated: 0, added: 0, removed: 0 };

  try {
    // 1) 수정
    for (const u of updates){
      const t = state.tasks.find(x => x.code === u.code);
      if (!t) continue;
      for (const c of u.changes) t[c.field] = c.raw !== undefined ? c.raw : c.to;
      t.days = bizDays(t.start, t.end);
      if (t.level === 4){
        if (t.progress >= 100 && t.status !== 'blocked') t.status = 'done';
        if (t.status === 'done') t.progress = 100;
        if (t.status === 'not_started') t.progress = 0;
      }
      result.updated++;
    }

    // 2) 추가 — WBS 코드 순으로 제자리에 꽂는다
    for (const a of adds){
      if (state.tasks.some(x => x.code === a.code)) continue;
      state.tasks.push({ ...a });
      result.added++;
    }
    if (result.added) state.tasks.sort((x, y) => cmpCode(x.code, y.code));

    // 3) 삭제 — 자식이 있으면 함께 지운다
    if (removes.length){
      const kill = new Set();
      for (const r of removes){
        kill.add(r.code);
        state.tasks.forEach(t => { if (t.code.startsWith(r.code + '.')) kill.add(t.code); });
      }
      state.tasks = state.tasks.filter(t => !kill.has(t.code));
      result.removed = kill.size;
    }

    recalcParents();

    if (state.mode === 'supabase') await pushAll(updates, adds, removes);
    else {
      localStorage.setItem(DATA_KEY, JSON.stringify(state.tasks));
      pushLocalLog({
        at: new Date().toISOString(), code: source,
        name: `수정 ${result.updated} · 추가 ${result.added} · 삭제 ${result.removed}`,
        fromProgress: 0, toProgress: 0, fromStatus: 'not_started', toStatus: 'in_progress'
      });
    }
    return result;
  } catch (e){
    state.tasks = snapshot;                 // 하나라도 실패하면 통째로 되돌린다
    throw e;
  }
}

function cmpCode(a, b){
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++){
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

async function pushAll(updates, adds, removes){
  const projectId = await getProjectId();

  for (const u of updates){
    const body = {};
    for (const c of u.changes){
      const v = c.raw !== undefined ? c.raw : c.to;
      const col = { start:'plan_start', end:'plan_end' }[c.field] || c.field;
      body[col] = (col === 'plan_start' || col === 'plan_end') ? (v || null) : v;
    }
    const t = state.tasks.find(x => x.code === u.code);
    if (t && t.level === 4){ body.progress = t.progress; body.status = t.status; }
    await sb(`tasks?code=eq.${encodeURIComponent(u.code)}`, {
      method:'PATCH', body: JSON.stringify(body)
    });
  }

  if (adds.length){
    await sb('tasks', {
      method:'POST',
      body: JSON.stringify(adds.map(a => ({
        project_id: projectId, code: a.code, level: a.level,
        parent_code: a.parent || null, name: a.name,
        deliverable: a.deliverable, owner: a.owner,
        plan_start: a.start || null, plan_end: a.end || null,
        days: a.days, progress: a.progress, status: a.status,
        date_source: 'file', note: ''
      })))
    });
  }

  for (const r of removes){
    await sb(`tasks?or=(code.eq.${encodeURIComponent(r.code)},code.like.${encodeURIComponent(r.code + '.*')})`,
             { method:'DELETE' });
  }
}

let _projectId = null;
async function getProjectId(){
  if (_projectId) return _projectId;
  const rows = await sb(`projects?code=eq.${encodeURIComponent(PROJECT.code)}&select=id`);
  _projectId = rows && rows[0] ? rows[0].id : null;
  return _projectId;
}


/* 표에서 고른 Task 를 지운다. 하위 Task 는 applyBulk 가 알아서 함께 지운다. */
export async function deleteTasks(codes){
  const removes = state.tasks.filter(t => codes.includes(t.code));
  if (!removes.length) return { removed: 0 };
  return applyBulk({ removes, source: '삭제' });
}

/* 지웠을 때 함께 사라질 하위 Task 까지 미리 계산한다. */
export function expandRemoval(codes){
  const kill = new Set();
  for (const c of codes){
    kill.add(c);
    state.tasks.forEach(t => { if (t.code.startsWith(c + '.')) kill.add(t.code); });
  }
  return state.tasks.filter(t => kill.has(t.code));
}


/* ==================================================================
   상위 단계 일정 재계산
   L1~L3 의 시작·종료·일수는 저장값이 아니라 자식들의 범위입니다.
   자식이 바뀌면(엑셀 반영·삭제 등) 여기서 다시 맞춥니다.
   ================================================================== */
export function recalcParents(){
  for (const lv of [3, 2, 1]){
    for (const t of state.tasks){
      if (t.level !== lv) continue;
      const kids = state.tasks.filter(x => x.parent === t.code);
      if (!kids.length) continue;
      const ss = kids.map(k => k.start).filter(Boolean).sort();
      const ee = kids.map(k => k.end).filter(Boolean).sort();
      if (ss.length) t.start = ss[0];
      if (ee.length) t.end = ee[ee.length - 1];
      t.days = bizDays(t.start, t.end);
      t.dateSource = 'rollup';
    }
  }
}
