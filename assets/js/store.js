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
const AGENDA_KEY = 'wbshub.agenda.' + PROJECT.code;
const MS_KEY     = 'wbshub.milestones.' + PROJECT.code;

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
/* WBS 코드는 번호 정리로 바뀝니다. 그래서 코드와 무관한 고정 ID 를 따로 둡니다.
   엑셀에도 이 ID 를 실어 보내고, 올릴 때 코드가 아니라 ID 로 짝을 찾습니다.
   그래야 번호를 정리한 뒤에도 예전 파일이 엉뚱한 Task 에 붙지 않습니다. */
export const newUid = () =>
  'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function ensureUids(list){
  const seen = new Set();
  list.forEach((t, i) => {
    if (!t.uid || seen.has(t.uid)) t.uid = 'T' + String(i + 1).padStart(4, '0');
    seen.add(t.uid);
  });
  return list;
}

function localTasks(){
  try {
    const saved = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return ensureUids(saved);
  } catch (_) {}
  return ensureUids(TASKS.map(t => ({ ...t, days: bizDays(t.start, t.end) })));
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
  milestones: [],
  agenda: [],
  agendaLocal: true,      // Supabase 에 agenda 테이블이 없으면 브라우저에 저장
  milestoneLocal: true,
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
          dateSource: r.date_source || 'auto', note: r.note || '',
          uid: r.uid || ''
        }));
        ensureUids(state.tasks);
        recalcParents();
        await loadAgenda();
        if (ms && ms.length){
          state.milestones = ms.map(m => ({
            id: m.id, name: m.name, start: m.start_date, end: m.end_date,
            note: m.note || '', kind: m.kind === 'sub' ? 'sub' : 'main',
            adjusted: /보정/.test(m.note || '')
          })).sort(msSort);
          state.milestoneLocal = false;
        } else loadLocalMilestones();
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
  loadLocalMilestones();
  await loadAgenda();
  return state;
}

export async function updateTask(code, patch){
  const t = state.tasks.find(x => x.code === code);
  if (!t) return null;
  const before = { ...t };
  Object.assign(t, patch);

  // 값 다듬기
  if (patch.name !== undefined){
    t.name = String(patch.name).trim();
    if (!t.name){ Object.assign(t, before); throw new Error('작업명은 비울 수 없습니다.'); }
  }
  // 계획시작을 종료보다 뒤로 옮기면 일정을 통째로 미루는 뜻으로 봅니다.
  // 간트에서 막대를 끄는 것과 같게, 기간 길이를 유지한 채 종료도 함께 옮깁니다.
  let shifted = false;
  if (patch.start !== undefined && t.start && t.end && t.start > t.end){
    const span = Math.round(
      (new Date(before.end + 'T00:00:00') - new Date(before.start + 'T00:00:00')) / 864e5);
    const e = new Date(t.start + 'T00:00:00');
    e.setDate(e.getDate() + (isFinite(span) && span >= 0 ? span : 0));
    const p2 = n => String(n).padStart(2, '0');
    t.end = `${e.getFullYear()}-${p2(e.getMonth()+1)}-${p2(e.getDate())}`;
    shifted = true;
  }
  // 종료를 시작보다 앞으로 당기는 건 실수일 가능성이 높아 막습니다.
  if (patch.end !== undefined && t.start && t.end && t.end < t.start){
    Object.assign(t, before);
    throw new Error(`계획종료(${patch.end})가 계획시작(${t.start})보다 빠릅니다.`);
  }

  // 진척률 100 이면 완료, 0 이면 미착수로 자동 정리 (사람이 상태를 직접 고른 경우는 존중)
  if (patch.progress !== undefined && patch.status === undefined){
    if (patch.progress >= 100) t.status = 'done';
    else if (patch.progress <= 0) t.status = 'not_started';
    else if (t.status === 'not_started' || t.status === 'done') t.status = 'in_progress';
  }
  if (patch.status === 'done') t.progress = 100;
  if (patch.status === 'not_started') t.progress = 0;
  if (patch.start !== undefined || patch.end !== undefined) t.days = bizDays(t.start, t.end);
  t.shifted = shifted;   // 화면에서 안내하려고 잠깐 표시해 둡니다

  if (state.mode === 'supabase'){
    try {
      await sb(`tasks?code=eq.${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: t.name,                     // 작업명도 함께 저장합니다
          progress: t.progress, status: t.status,
          owner: t.owner || '',
          plan_start: t.start || null,      // 빈 문자열은 date 컬럼이 거부한다
          plan_end:   t.end   || null
        })
      });
      recalcParents();                      // 상위 일정은 두 모드 모두에서 다시 계산
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
      // 코드는 번호 정리로 바뀔 수 있으니 고정 ID 를 먼저 봅니다.
      const t = (u.uid && state.tasks.find(x => x.uid === u.uid))
             || state.tasks.find(x => x.code === u.code);
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
      state.tasks.push({ ...a, uid: a.uid || newUid() });
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

/* 엑셀 반영 뒤 구조가 바뀌었으면 번호를 정리합니다. */
export async function applyBulkThenRenumber(payload){
  const r = await applyBulk(payload);
  r.renumbered = (r.added || r.removed) ? await autoRenumber() : 0;
  return r;
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
    const t = (u.uid && state.tasks.find(x => x.uid === u.uid))
           || state.tasks.find(x => x.code === u.code);
    if (!t) continue;
    if (t.level === 4){ body.progress = t.progress; body.status = t.status; }
    await sb(`tasks?code=eq.${encodeURIComponent(t.code)}`, {
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
        date_source: 'file', note: '', uid: a.uid || newUid()
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
  const r = await applyBulk({ removes, source: '삭제' });
  r.renumbered = await autoRenumber();
  return r;
}

/* 구조가 바뀐 뒤 번호에 빈자리가 있으면 자동으로 메웁니다.
   L1 단계 번호(2,3,4…)는 이미 공유된 값이라 건드리지 않습니다.
   실패해도 데이터는 그대로 두고 0 을 돌려줍니다. */
export async function autoRenumber(){
  try {
    const plan = planRenumber(false);
    if (!plan.changes.length) return 0;
    await applyRenumber(plan.map);
    return plan.changes.length;
  } catch (_) {
    return 0;
  }
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


/* ==================================================================
   공유 안건
   Supabase 에 agenda 테이블이 있으면 팀 공용, 없으면 브라우저에 저장합니다.
   (테이블이 없어도 앱이 멈추지 않게 조용히 내려앉습니다)
   ================================================================== */
const newId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function seedAgenda(){
  return AGENDA.map((t, i) => ({
    id: 'seed' + (i + 1),
    text: String(t).replace(/^\s*\d+[.)]\s*/, '').trim(),
    order: i
  }));
}

function localAgenda(){
  try {
    const a = JSON.parse(localStorage.getItem(AGENDA_KEY) || 'null');
    if (Array.isArray(a)) return a;
  } catch (_) {}
  return seedAgenda();
}

function saveLocalAgenda(){
  localStorage.setItem(AGENDA_KEY, JSON.stringify(state.agenda));
}

export async function loadAgenda(){
  if (getConfig() && state.mode === 'supabase'){
    try {
      const rows = await sb('agenda?select=*&order=sort_order.asc');
      if (Array.isArray(rows)){
        state.agendaLocal = false;
        state.agenda = rows.map(r => ({ id: r.id, text: r.text, order: r.sort_order }));
        return state.agenda;
      }
    } catch (_) {
      // 테이블이 아직 없는 경우. 브라우저 저장으로 계속 갑니다.
    }
  }
  state.agendaLocal = true;
  state.agenda = localAgenda();
  return state.agenda;
}

export async function addAgenda(text){
  const t = String(text || '').trim();
  if (!t) return null;
  const order = state.agenda.reduce((m, a) => Math.max(m, a.order ?? 0), -1) + 1;

  if (!state.agendaLocal){
    const rows = await sb('agenda', {
      method: 'POST',
      body: JSON.stringify({ project_code: PROJECT.code, text: t, sort_order: order })
    });
    const r = rows && rows[0];
    const item = { id: r ? r.id : newId(), text: t, order };
    state.agenda.push(item);
    return item;
  }
  const item = { id: newId(), text: t, order };
  state.agenda.push(item);
  saveLocalAgenda();
  return item;
}

export async function updateAgenda(id, text){
  const t = String(text || '').trim();
  const item = state.agenda.find(a => a.id === id);
  if (!item) return null;
  if (!t) return deleteAgenda(id);          // 내용을 비우면 삭제로 본다
  const before = item.text;
  item.text = t;
  try {
    if (!state.agendaLocal){
      await sb(`agenda?id=eq.${encodeURIComponent(id)}`,
               { method:'PATCH', body: JSON.stringify({ text: t }) });
    } else saveLocalAgenda();
  } catch (e){ item.text = before; throw e; }
  return item;
}

export async function deleteAgenda(id){
  const i = state.agenda.findIndex(a => a.id === id);
  if (i < 0) return false;
  const [removed] = state.agenda.splice(i, 1);
  try {
    if (!state.agendaLocal){
      await sb(`agenda?id=eq.${encodeURIComponent(id)}`, { method:'DELETE' });
    } else saveLocalAgenda();
  } catch (e){ state.agenda.splice(i, 0, removed); throw e; }
  return true;
}

/* 안건을 원하는 자리로 옮긴다. 실패하면 원래 순서로 되돌린다. */
export async function reorderAgenda(id, toIndex){
  const from = state.agenda.findIndex(a => a.id === id);
  if (from < 0) return false;
  const to = Math.max(0, Math.min(state.agenda.length - 1, toIndex));
  if (from === to) return false;

  const snapshot = state.agenda.map(a => ({ ...a }));
  const [item] = state.agenda.splice(from, 1);
  state.agenda.splice(to, 0, item);

  const changed = [];
  state.agenda.forEach((a, k) => { if (a.order !== k){ a.order = k; changed.push(a); } });

  try {
    if (!state.agendaLocal){
      for (const a of changed){
        await sb(`agenda?id=eq.${encodeURIComponent(a.id)}`,
                 { method:'PATCH', body: JSON.stringify({ sort_order: a.order }) });
      }
    } else saveLocalAgenda();
  } catch (e){
    state.agenda = snapshot;
    throw e;
  }
  return true;
}

export function resetAgenda(){
  localStorage.removeItem(AGENDA_KEY);
  state.agenda = seedAgenda();
}


/* ==================================================================
   WBS 번호 다시 매기기
   추가·삭제를 거치면 2.1.1.2 처럼 중간이 비거나 순서가 어긋납니다.
   현재 순서를 그대로 두고 번호만 1부터 촘촘히 다시 붙입니다.
   ================================================================== */

/* 코드를 숫자 마디로 비교 (2.1.10 이 2.1.2 뒤로 가게) */
export function cmpWbs(a, b){
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++){
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/* 새 번호를 계산만 해서 돌려줍니다. 아직 반영하지 않습니다.
   renumberTop=false 면 L1 코드(2,3,4…)는 그대로 두고 그 아래만 다시 매깁니다. */
export function planRenumber(renumberTop = false){
  const sorted = [...state.tasks].sort((x, y) => cmpWbs(x.code, y.code));
  const map = new Map();            // 옛 코드 -> 새 코드

  const walk = (parentOld, parentNew, level) => {
    const kids = sorted.filter(t => t.level === level && (t.parent || '') === parentOld);
    kids.forEach((t, i) => {
      const seg = String(i + 1);
      const code = parentNew ? `${parentNew}.${seg}` : seg;
      map.set(t.code, code);
      walk(t.code, code, level + 1);
    });
  };

  if (renumberTop){
    walk('', '', 1);
  } else {
    const tops = sorted.filter(t => t.level === 1);
    tops.forEach(t => { map.set(t.code, t.code); walk(t.code, t.code, 2); });
  }

  const changes = [];
  for (const t of sorted){
    const to = map.get(t.code);
    if (to && to !== t.code) changes.push({ from: t.code, to, name: t.name, level: t.level });
  }
  return { map, changes };
}

/* 계산한 새 번호를 실제로 반영합니다. */
export async function applyRenumber(map){
  const snapshot = state.tasks.map(t => ({ ...t }));
  try {
    // 1) 화면 상태 먼저 바꿉니다
    for (const t of state.tasks){
      const to = map.get(t.code);
      if (to) t.code = to;
    }
    for (const t of state.tasks){
      t.parent = t.code.includes('.') ? t.code.replace(/\.[^.]+$/, '') : '';
    }
    state.tasks.sort((a, b) => cmpWbs(a.code, b.code));

    // 2) Supabase 에 반영합니다.
    //    코드가 열쇠라서 겹치지 않게 임시 코드를 거쳐 두 번에 나눠 씁니다.
    if (state.mode === 'supabase'){
      const moves = [...map.entries()].filter(([from, to]) => from !== to);
      for (const [from] of moves){
        await sb(`tasks?code=eq.${encodeURIComponent(from)}`,
                 { method:'PATCH', body: JSON.stringify({ code: '~tmp~' + from }) });
      }
      for (const [from, to] of moves){
        const t = state.tasks.find(x => x.code === to);
        await sb(`tasks?code=eq.${encodeURIComponent('~tmp~' + from)}`, {
          method:'PATCH',
          body: JSON.stringify({ code: to, parent_code: t ? (t.parent || null) : null })
        });
      }
    } else {
      localStorage.setItem(DATA_KEY, JSON.stringify(state.tasks));
      pushLocalLog({
        at: new Date().toISOString(), code: '번호정리',
        name: `${[...map.entries()].filter(([a,b]) => a !== b).length}건 번호 변경`,
        fromProgress: 0, toProgress: 0, fromStatus: 'not_started', toStatus: 'in_progress'
      });
    }
    recalcParents();
    return true;
  } catch (e){
    state.tasks = snapshot;
    throw e;
  }
}

/* 번호에 빈자리가 있는지 (안내용) */
export function hasGaps(){
  return planRenumber(false).changes.length > 0;
}


/* ==================================================================
   마일스톤
   main = 큰 마디 (착수 / 개발 종료 / Grand Open …)
   sub  = 그 사이의 작은 마디 (중간보고, 산출물 검토 …)
   ================================================================== */
export function msSort(a, b){
  const ka = a.end || a.start || '9999', kb = b.end || b.start || '9999';
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function seedMilestones(){
  return MILESTONES.map((m, i) => ({
    id: 'ms' + (i + 1), name: m.name, start: m.start || '', end: m.end || '',
    note: m.note || '', kind: 'main', adjusted: !!m.adjusted
  })).sort(msSort);
}

function loadLocalMilestones(){
  state.milestoneLocal = true;
  try {
    const a = JSON.parse(localStorage.getItem(MS_KEY) || 'null');
    if (Array.isArray(a)){ state.milestones = a.sort(msSort); return; }
  } catch (_) {}
  state.milestones = seedMilestones();
}

function saveLocalMilestones(){
  localStorage.setItem(MS_KEY, JSON.stringify(state.milestones));
}

const msId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function msRow(m){
  return {
    project_id: _projectId, name: m.name,
    start_date: m.start || null, end_date: m.end || null,
    note: m.note || '', kind: m.kind || 'main', sort_order: 0
  };
}

export async function addMilestone(data){
  const m = {
    id: msId(), name: String(data.name || '').trim(),
    start: data.start || '', end: data.end || '',
    note: data.note || '', kind: data.kind === 'sub' ? 'sub' : 'main'
  };
  if (!m.name) throw new Error('이름을 적어 주세요.');
  if (!m.end && !m.start) throw new Error('날짜를 적어 주세요.');

  if (!state.milestoneLocal){
    await getProjectId();
    const rows = await sb('milestones', { method:'POST', body: JSON.stringify(msRow(m)) });
    if (rows && rows[0]) m.id = rows[0].id;
  }
  state.milestones.push(m);
  state.milestones.sort(msSort);
  if (state.milestoneLocal) saveLocalMilestones();
  return m;
}

export async function updateMilestone(id, patch){
  const m = state.milestones.find(x => x.id === id);
  if (!m) return null;
  const before = { ...m };
  Object.assign(m, patch);
  if (!m.name){ Object.assign(m, before); throw new Error('이름은 비울 수 없습니다.'); }
  try {
    if (!state.milestoneLocal){
      await sb(`milestones?id=eq.${encodeURIComponent(id)}`, {
        method:'PATCH',
        body: JSON.stringify({
          name: m.name, start_date: m.start || null, end_date: m.end || null,
          note: m.note || '', kind: m.kind
        })
      });
    } else saveLocalMilestones();
  } catch (e){ Object.assign(m, before); throw e; }
  state.milestones.sort(msSort);
  return m;
}

export async function deleteMilestone(id){
  const i = state.milestones.findIndex(x => x.id === id);
  if (i < 0) return false;
  const [removed] = state.milestones.splice(i, 1);
  try {
    if (!state.milestoneLocal){
      await sb(`milestones?id=eq.${encodeURIComponent(id)}`, { method:'DELETE' });
    } else saveLocalMilestones();
  } catch (e){ state.milestones.splice(i, 0, removed); throw e; }
  return true;
}

export function resetMilestones(){
  localStorage.removeItem(MS_KEY);
  state.milestones = seedMilestones();
}


/* ==================================================================
   상위 단계(L1~L3)의 날짜 고치기

   상위 날짜는 자식에서 계산되는 값이라 그 자리에 값을 넣어봐야 바로 덮어써집니다.
   그래서 자식들을 실제로 움직입니다.

     계획시작을 바꾸면  → 그룹 전체를 그 차이만큼 이동 (내부 간격 유지)
     계획종료를 바꾸면  → 그룹의 끝을 정하는 Task 의 종료일만 그 날짜로 (늘리기·줄이기)
   ================================================================== */
const isoOf = d => {
  const p2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
};
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
const diffDays = (a, b) =>
  Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);

/* 그 아래에서 실제로 일정을 가진 말단 Task 들 */
export function leavesUnder(code){
  const kids = c => state.tasks.filter(t => t.parent === c);
  const out = [];
  const walk = c => {
    const k = kids(c);
    if (!k.length){ const t = state.tasks.find(x => x.code === c); if (t) out.push(t); return; }
    k.forEach(x => walk(x.code));
  };
  walk(code);
  return out.filter(t => t.start && t.end);
}

export async function updateGroupDate(code, field, value){
  const t = state.tasks.find(x => x.code === code);
  if (!t) throw new Error('Task 를 찾을 수 없습니다.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('날짜 형식이 올바르지 않습니다.');

  const leaves = leavesUnder(code);
  if (!leaves.length) throw new Error('아래에 일정을 가진 Task 가 없습니다.');

  const snapshot = state.tasks.map(x => ({ ...x }));
  let moved = [];

  try {
    if (field === 'start'){
      const delta = diffDays(t.start, value);
      if (delta === 0) return { moved: 0, shifted: 0 };
      leaves.forEach(l => {
        l.start = addDays(l.start, delta);
        l.end   = addDays(l.end, delta);
        l.days  = bizDays(l.start, l.end);
        moved.push(l);
      });
      var summary = { moved: moved.length, delta };
    } else {
      // 그룹의 끝을 정하는 Task 들만 새 종료일로 맞춥니다.
      const last = leaves.filter(l => l.end === t.end);
      for (const l of last){
        if (value < l.start)
          throw new Error(`${l.code} 의 계획시작(${l.start})보다 빠른 날짜입니다.`);
      }
      last.forEach(l => { l.end = value; l.days = bizDays(l.start, l.end); moved.push(l); });
      var summary = { moved: moved.length, delta: diffDays(t.end, value) };
    }

    recalcParents();

    if (state.mode === 'supabase'){
      for (const l of moved){
        await sb(`tasks?code=eq.${encodeURIComponent(l.code)}`, {
          method:'PATCH',
          body: JSON.stringify({ plan_start: l.start || null, plan_end: l.end || null })
        });
      }
    } else {
      saveLocal(state.tasks);
    }
    return summary;
  } catch (e){
    state.tasks = snapshot;
    throw e;
  }
}
