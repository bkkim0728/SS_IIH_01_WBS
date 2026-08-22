/* ==================================================================
   app.js — 화면
   ================================================================== */
import * as store from './store.js';
import * as excel from './excel.js';
import * as cal from './calendar.js';
import { state } from './store.js';

/* ---------- 유틭 ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const D = s => s ? new Date(s + 'T00:00:00') : null;
const fmt = s => s ? s.slice(2).replace(/-/g,'.') : '—';
const clamp = (n,a,b) => Math.max(a, Math.min(b, n));
const iso = d => { const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
const DAY = 864e5;

const DATE_SRC = {
  file:   '원본 엑셀에 있던 날짜',
  auto:   '마일스톤 구간 안에서 자동 배치한 날짜',
  rollup: '하위 Task 범위에서 자동 계산'
};

const STATUS = {
  not_started:{ label:'미착수', cls:'' },
  in_progress:{ label:'진행중', cls:'b-signal' },
  done:       { label:'완료',   cls:'b-mint' },
  blocked:    { label:'지연',   cls:'b-rose' }
};

const ICON = {
  dash:'<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z"/>',
  tree:'<path d="M4 4h6v5H4zM14 15h6v5h-6zM4 15h6v5H4zM7 9v6M17 15v-3H7"/>',
  gantt:'<path d="M3 5h10M3 10h16M3 15h7M3 20h12"/>',
  file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"/>',
  hist:'<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v5l3 2"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  down:'<path d="M12 3v13M6 12l6 6 6-6M4 21h16"/>',
  chev:'<path d="M9 6l6 6-6 6"/>',
  up:'<path d="M12 21V8M6 12l6-6 6 6M4 3h16"/>',
  sheet:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  hash:'<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
  grip:'<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>'
};
const svg = (d, w = 18) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round" width="${w}" height="${w}">${d}</svg>`;

/* ---------- 주차 그리드 ---------- */
const GRID_START = D('2026-08-31');            // 원본 시트의 1주차 월요일
const WEEKS = 44;
const GRID_END = new Date(GRID_START.getTime() + WEEKS * 7 * DAY);
const weekList = Array.from({ length: WEEKS }, (_, i) => {
  const s = new Date(GRID_START.getTime() + i * 7 * DAY);
  const mid = new Date(s.getTime() + 3 * DAY);   // 목요일 기준으로 월을 정한다
  return { i: i + 1, start: s, mid, month: mid.getMonth(), year: mid.getFullYear() };
});
const pct = d => clamp((d - GRID_START) / (GRID_END - GRID_START) * 100, 0, 100);
const today = new Date(); today.setHours(0,0,0,0);
const todayPct = pct(today);
const inRange = today >= GRID_START && today <= GRID_END;

/* ---------- 진척 롤업 ---------- */
function children(code){ return state.tasks.filter(t => t.parent === code); }
function leavesOf(code){
  return state.tasks.filter(t => t.level === 4 && (t.code === code || t.code.startsWith(code + '.')));
}
function rollup(code){
  const lv = leavesOf(code);
  if (!lv.length) return 0;
  return Math.round(lv.reduce((a,t) => a + (t.progress || 0), 0) / lv.length);
}
function progressOf(t){ return t.level === 4 ? (t.progress || 0) : rollup(t.code); }

function overall(){
  const w = state.weights;
  let sum = 0, tot = 0;
  Object.keys(w).forEach(code => {
    if (!state.tasks.some(t => t.code === code)) return;
    sum += rollup(code) * w[code];
    tot += w[code];
  });
  return tot ? Math.round(sum / tot) : 0;
}
function planned(){
  // 오늘 기준 계획 진척: 리프 Task 를 일정 기준으로 얼마나 지났는지
  const lv = state.tasks.filter(t => t.level === 4);
  if (!lv.length) return 0;
  const s = lv.reduce((a,t) => {
    const st = D(t.start), en = D(t.end);
    if (!st || !en) return a;
    if (today >= en) return a + 100;
    if (today <= st) return a;
    return a + (today - st) / (en - st) * 100;
  }, 0);
  return Math.round(s / lv.length);
}

/* ---------- 상단 ---------- */
function renderTop(){
  const p = overall(), pl = planned();
  const drift = p - pl;
  const c = 2 * Math.PI * 19;
  $('#topbar').innerHTML = `
    <div>
      <h1>${esc(state.project.name)}</h1>
      <div class="sub">${esc(state.project.version)}
        · ${fmt(state.project.start)} → ${fmt(state.project.end)}</div>
    </div>
    <div class="topbar-right">
      <div class="ring">
        <svg viewBox="0 0 44 44">
          <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#3B6FFF"/><stop offset="1" stop-color="#23D6A0"/>
          </linearGradient></defs>
          <circle class="track" cx="22" cy="22" r="19"/>
          <circle class="fill"  cx="22" cy="22" r="19"
                  stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p/100)}"/>
        </svg>
        <div><b class="num">${p}%</b><span>실적 · 계획 ${pl}%</span></div>
      </div>
      <span class="badge ${drift >= 0 ? 'b-mint' : drift > -8 ? 'b-amber' : 'b-rose'}">
        ${drift >= 0 ? '+' : ''}${drift}%p
      </span>
    </div>`;
}

/* ---------- 마일스톤 스파인 ---------- */
function renderSpine(){
  const all = state.milestones.filter(m => m.start || m.end);
  const ms = all.filter(m => m.kind !== 'sub');
  const subs = all.filter(m => m.kind === 'sub');
  const anchor = m => D(m.end || m.start);
  const nextIdx = ms.findIndex(m => anchor(m) >= today);
  const donePct = nextIdx < 0 ? 100 : (nextIdx / Math.max(ms.length - 1, 1)) * 100;

  $('#spine').innerHTML = `
    <div class="spine-head">
      <h2>Milestone</h2>
      <em>Main ${ms.length}${subs.length ? ` · Sub ${subs.length}` : ''} · ${WEEKS}주 여정</em>
      <button class="btn ghost spine-edit" id="msManage">관리</button>
    </div>
    <div class="spine-track">
      <div class="spine-line"></div>
      <div class="spine-done" style="width:${donePct}%"></div>
      ${(() => {
        if (!subs.length || !ms.length) return '';
        const a = D(ms[0].end || ms[0].start), z = D(ms[ms.length-1].end || ms[ms.length-1].start);
        const span = z - a;
        if (span <= 0) return '';
        return subs.map(m => {
          const at = D(m.end || m.start);
          const left = clamp((at - a) / span * 100, 0, 100);
          return `<div class="ms-sub ${at < today ? 'past' : ''}" style="left:${left}%"
                       title="${esc(m.name)}${m.note ? ' · ' + esc(m.note) : ''} (${fmt(m.end || m.start)})">
                    <b>${esc(m.name)}</b><i></i></div>`;
        }).join('');
      })()}
      ${ms.map((m,i) => {
        const left = (i / Math.max(ms.length - 1, 1)) * 100;
        const cls = i < nextIdx || nextIdx < 0 ? 'past' : i === nextIdx ? 'next' : '';
        const pad = i === 0 ? 'left:0;transform:none;text-align:left'
                  : i === ms.length - 1 ? 'left:100%;transform:translateX(-100%);text-align:right' : '';
        return `<div class="ms ${cls}" style="left:${left}%;${pad}" title="${esc(m.note)}">
            <i></i><b>${esc(m.name)}</b>
            <span>${fmt(m.end || m.start)}</span>
          </div>`;
      }).join('')}
    </div>`;
}

/* ==================================================================
   VIEW 1 — 대시보드
   ================================================================== */
function viewDashboard(){
  const leaves = state.tasks.filter(t => t.level === 4);
  const done = leaves.filter(t => t.status === 'done').length;
  const wip  = leaves.filter(t => t.status === 'in_progress').length;
  const blk  = leaves.filter(t => t.status === 'blocked').length;
  const late = leaves.filter(t => t.status !== 'done' && D(t.end) && D(t.end) < today).length;
  const week = clamp(Math.floor((today - GRID_START) / (7 * DAY)) + 1, 0, WEEKS);
  const dday = Math.ceil((D(state.project.end) - today) / DAY);
  const delivs = new Set(leaves.map(t => t.deliverable).filter(Boolean).flatMap(s => s.split(',').map(x => x.trim())));
  const phases = state.tasks.filter(t => t.level === 1);

  const kpi = (label, value, unit, foot, accent) => `
    <div class="card kpi" style="--accent:${accent}">
      <div class="k-label">${label}</div>
      <div class="k-value">${value}${unit ? `<small>${unit}</small>` : ''}</div>
      <div class="k-foot">${foot}</div>
    </div>`;

  return `
  <div class="view-head">
    <div><h2>진척 현황</h2><p>리프 Task ${leaves.length}건 기준 · 가중치는 원본 시트의 전체 비중을 그대로 씁니다</p></div>
  </div>

  <div class="grid g-kpi" style="margin-bottom:16px">
    ${(() => {
      const toStart = Math.ceil((D(state.project.start) - today) / DAY);
      if (toStart > 0) return kpi('착수까지', `D-${toStart}`, '',
        `${fmt(state.project.start)} 착수 · 총 ${WEEKS}주`, '#3B6FFF');
      return kpi('경과 주차', inRange ? `W${week}` : '종료', inRange ? ` / ${WEEKS}` : '',
        inRange ? `${fmt(state.project.end)} 까지 D-${dday}` : '계획 기간 종료', '#3B6FFF');
    })()}
    ${kpi('완료 Task', done, ` / ${leaves.length}`,
          `진행중 ${wip} · 미착수 ${leaves.length - done - wip - blk}`, '#23D6A0')}
    ${kpi('일정 초과', late, '건', late ? '종료일이 지난 미완료 Task' : '초과 없음', late ? '#FF5D7A' : '#6B7A94')}
    ${kpi('지연 표시', blk, '건', '담당자가 직접 지연으로 표시한 Task', '#FFB224')}
    ${kpi('산출물 종류', delivs.size, '종', 'WBS 에 명시된 문서 기준', '#7B4DFF')}
  </div>

  <div class="grid g-2">
    <div class="card">
      <h3>단계별 진척</h3>
      <div class="hint" style="margin-bottom:10px">막대는 실적, 오른쪽 숫자는 해당 단계 리프 Task 평균입니다.</div>
      ${phases.map(p => {
        const pr = rollup(p.code);
        const w  = state.weights[p.code];
        const n  = leavesOf(p.code).length;
        return `<div class="phase-row" style="--phase:${phaseColor(p.code)}">
          <code>${esc(p.code)}</code>
          <div class="pn">${esc(p.name)}
            <small>${fmt(p.start)} → ${fmt(p.end)} · Task ${n}</small>
            <div class="bar" style="margin-top:6px">
              <i class="${pr >= 100 ? 'full' : pr === 0 ? 'zero' : ''}" style="width:${pr}%"></i>
            </div>
          </div>
          <div class="pw">비중<br>${Math.round(w * 100)}%</div>
          <div class="pp">${pr}%</div>
        </div>`;
      }).join('')}
    </div>

    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <h3>다음 마일스톤</h3>
        ${(() => {
          const nx = state.milestones.filter(m => D(m.end || m.start) >= today).slice(0,3);
          if (!nx.length) return '<div class="hint" style="margin-top:8px">남은 마일스톤이 없습니다.</div>';
          return nx.map(m => {
            const d = Math.ceil((D(m.end || m.start) - today) / DAY);
            return `<div class="phase-row">
              <span class="dot ${d <= 14 ? 'local' : ''}"></span>
              <div class="pn">${esc(m.name)}<small>${esc(m.note || '')}</small></div>
              <div class="pw">${fmt(m.end || m.start)}</div>
              <div class="pp">D-${d}</div>
            </div>`;
          }).join('');
        })()}
      </div>

      <div class="card" id="agendaCard">
        <h3>공유 안건</h3>
        <div class="hint" style="margin-bottom:6px">
          항목을 눌러 고치고, 엔터로 저장합니다.
          ${state.agendaLocal ? '이 브라우저에만 저장됩니다.' : '팀 전체가 함께 봅니다.'}
        </div>
        <div id="agendaBody">${agendaList()}</div>
      </div>
    </div>
  </div>`;
}

/* ==================================================================
   VIEW 2 — WBS 트리
   ================================================================== */
const collapsed = new Set();
const selected = new Set();          // 삭제하려고 고른 WBS 코드
let filter = { q:'', status:'', level:'4' };

function viewTree(){
  return `
  <div class="view-head">
    <div><h2>WBS 트리</h2><p>진척률을 옮기면 상위 단계와 대시보드가 함께 움직입니다</p></div>
    <div class="spacer"></div>
    <button class="btn ghost" id="expandAll">모두 펼치기</button>
    <button class="btn ghost" id="collapseAll">L2 까지만</button>
  </div>

  <div class="toolbar">
    <div class="search">${svg(ICON.search,14)}
      <input class="input" id="q" placeholder="작업명, WBS 코드, 산출물 검색" value="${esc(filter.q)}">
    </div>
    <select class="input" id="fStatus" style="width:130px">
      <option value="">상태 전체</option>
      ${Object.entries(STATUS).map(([k,v]) =>
        `<option value="${k}" ${filter.status===k?'selected':''}>${v.label}</option>`).join('')}
    </select>
    <select class="input" id="fLevel" style="width:130px">
      <option value="4" ${filter.level==='4'?'selected':''}>L4 까지</option>
      <option value="3" ${filter.level==='3'?'selected':''}>L3 까지</option>
      <option value="2" ${filter.level==='2'?'selected':''}>L2 까지</option>
    </select>
    <div class="spacer" style="flex:1"></div>
    <button class="btn" id="exportXlsx">${svg(ICON.down,14)} 엑셀 내려받기</button>
    <button class="btn primary" id="importXlsx">${svg(ICON.up,14)} 엑셀 올리기</button>
    <button class="btn ${store.hasGaps() ? 'warn' : 'ghost'}" id="renumber"
            title="추가·삭제로 생긴 번호의 빈자리를 메웁니다">
      ${svg(ICON.hash,14)} 번호 정리${store.hasGaps() ? ' <span class="dotmark"></span>' : ''}
    </button>
    <input type="file" id="xlsxFile" accept=".xlsx,.xls" hidden>
  </div>

  <div id="selBar"></div>

  <div class="tree">
    <div class="tree-head">
      <div class="r-pick">
        <input type="checkbox" id="pickAll" title="보이는 Task 모두 고르기">
      </div>
      <div>WBS</div><div>작업명</div>
      <div class="r-date">계획시작</div><div class="r-date">계획종료</div>
      <div>진척</div><div class="r-status">상태</div><div class="r-days">일수</div>
    </div>
    <div id="rows">${treeRows()}</div>
  </div>`;
}

function treeRows(){
  const q = filter.q.trim().toLowerCase();
  const maxLv = +filter.level;
  const hits = new Set();
  if (q || filter.status){
    state.tasks.forEach(t => {
      const okQ = !q || (t.code + ' ' + t.name + ' ' + t.deliverable).toLowerCase().includes(q);
      const okS = !filter.status || t.status === filter.status;
      if (okQ && okS && t.level === 4){
        hits.add(t.code);
        let p = t.parent; while (p){ hits.add(p); const pt = state.tasks.find(x=>x.code===p); p = pt ? pt.parent : ''; }
      }
    });
  }

  const rows = state.tasks.filter(t => {
    if (t.level > maxLv) return false;
    if ((q || filter.status) && !hits.has(t.code)) return false;
    let p = t.parent;
    while (p){ if (collapsed.has(p)) return false;
      const pt = state.tasks.find(x => x.code === p); p = pt ? pt.parent : ''; }
    return true;
  });

  if (!rows.length) return `<div class="empty"><b>조건에 맞는 Task 가 없습니다</b>검색어나 필터를 바꿔 보세요.</div>`;

  return rows.map(t => {
    const pr = progressOf(t);
    const kid = t.level < 4 && children(t.code).length > 0;
    const open = !collapsed.has(t.code);
    const st = STATUS[t.status] || STATUS.not_started;
    const overdue = t.status !== 'done' && D(t.end) && D(t.end) < today;
    return `
    <div class="row lv${t.level} ${selected.has(t.code)?'picked':''}" data-code="${esc(t.code)}"
         ${t.level === 1 ? `style="--phase:${phaseColor(t.code)}"` : ''}>
      <div class="r-pick">
        <input type="checkbox" data-pick="${esc(t.code)}" ${selected.has(t.code)?'checked':''}
               aria-label="${esc(t.code)} 고르기">
      </div>
      <div class="r-code indent-${t.level}">
        <span class="twist ${kid ? (open?'open':'') : 'leaf'}" data-toggle="${esc(t.code)}">${svg(ICON.chev,12)}</span>
        <code>${esc(t.code)}</code>
      </div>
      <div class="r-name">
        <span>${esc(t.name)}</span>
        ${t.note ? `<span class="badge b-amber" title="${esc(t.note)}">메모</span>` : ''}
        ${overdue ? `<span class="badge b-rose">초과</span>` : ''}
      </div>
      <div class="r-date" title="계획시작 ${fmt(t.start)} · ${DATE_SRC[t.dateSource] || ''}">${fmt(t.start)}</div>
      <div class="r-date" title="계획종료 ${fmt(t.end)} · ${DATE_SRC[t.dateSource] || ''}">${fmt(t.end)}</div>
      <div class="r-prog">
        <div class="bar"><i class="${pr>=100?'full':pr===0?'zero':''}" style="width:${pr}%"></i></div>
        <span class="pct">${pr}%</span>
      </div>
      <div class="r-status">
        ${t.level === 4
          ? `<select data-status="${esc(t.code)}">${Object.entries(STATUS).map(([k,v]) =>
              `<option value="${k}" ${t.status===k?'selected':''}>${v.label}</option>`).join('')}</select>`
          : `<span class="badge ${st.cls}">${pr>=100?'완료':pr>0?'진행중':'미착수'}</span>`}
      </div>
      <div class="r-days mono">${excel.bizDays(t.start, t.end) || '—'}</div>
    </div>`;
  }).join('');
}


/* L1 단계마다 다른 색.
   코드가 아니라 순서로 배정해서 번호 정리 뒤에도 그대로 유지됩니다. */
const PHASE_COLORS = ['#6FA8FF', '#B08CFF', '#46D2C0', '#FFA765', '#F58AB8'];

function phaseColor(code){
  const top = String(code).split('.')[0];
  const order = state.tasks.filter(t => t.level === 1).map(t => t.code);
  const i = order.indexOf(top);
  return i < 0 ? '' : PHASE_COLORS[i % PHASE_COLORS.length];
}

/* ==================================================================
   VIEW 3 — 간트
   ================================================================== */
let ganttDepth = 3;

function viewGantt(){
  const months = [];
  weekList.forEach(w => {
    const key = `${w.year}-${w.month}`;
    const last = months[months.length - 1];
    if (last && last.key === key) last.n++;
    else months.push({ key, n:1, label:`${w.month + 1}월`, year:w.year });
  });

  const rows = state.tasks.filter(t => t.level <= ganttDepth);
  const cw = 100 / WEEKS;

  return `
  <div class="view-head">
    <div><h2>일정 (간트)</h2><p>${WEEKS}주 · ${fmt(state.project.start)} → ${fmt(state.project.end)}</p></div>
    <div class="spacer"></div>
    <select class="input" id="gDepth" style="width:130px">
      <option value="1" ${ganttDepth===1?'selected':''}>L1 단계</option>
      <option value="2" ${ganttDepth===2?'selected':''}>L2 모듈</option>
      <option value="3" ${ganttDepth===3?'selected':''}>L3 그룹</option>
      <option value="4" ${ganttDepth===4?'selected':''}>L4 전체</option>
    </select>
  </div>

  <div class="note" style="margin-bottom:14px">
    <b>날짜 출처</b>: 원본 시트에 계획일이 들어 있는 Task 는 4건입니다.
    나머지는 마일스톤 구간 안에서 순서대로 자동 배치했고, 트리 화면에서 흐린 날짜로 표시됩니다.
    실제 일정이 정해지면 그 위에 덮어쓰면 됩니다.
    상위 단계 막대는 하위 Task 의 시작·종료를 그대로 따라가며, 하위에 지연이 있으면 함께 표시됩니다.
  </div>

  <div class="gantt-wrap"><div class="gantt-scroll"><div class="gantt">
    <div class="g-head">
      <div class="g-months"><div class="g-corner"></div>${months.map(m =>
        `<div style="width:${m.n * cw}%">${m.label}<span style="color:var(--muted);font-weight:400">&nbsp;'${String(m.year).slice(2)}</span></div>`).join('')}</div>
      <div class="g-weeks"><div class="g-corner"></div>${weekList.map(w =>
        `<div style="width:${cw}%">${w.i}</div>`).join('')}</div>
    </div>
    <div style="position:relative">
      ${inRange ? `<div class="g-today" style="left:calc(280px + (100% - 280px) * ${todayPct/100})"></div>` : ''}
      ${state.milestones.filter(m => m.end).map(m =>
        `<div class="g-ms" style="left:calc(280px + (100% - 280px) * ${pct(D(m.end))/100})" title="${esc(m.name)}"></div>`).join('')}
      ${rows.map(t => {
        const s = D(t.start), e = D(t.end);
        if (!s || !e) return '';
        const l = pct(s), r = pct(new Date(e.getTime() + DAY));
        const pr = progressOf(t);
        const kids = leavesOf(t.code);
        const blocked = t.level === 4
          ? t.status === 'blocked'
          : kids.some(k => k.status === 'blocked');
        const late = kids.some(k => k.status !== 'done' && D(k.end) && D(k.end) < today);
        const cls = blocked ? 'blocked' : pr >= 100 ? 'done' : '';
        const tip = `${t.name} · ${fmt(t.start)} → ${fmt(t.end)} · ${pr}%`
          + (blocked ? ' · 지연 포함' : late ? ' · 종료일 초과 포함' : '');
        const pc = t.level === 1 ? phaseColor(t.code) : '';
        return `<div class="g-row lv${t.level}" ${pc ? `style="--phase:${pc}"` : ''}>
          <div class="g-label indent-${t.level}">
            <code>${esc(t.code)}</code><span>${esc(t.name)}</span>
            ${blocked ? '<em class="flag rose">지연</em>' : late ? '<em class="flag amber">초과</em>' : ''}
          </div>
          <div class="g-track">
            <div class="g-grid">${weekList.map(w =>
              `<i class="${w.mid.getDate() <= 7 ? 'month' : ''}" style="width:${cw}%"></i>`).join('')}</div>
            <div class="g-bar ${cls}" style="left:${l}%;width:${Math.max(r-l,.7)}%"
                 title="${esc(tip)}">
              <i style="width:${pr}%"></i>
              ${(r - l) > 6 ? `<em>${pr}%</em>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div></div></div>`;
}


/* ==================================================================
   VIEW — 스케줄 달력
   ================================================================== */
let calYm = null;          // 'YYYY-MM'. 처음에는 오늘이 속한 달(프로젝트 기간 안으로 보정)
let calFilter = { phase:'', status:'', level:'4' };

function calInit(){
  if (calYm) return;
  const ps = D(state.project.start), pe = D(state.project.end);
  const base = today < ps ? ps : today > pe ? pe : today;
  calYm = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2,'0')}`;
}

function shiftMonth(delta){
  const [y, m] = calYm.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  calYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
}

function calTasks(){
  // 고른 단계의 Task 만 그린다. 상위까지 같이 그리면 막대가 달 전체를 덮어
  // 정작 보고 싶은 Task 가 밀려난다.
  const lv = +calFilter.level;
  return state.tasks.filter(t => {
    if (t.level !== lv) return false;
    if (calFilter.phase && t.code.split('.')[0] !== calFilter.phase) return false;
    if (calFilter.status){
      if (t.level === 4) { if (t.status !== calFilter.status) return false; }
      else if (!leavesOf(t.code).some(k => k.status === calFilter.status)) return false;
    }
    return true;
  });
}

function viewCalendar(){
  calInit();
  const [year, month] = calYm.split('-').map(Number);

  const weeks = cal.buildWeeks(year, month);
  const inMonth = cal.tasksInMonth(calTasks(), year, month);
  const overflow = cal.layoutBars(weeks, inMonth, +calFilter.level === 4 ? 5 : 4);
  const hols = cal.holidaysInMonth(year, month);
  const stones = cal.milestonesInMonth(state.milestones, year, month);
  const stoneBy = stones.reduce((a, m) => ((a[m.at] = a[m.at] || []).push(m), a), {});

  const phases = state.tasks.filter(t => t.level === 1);
  const monthStart = `${year}-${String(month).padStart(2,'0')}-01`;

  const cell = (c, idx) => {
    if (!c) return `<div class="cal-col empty"></div>`;
    const cls = [
      c.date === iso(today) ? 'is-today' : '',
      c.holiday ? (c.holiday.temp ? 'is-temp' : 'is-holiday') : '',
      idx === 0 ? 'sun' : idx === 6 ? 'sat' : ''
    ].join(' ');
    return `<div class="cal-col ${cls}"></div>`;
  };

  const headCell = (c, idx) => {
    if (!c) return `<div class="cal-head-cell" style="grid-column:${idx+1};grid-row:1"></div>`;
    const numCls = c.holiday && !c.holiday.temp ? 'holiday'
                 : c.holiday ? 'temp' : idx === 0 ? 'sun' : idx === 6 ? 'sat' : '';
    const ms = stoneBy[c.date] || [];
    return `
      <div class="cal-head-cell" style="grid-column:${idx+1};grid-row:1">
        <div class="cal-daynum ${numCls} ${c.date === iso(today) ? 'today' : ''}">${c.day}</div>
        ${c.holiday ? `<div class="cal-hol ${c.holiday.temp ? 'temp' : ''}" title="${esc(c.holiday.name)}">${esc(c.holiday.name)}</div>` : ''}
        ${ms.map(m => `<div class="cal-ms" title="마일스톤 · ${esc(m.note || m.name)}">◆ ${esc(m.name)}</div>`).join('')}
      </div>`;
  };

  const bar = b => {
    const pr = progressOf(b);
    const kids = leavesOf(b.code);
    const blocked = b.level === 4 ? b.status === 'blocked' : kids.some(k => k.status === 'blocked');
    const st = blocked ? 'blocked' : pr >= 100 ? 'done' : pr > 0 ? 'wip' : 'todo';
    return `
      <button class="cal-bar s-${st} ${b.cutLeft?'cut-l':''} ${b.cutRight?'cut-r':''}"
              data-cal-task="${esc(b.code)}"
              style="grid-column:${b.from} / ${b.to};grid-row:${b.lane + 2};--phase:${phaseColor(b.code)}"
              title="${esc(b.code)} ${esc(b.name)}&#10;${fmt(b.start)} → ${fmt(b.end)} · ${pr}%">
        ${b.cutLeft ? '<span class="cb-arrow">◀</span>' : ''}
        <span class="cb-text"><b>${esc(b.code)}</b> ${esc(b.name)}</span>
        ${b.cutRight ? '<span class="cb-arrow">▶</span>' : ''}
      </button>`;
  };

  const noData = !cal.hasHolidayData(year);

  return `
  <div class="view-head">
    <div class="cal-nav">
      <button class="btn ghost" id="calPrev" aria-label="이전 달">←</button>
      <h2 class="cal-title">${year}년 ${month}월</h2>
      <button class="btn ghost" id="calNext" aria-label="다음 달">→</button>
      <button class="btn ghost" id="calToday">오늘</button>
    </div>
    <div class="spacer"></div>
    <select class="input" id="calPhase" style="width:150px">
      <option value="">전체 단계</option>
      ${phases.map(p => `<option value="${esc(p.code)}" ${calFilter.phase===p.code?'selected':''}>${esc(p.name)}</option>`).join('')}
    </select>
    <span class="phase-key">
      ${phases.map(p => `<i style="background:${phaseColor(p.code)}" title="${esc(p.name)}"></i>`).join('')}
    </span>
    <select class="input" id="calStatus" style="width:126px">
      <option value="">전체 상태</option>
      ${Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${calFilter.status===k?'selected':''}>${v.label}</option>`).join('')}
    </select>
    <select class="input" id="calLevel" style="width:126px">
      <option value="4" ${calFilter.level==='4'?'selected':''}>L4 Task만</option>
      <option value="3" ${calFilter.level==='3'?'selected':''}>L3 그룹만</option>
      <option value="2" ${calFilter.level==='2'?'selected':''}>L2 모듈만</option>
      <option value="1" ${calFilter.level==='1'?'selected':''}>L1 단계만</option>
    </select>
  </div>

  ${noData ? `<div class="note" style="margin-bottom:14px">
    ${cal.FIRST_YEAR}~${cal.LAST_YEAR}년 공휴일만 등록되어 있어 이 달은 공휴일이 표시되지 않습니다.
    <span class="mono">assets/js/holidays.js</span> 에 연도를 더하면 표시됩니다.
  </div>` : ''}

  <div class="calendar">
    <div class="cal-weekdays">
      ${cal.WEEKDAYS.map((d,i) => `<div class="${i===0?'sun':i===6?'sat':''}">${d}</div>`).join('')}
    </div>
    ${weeks.map((w, wi) => `
      <div class="cal-week">
        <div class="cal-cols" aria-hidden="true">${w.cells.map(cell).join('')}</div>
        <div class="cal-fg">
          ${w.cells.map(headCell).join('')}
          ${w.bars.map(bar).join('')}
          ${overflow.has(wi) ? `<div class="cal-more" style="grid-column:1/8;grid-row:6">외 ${overflow.get(wi)}건 더 있습니다 · 필터로 좁혀 보세요</div>` : ''}
        </div>
      </div>`).join('')}
  </div>

  <div class="cal-legend">
    <span class="lg"><i class="lg-chip s-todo"></i>미착수</span>
    <span class="lg"><i class="lg-chip s-wip"></i>진행중</span>
    <span class="lg"><i class="lg-chip s-done"></i>완료</span>
    <span class="lg"><i class="lg-chip s-blocked"></i>지연</span>
    <span class="lg-sep"></span>
    <span class="lg"><i class="lg-chip lg-hol"></i>공휴일</span>
    <span class="lg"><i class="lg-chip lg-temp"></i>임시공휴일</span>
    <span class="lg">◆ 마일스톤</span>
    <div class="spacer" style="flex:1"></div>
    <span class="hint">이 달 Task ${inMonth.length}건 · 막대를 누르면 WBS 트리에서 찾아 줍니다</span>
  </div>

  ${(stones.length || hols.length) ? `
  <div class="grid g-2" style="margin-top:16px">
    ${stones.length ? `<div class="card">
      <h3>이 달의 마일스톤</h3>
      ${stones.map(m => `<div class="phase-row">
        <span class="dot ${D(m.at) < today ? 'live' : 'local'}"></span>
        <div class="pn">${esc(m.name)}<small>${esc(m.note || '')}</small></div>
        <div class="pw">${fmt(m.at)}</div>
        <div class="pp">${D(m.at) >= today ? 'D-' + Math.ceil((D(m.at) - today) / DAY) : '지남'}</div>
      </div>`).join('')}
    </div>` : '<div></div>'}
    ${hols.length ? `<div class="card">
      <h3>이 달의 공휴일</h3>
      ${hols.map(h => `<div class="phase-row">
        <code class="${h.temp ? 'temp' : 'hol'}">${month}/${h.day}</code>
        <div class="pn">${esc(h.name)}</div>
        <div class="pw">${cal.WEEKDAYS[D(h.date).getDay()]}요일</div>
        <div class="pp mono" style="font-size:11px;color:var(--muted)">${[0,6].includes(D(h.date).getDay()) ? '주말' : '평일'}</div>
      </div>`).join('')}
    </div>` : ''}
  </div>` : ''}`;
}

/* ==================================================================
   VIEW 4 — 변경 이력
   ================================================================== */
async function viewLog(){
  const log = await store.fetchLog();
  if (!log.length){
    return `<div class="view-head"><div><h2>변경 이력</h2><p>진척률이나 상태를 바꾸면 여기 쌓입니다</p></div></div>
      <div class="card"><div class="empty"><b>아직 기록이 없습니다</b>
      WBS 트리에서 Task 진척을 옮겨 보세요.</div></div>`;
  }
  return `
  <div class="view-head"><div><h2>변경 이력</h2><p>최근 ${log.length}건</p></div></div>
  <div class="card" style="padding:0"><div class="log">
    ${log.map(l => `<div class="log-item">
      <time>${new Date(l.at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</time>
      <code class="mono" style="font-size:11px;color:var(--signal-2)">${esc(l.code)}</code>
      <span>${esc(l.name || (state.tasks.find(t=>t.code===l.code)?.name) || '')}</span>
      <span class="mono" style="font-size:11.5px;color:var(--text-2)">
        ${l.fromProgress}% → <b style="color:var(--signal-2)">${l.toProgress}%</b>
        <span class="badge ${(STATUS[l.toStatus]||{}).cls||''}" style="margin-left:8px">${(STATUS[l.toStatus]||{}).label||l.toStatus}</span>
      </span>
    </div>`).join('')}
  </div></div>`;
}

/* ==================================================================
   VIEW 5 — 설정
   ================================================================== */
function viewSettings(){
  const c = store.getConfig();
  return `
  <div class="view-head"><div><h2>설정</h2><p>Supabase 를 연결하면 팀 전체가 같은 진척을 봅니다</p></div></div>

  <div class="note" style="margin-bottom:14px">
    <b>Project URL 이 안 보이나요?</b><br>
    Supabase 가 대시보드를 개편해서 <span class="mono">Settings &gt; API</span> 한 화면에 있던 것이
    <span class="mono">Settings &gt; Data API</span>(URL)와 <span class="mono">Settings &gt; API Keys</span>(키)로 갈라졌습니다.
    가장 빠른 길은 프로젝트 상단의 <b>Connect</b> 버튼입니다. URL 과 키가 한 화면에 같이 나옵니다.
  </div>

  <div class="grid g-2">
    <div class="card">
      <h3>Supabase 연결</h3>
      <div class="hint" style="margin-bottom:14px">
        두 값 모두 Supabase 대시보드 상단의 <b>Connect</b> 버튼 한 곳에 같이 나옵니다.
        키는 이 브라우저에만 저장됩니다. Render 환경변수로 넣으면 모두에게 자동 적용됩니다.
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="field"><label>Project URL</label>
          <input class="input" id="sbUrl" placeholder="https://xxxxxxxx.supabase.co"
                 value="${esc(c?.url || '')}">
          <span class="hint">대시보드 주소창의 <code class="mono">/project/<b>여기</b></code> 부분이
            프로젝트 ID 입니다. <code class="mono">https://프로젝트ID.supabase.co</code> 가 곧 Project URL 입니다.</span></div>
        <div class="field"><label>API 키</label>
          <input class="input" id="sbKey" type="password" placeholder="sb_publishable_... 또는 eyJhbGciOi..."
                 value="${esc(c?.key || '')}">
          <span class="hint"><b>Publishable</b> 키(<code class="mono">sb_publishable_…</code>) 또는
            레거시 <b>anon</b> 키 둘 다 됩니다. <b>Secret</b> 과 <b>service_role</b> 키는 절대 넣지 마세요.</span></div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn primary" id="sbSave">연결하고 새로고침</button>
          <button class="btn" id="sbTest">연결만 확인</button>
          <button class="btn ghost" id="sbClear">연결 해제</button>
        </div>
      </div>
      ${state.error ? `<div class="note" style="margin-top:14px"><b>연결 메모</b><br>${esc(state.error)}</div>` : ''}
    </div>

    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <h3>현재 저장 위치</h3>
        <div class="phase-row" style="border:0">
          <span class="dot ${state.mode==='supabase'?'live':'local'}"></span>
          <div class="pn">${state.mode === 'supabase' ? 'Supabase (팀 공용)' : '이 브라우저 (나만 보임)'}
            <small>${state.mode === 'supabase' ? c?.source === 'env' ? '환경변수로 주입됨' : '브라우저에 저장된 설정' : 'localStorage'}</small></div>
          <div class="pp mono" style="font-size:12px">${state.tasks.length}</div>
        </div>
      </div>

      <div class="card">
        <h3>진단</h3>
        <div class="hint" style="margin-bottom:8px">배포가 제대로 반영됐는지 확인합니다.</div>
        <div id="diag" class="mono" style="font-size:11.5px;line-height:1.9">확인 중…</div>
        <div style="margin-top:12px;display:flex;gap:9px;align-items:center;flex-wrap:wrap">
          <button class="btn" id="writeTest">쓰기 테스트</button>
          <span class="hint">한 건을 썼다가 곧바로 되돌립니다.</span>
        </div>
        <div id="writeOut" style="margin-top:10px"></div>
      </div>

      <div class="card">
        <h3>데이터 내보내기</h3>
        <div class="hint" style="margin-bottom:12px">현재 진척이 반영된 상태로 저장됩니다.</div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn" id="expXlsx">${svg(ICON.sheet,14)} 엑셀</button>
          <button class="btn" id="expJson">${svg(ICON.down,14)} JSON</button>
        </div>
        <div class="hint" style="margin-top:10px">
          엑셀은 고쳐서 다시 올릴 수 있는 왕복 양식입니다. WBS 트리 화면에서 올리세요.
        </div>
      </div>

      <div class="card">
        <h3>초기화</h3>
        <div class="hint" style="margin-bottom:12px">
          이 브라우저에 저장된 진척을 지우고 원본 WBS 상태로 되돌립니다. Supabase 데이터는 건드리지 않습니다.
        </div>
        <button class="btn" id="resetLocal">브라우저 데이터 초기화</button>
      </div>
    </div>
  </div>`;
}

/* ==================================================================
   내보내기
   ================================================================== */
function download(name, text, type){
  const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type }));
  const a = Object.assign(document.createElement('a'), { href:url, download:name });
  a.click(); URL.revokeObjectURL(url);
}
function exportJson(){
  download(`WBS_${state.project.code}_${new Date().toISOString().slice(0,10)}.json`,
    JSON.stringify({ project:state.project, milestones:state.milestones, tasks:state.tasks }, null, 2),
    'application/json');
  toast('JSON 을 내려받았습니다.');
}






function showDateAudit(a){
  openModal({
    title: '날짜 대조 결과',
    sub: `${a.checked}건 중 ${a.matched}건 일치 · ${a.mismatched.length}건 불일치`,
    applyLabel: '닫기',
    onApply: null,
    body: `
      <div class="note" style="border-left-color:var(--rose);background:var(--rose-bg);color:#F5C4CE;margin-bottom:14px">
        <b>엑셀에 적힌 날짜와 화면 값이 다릅니다.</b>
        아래 내용을 그대로 알려 주시면 원인을 찾겠습니다.
      </div>
      <div class="chg-list">
        ${a.mismatched.slice(0,60).map(m => `
          <div class="chg">
            <code>${esc(m.code)}</code>
            <div style="font-size:12.5px">
              <span class="mono">${esc(m.head)}</span>
              엑셀 <b class="mono" style="color:var(--mint)">${esc(m.엑셀)}</b>
              <span style="color:var(--muted)"> / </span>
              화면 <b class="mono" style="color:var(--rose)">${esc(m.화면)}</b>
            </div>
          </div>`).join('')}
        ${a.mismatched.length > 60 ? `<div class="chg" style="color:var(--muted)">외 ${a.mismatched.length - 60}건</div>` : ''}
      </div>`
  });
}

/* ==================================================================
   마일스톤 관리
   ================================================================== */
let msEditing = null;      // 수정 중인 id, 'new' 면 새로 등록

function msForm(m){
  const v = m || { id:'new', name:'', start:'', end:'', note:'', kind:'main' };
  return `
    <div class="ms-form">
      <div class="ms-form-grid">
        <div class="field"><label>이름</label>
          <input class="input" id="msName" value="${esc(v.name)}" maxlength="60" placeholder="예: 중간보고"></div>
        <div class="field"><label>종류</label>
          <select class="input" id="msKind">
            <option value="main" ${v.kind!=='sub'?'selected':''}>Main · 큰 마디</option>
            <option value="sub"  ${v.kind==='sub'?'selected':''}>Sub · 작은 마디</option>
          </select></div>
        <div class="field"><label>시작 (선택)</label>
          <input class="input" id="msStart" type="date" value="${esc(v.start||'')}"></div>
        <div class="field"><label>기준일</label>
          <input class="input" id="msEnd" type="date" value="${esc(v.end||v.start||'')}"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>메모 (선택)</label>
        <input class="input" id="msNote" value="${esc(v.note||'')}" maxlength="120" placeholder="예: 11/20 산출물 품질 검토"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn primary" id="msSave">${v.id==='new'?'등록':'저장'}</button>
        <button class="btn ghost" id="msCancel">취소</button>
      </div>
    </div>`;
}

function msList(){
  const items = state.milestones;
  const row = m => {
    const at = m.end || m.start;
    const past = at && D(at) < today;
    return msEditing === m.id ? `<div class="ms-item editing">${msForm(m)}</div>` : `
      <div class="ms-item ${m.kind === 'sub' ? 'is-sub' : ''}">
        <span class="ms-mark ${past ? 'past' : ''}">${m.kind === 'sub' ? '◇' : '◆'}</span>
        <div class="ms-body">
          <b>${esc(m.name)}</b>
          <span class="badge ${m.kind==='sub'?'':'b-signal'}">${m.kind==='sub'?'Sub':'Main'}</span>
          ${m.note ? `<small>${esc(m.note)}</small>` : ''}
        </div>
        <span class="ms-date mono">${m.start && m.start !== m.end ? fmt(m.start) + ' ~ ' : ''}${fmt(at)}</span>
        <span class="ms-dday mono">${at ? (past ? '지남' : 'D-' + Math.ceil((D(at) - today) / DAY)) : '—'}</span>
        <span class="acts">
          <button class="ag-btn" data-ms-edit="${esc(m.id)}" title="수정">${svg(ICON.cog,12)}</button>
          <button class="ag-btn del" data-ms-del="${esc(m.id)}" title="삭제">${svg(ICON.trash,12)}</button>
        </span>
      </div>`;
  };
  return `
    <div class="ms-list">
      ${items.length ? items.map(row).join('') : '<div class="empty"><b>등록된 마일스톤이 없습니다</b>아래에서 추가하세요.</div>'}
    </div>
    ${msEditing === 'new' ? msForm(null)
      : `<button class="btn" id="msAdd" style="margin-top:12px">＋ 마일스톤 추가</button>`}`;
}

function openMsManager(){
  msEditing = null;
  openModal({
    title: '마일스톤 관리',
    sub: `${state.milestoneLocal ? '이 브라우저에만 저장됩니다' : '팀 전체가 함께 봅니다'}`,
    body: `<div id="msBody">${msList()}</div>`,
    applyLabel: '닫기',
    onApply: null
  });
}

function paintMs(){
  const box = $('#msBody');
  if (box) box.innerHTML = msList();
}

async function msAction(fn){
  try {
    await fn();
    msEditing = null;
    paintMs();
    renderSpine();
    if (current === 'calendar' || current === 'dashboard') await renderView();
  } catch (e){
    toast('마일스톤 저장 실패: ' + e.message, true);
  }
}

function msRead(){
  return {
    name: $('#msName')?.value || '',
    kind: $('#msKind')?.value || 'main',
    start: $('#msStart')?.value || '',
    end: $('#msEnd')?.value || $('#msStart')?.value || '',
    note: $('#msNote')?.value || ''
  };
}

/* ==================================================================
   WBS 번호 다시 매기기
   ================================================================== */
function confirmRenumber(top = false){
  const plan = store.planRenumber(top);
  const n = plan.changes.length;

  openModal({
    title: 'WBS 번호 정리',
    sub: n ? `${n}건의 번호가 바뀝니다` : '바꿀 번호가 없습니다',
    applyLabel: `${n}건 적용`,
    onApply: n ? async () => {
      const btn = $('#modalApply');
      btn.disabled = true; btn.textContent = '적용 중…';
      try {
        await store.applyRenumber(plan.map);
        selected.clear();
        closePreview();
        await refresh();
        toast(`${n}건의 번호를 정리했습니다.`);
      } catch (e){
        btn.disabled = false; btn.textContent = '다시 시도';
        toast('번호 정리 실패: ' + e.message, true);
      }
    } : null,
    body: `
      <div class="note" style="margin-bottom:14px">
        <b>순서는 그대로 두고 번호만 다시 붙입니다.</b>
        추가·삭제로 <span class="mono">2.1.1.2</span> 같은 자리가 비었을 때 씁니다.
        작업명·날짜·진척은 건드리지 않습니다.
      </div>

      <label class="rn-opt">
        <input type="checkbox" id="rnTop" ${top ? 'checked' : ''}>
        <span>L1 단계 번호도 다시 매기기
          <small>지금은 ${state.tasks.filter(t => t.level === 1).map(t => t.code).join(', ')}
          → 1, 2, 3… 으로 바뀝니다. 단계 번호를 이미 공유하셨다면 꺼 두세요.</small>
        </span>
      </label>

      ${n ? `
        <div class="chg-list" style="margin-top:14px">
          ${plan.changes.slice(0, 80).map(c => `
            <div class="chg">
              <code>L${c.level}</code>
              <div style="font-size:12.5px">
                <span class="mono" style="color:var(--muted)">${esc(c.from)}</span>
                <span style="color:var(--muted)"> → </span>
                <b class="mono" style="color:var(--signal-2)">${esc(c.to)}</b>
                <span style="margin-left:8px">${esc(c.name)}</span>
              </div>
            </div>`).join('')}
          ${n > 80 ? `<div class="chg" style="color:var(--muted)">외 ${n - 80}건</div>` : ''}
        </div>` : `
        <div class="empty"><b>번호가 이미 촘촘합니다</b>빈자리가 없습니다.</div>`}

      ${n ? `<div class="note" style="margin-top:14px;border-left-color:var(--amber);background:var(--amber-bg);color:#E8D4AE">
        <b>내려받아 두신 엑셀이 있다면</b> 번호가 달라져 맞지 않습니다.
        정리한 뒤에 다시 내려받아 쓰세요.
      </div>` : ''}`
  });
}

/* ==================================================================
   공유 안건
   ================================================================== */
let editingAgenda = null;

function agendaList(){
  const items = state.agenda;
  return `
    <ul class="agenda">
      ${items.length ? items.map((a, i) => a.id === editingAgenda ? `
        <li class="editing">
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span class="ag-grip ghost">${svg(ICON.grip, 13)}</span>
          <input class="input ag-input" data-ag-edit="${esc(a.id)}"
                 value="${esc(a.text)}" maxlength="200">
        </li>` : `
        <li data-ag-row="${esc(a.id)}">
          <button class="ag-grip" data-ag-grip="${esc(a.id)}"
                  aria-label="${esc(a.text)} 순서 바꾸기"
                  title="끌어서 순서 바꾸기 (방향키도 됩니다)">${svg(ICON.grip, 13)}</button>
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span class="t" data-ag-open="${esc(a.id)}" title="눌러서 수정">${esc(a.text)}</span>
          <span class="acts">
            <button class="ag-btn del" data-ag-del="${esc(a.id)}" title="삭제">${svg(ICON.trash, 12)}</button>
          </span>
        </li>`).join('') : `<li class="none">등록된 안건이 없습니다.</li>`}
    </ul>
    <div class="ag-add">
      <input class="input" id="agNew" placeholder="새 안건을 적고 엔터" maxlength="200">
      <button class="btn" id="agAdd">추가</button>
    </div>`;
}


/* ---------- 안건 끌어서 순서 바꾸기 ----------
   마우스와 터치를 함께 다루려고 포인터 이벤트를 씁니다.
   끄는 동안에는 화면에서 바로 자리를 옮겨 보여주고,
   손을 뗄 때 한 번만 저장합니다. */
let drag = null;

function agendaRows(){
  return [...$$('#agendaBody .agenda li[data-ag-row]')];
}

function startAgendaDrag(e){
  const grip = e.target.closest('[data-ag-grip]');
  if (!grip || editingAgenda) return;
  const li = grip.closest('li');
  if (!li) return;

  e.preventDefault();
  drag = { id: grip.dataset.agGrip, li, from: agendaRows().indexOf(li), moved: false };
  li.classList.add('dragging');
  $('#agendaBody')?.classList.add('dragging-on');
  try { grip.setPointerCapture(e.pointerId); } catch (_) {}
  drag.grip = grip;
  drag.pointerId = e.pointerId;
}

function moveAgendaDrag(e){
  if (!drag) return;
  e.preventDefault();
  const rows = agendaRows().filter(r => r !== drag.li);
  const y = e.clientY;

  // 포인터보다 아래에 있는 첫 항목 앞에 끼워 넣는다
  const after = rows.find(r => {
    const b = r.getBoundingClientRect();
    return y < b.top + b.height / 2;
  });
  const ul = drag.li.parentElement;
  if (after) ul.insertBefore(drag.li, after);
  else {
    const last = rows[rows.length - 1];
    if (last) last.after(drag.li); else ul.appendChild(drag.li);
  }
  drag.moved = true;
  renumberAgenda();
}

function renumberAgenda(){
  agendaRows().forEach((r, i) => {
    const n = r.querySelector('.n');
    if (n) n.textContent = String(i + 1).padStart(2, '0');
  });
}

async function endAgendaDrag(){
  if (!drag) return;
  const { id, li, from, moved } = drag;
  li.classList.remove('dragging');
  $('#agendaBody')?.classList.remove('dragging-on');
  const to = agendaRows().indexOf(li);
  drag = null;

  if (!moved || to < 0 || to === from){ paintAgenda(); return; }
  try {
    await store.reorderAgenda(id, to);
  } catch (e){
    toast('순서 저장 실패: ' + e.message, true);
  }
  paintAgenda();
}

/* 손잡이에 포커스를 두고 방향키로도 옮길 수 있게 한다 */
async function nudgeAgenda(id, dir){
  const i = state.agenda.findIndex(a => a.id === id);
  if (i < 0) return;
  try { await store.reorderAgenda(id, i + dir); } catch (e){ toast('순서 저장 실패: ' + e.message, true); }
  paintAgenda();
  const g = $(`[data-ag-grip="${CSS.escape(id)}"]`);
  if (g) g.focus();
}

function paintAgenda(){
  const box = $('#agendaBody');
  if (box) box.innerHTML = agendaList();
}

async function agendaAction(fn, focusNew){
  try {
    await fn();
    editingAgenda = null;
    paintAgenda();
    if (focusNew) $('#agNew')?.focus();
  } catch (e){
    toast('안건 저장 실패: ' + e.message, true);
  }
}

/* ==================================================================
   표에서 삭제
   ================================================================== */
function visibleCodes(){
  return $$('#rows .row').map(r => r.dataset.code);
}

function renderSelBar(){
  const bar = $('#selBar');
  if (!bar) return;
  if (!selected.size){ bar.innerHTML = ''; bar.classList.remove('on'); return; }

  const victims = store.expandRemoval([...selected]);
  const extra = victims.length - selected.size;
  bar.classList.add('on');
  bar.innerHTML = `
    <div class="sel-bar">
      <span class="badge b-signal" style="font-size:12px;padding:4px 9px">${selected.size}건 선택</span>
      ${extra > 0 ? `<span class="hint">하위 Task ${extra}건이 함께 지워집니다</span>` : ''}
      <div style="flex:1"></div>
      <button class="btn ghost" id="pickClear">선택 해제</button>
      <button class="btn danger" id="pickDelete">${svg(ICON.trash,14)} 삭제</button>
    </div>`;

  const all = $('#pickAll');
  if (all){
    const vis = visibleCodes();
    const on = vis.filter(c => selected.has(c)).length;
    all.checked = on > 0 && on === vis.length;
    all.indeterminate = on > 0 && on < vis.length;
  }
}

function togglePick(code, on){
  on ? selected.add(code) : selected.delete(code);
  const row = $(`#rows .row[data-code="${CSS.escape(code)}"]`);
  if (row) row.classList.toggle('picked', on);
  renderSelBar();
}

function confirmDelete(){
  const victims = store.expandRemoval([...selected]);
  const direct = new Set(selected);
  const byLevel = victims.reduce((a, t) => (a[t.level] = (a[t.level] || 0) + 1, a), {});

  openModal({
    title: 'Task 삭제',
    sub: `${victims.length}건이 지워집니다`,
    danger: true,
    applyLabel: `${victims.length}건 삭제`,
    body: `
      <div class="note" style="border-left-color:var(--rose);background:var(--rose-bg);color:#F5C4CE;margin-bottom:14px">
        <b>되돌릴 수 없습니다.</b>
        직접 고른 ${direct.size}건과 그 하위 ${victims.length - direct.size}건을 지웁니다.
        지우기 전에 [엑셀 내려받기] 로 현재 상태를 받아 두시는 편이 안전합니다.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${[1,2,3,4].filter(l => byLevel[l]).map(l =>
          `<span class="badge">L${l} ${byLevel[l]}건</span>`).join('')}
      </div>
      <div class="chg-list">
        ${victims.slice(0,80).map(t => `
          <div class="chg">
            <code>${esc(t.code)}</code>
            <div style="font-size:12.5px">
              ${esc(t.name)}
              ${direct.has(t.code) ? '' : '<span class="badge b-amber" style="margin-left:6px">하위</span>'}
            </div>
          </div>`).join('')}
        ${victims.length > 80 ? `<div class="chg" style="color:var(--muted)">외 ${victims.length - 80}건</div>` : ''}
      </div>`,
    onApply: async () => {
      const btn = $('#modalApply');
      btn.disabled = true; btn.textContent = '삭제 중…';
      try {
        const r = await store.deleteTasks([...selected]);
        selected.clear();
        closePreview();
        await refresh();
        toast(`${r.removed}건을 지웠습니다.`);
      } catch (e){
        btn.disabled = false; btn.textContent = '다시 시도';
        toast('삭제 실패: ' + e.message, true);
      }
    }
  });
}

/* ==================================================================
   엑셀 왕복
   ================================================================== */
async function exportXlsx(){
  try {
    const bytes = await excel.buildWorkbook(state.tasks, state.project, progressOf);
    excel.downloadWorkbook(bytes,
      `WBS_${state.project.code}_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast('엑셀을 내려받았습니다. 노란 칸을 고친 뒤 [엑셀 올리기] 로 넣으세요.');
  } catch (e){
    toast('엑셀 만들기 실패: ' + e.message, true);
  }
}

let pending = null;   // 미리보기에서 확인 대기 중인 변경분

async function handleFile(file){
  if (typeof XLSX === 'undefined') return toast('엑셀 모듈을 불러오지 못했습니다.', true);
  try {
    const { rows, sheetName, is1904 } = await excel.readWorkbook(file);
    const d = excel.diff(rows, state.tasks);
    const dateCount = d.updates.reduce(
      (n, u) => n + u.changes.filter(c => c.field === 'start' || c.field === 'end').length, 0);
    pending = { ...d, rows, dateCount, fileName: file.name, sheetName,
                rowCount: rows.length, is1904 };
    openPreview();
  } catch (e){
    toast('읽기 실패: ' + e.message, true);
  }
}

function openPreview(){
  const d = pending;
  const total = d.updates.length + d.adds.length;
  const chip = (n, label, cls) =>
    `<span class="badge ${n ? cls : ''}" style="font-size:12px;padding:5px 10px">${label} ${n}</span>`;

  const changeLine = c =>
    `<span class="mono" style="font-size:11px">${esc(c.label)}</span>
     <span style="color:var(--muted)"> ${esc(String(c.from ?? '')) || '(없음)'}</span>
     <span style="color:var(--muted)"> → </span>
     <b style="color:var(--signal-2)">${esc(String(c.to ?? '')) || '(비움)'}</b>`;

  const body = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      ${chip(d.updates.length, '수정', 'b-signal')}
      ${chip(d.adds.length, '추가', 'b-mint')}
      ${chip(d.removes.length, '삭제 후보', 'b-amber')}
      ${chip(d.problems.length, '문제', 'b-rose')}
      ${chip(d.ignored?.length || 0, '자동계산', 'b-amber')}
    </div>

    ${d.problems.length ? `
      <div class="note" style="margin-bottom:14px">
        <b>먼저 확인하세요</b>: 아래 ${d.problems.length}건은 반영되지 않습니다.
        <ul style="margin:8px 0 0;padding-left:18px">
          ${d.problems.slice(0,8).map(p =>
            `<li><span class="mono">${p.row}행 ${esc(p.code)}</span> ${esc(p.msg)}</li>`).join('')}
          ${d.problems.length > 8 ? `<li>외 ${d.problems.length - 8}건</li>` : ''}
        </ul>
      </div>` : ''}

    ${d.dateCount ? `
      <div class="note" style="margin-bottom:14px;border-left-color:var(--mint);background:var(--mint-bg);color:#B8EEDA">
        <b>날짜 ${d.dateCount}건</b>을 파일에 적힌 그대로 넣습니다.
        반영 뒤 파일과 한 건씩 대조해 결과를 알려 드립니다.
      </div>` : ''}

    ${d.ignored?.length ? `
      <div class="note" style="margin-bottom:14px">
        <b>반영하지 않은 날짜 ${d.ignored.length}건</b><br>
        상위 단계(L1~L3)의 계획시작·계획종료는 <b>자식 Task 들의 범위로 자동 계산</b>됩니다.
        여기를 고치는 대신 아래 L4 Task 의 날짜를 옮기면 상위가 따라옵니다.
        <ul style="margin:8px 0 0;padding-left:18px">
          ${d.ignored.slice(0,6).map(x =>
            `<li><span class="mono">${x.row}행 ${esc(x.code)}</span>
             ${esc(x.head)} ${esc(x.from || '')} → ${esc(x.to)}</li>`).join('')}
          ${d.ignored.length > 6 ? `<li>외 ${d.ignored.length - 6}건</li>` : ''}
        </ul>
      </div>` : ''}

    ${d.updates.length ? `
      <h4 style="margin:0 0 8px;font-size:13px">수정 ${d.updates.length}건</h4>
      <div class="chg-list">
        ${d.updates.slice(0,60).map(u => `
          <div class="chg">
            <code>${esc(u.code)}</code>
            <div>
              <div style="font-size:12.5px;margin-bottom:3px">${esc(u.name)}</div>
              ${u.changes.map(c => `<div>${changeLine(c)}</div>`).join('')}
            </div>
          </div>`).join('')}
        ${d.updates.length > 60 ? `<div class="chg" style="color:var(--muted)">외 ${d.updates.length - 60}건</div>` : ''}
      </div>` : ''}

    ${d.adds.length ? `
      <h4 style="margin:16px 0 8px;font-size:13px">추가 ${d.adds.length}건</h4>
      <div class="chg-list">
        ${d.adds.slice(0,30).map(a => `
          <div class="chg"><code>${esc(a.code)}</code>
            <div style="font-size:12.5px">${esc(a.name)}
              <span class="badge" style="margin-left:6px">L${a.level}</span></div>
          </div>`).join('')}
      </div>` : ''}

    ${d.removes.length ? `
      <h4 style="margin:16px 0 8px;font-size:13px">엑셀에 없는 Task ${d.removes.length}건</h4>
      <div class="note" style="margin-bottom:10px">
        엑셀에서 행을 지우셨거나, 일부만 골라 올리신 경우입니다.
        <b>기본은 그대로 두기</b>이고, 정말 지우려면 아래를 켜세요. 하위 Task 도 함께 지워집니다.
      </div>
      <label style="display:flex;gap:9px;align-items:center;font-size:12.5px;cursor:pointer">
        <input type="checkbox" id="doRemove" style="accent-color:var(--rose)">
        <span>이 ${d.removes.length}건을 삭제합니다</span>
      </label>
      <div class="chg-list" style="margin-top:10px;max-height:150px">
        ${d.removes.slice(0,30).map(r =>
          `<div class="chg"><code>${esc(r.code)}</code><div style="font-size:12.5px">${esc(r.name)}</div></div>`).join('')}
      </div>` : ''}

    ${!total && !d.removes.length && !d.ignored?.length ? `
      <div class="empty"><b>바뀐 내용이 없습니다</b>
      엑셀 ${d.rowCount}행을 읽었고 ${d.matched}건이 기존 Task 와 일치합니다.</div>` : ''}
  `;

  openModal({
    title: '엑셀 반영 미리보기',
    sub: `${d.fileName} · ${d.sheetName} 시트 · ${d.rowCount}행`
       + (d.is1904 ? ' · 1904 날짜 체계 (Mac Excel)' : ''),
    body,
    applyLabel: total ? `${total}건 반영` : '삭제만 반영',
    onApply: (total || d.removes.length) ? applyPending : null
  });
}

function closePreview(){ $('#modal').classList.remove('on'); pending = null; modalAction = null; }

let modalAction = null;

/* 제목·본문·확인버튼을 받아 모달을 연다. onApply 가 실제 동작. */
function openModal({ title, sub, body, applyLabel, onApply, danger }){
  $('#modalTitle').textContent = title;
  $('#modalSub').textContent = sub || '';
  $('#modalBody').innerHTML = body;
  const btn = $('#modalApply');
  btn.style.display = onApply ? '' : 'none';
  btn.textContent = applyLabel || '확인';
  btn.classList.toggle('danger', !!danger);
  btn.disabled = false;
  modalAction = onApply;
  $('#modal').classList.add('on');
}

async function applyPending(){
  if (!pending) return;
  const wantRemove = $('#doRemove')?.checked;
  const payload = {
    updates: pending.updates,
    adds: pending.adds,
    removes: wantRemove ? pending.removes : []
  };
  const btn = $('#modalApply');
  btn.disabled = true; btn.textContent = '반영 중…';
  try {
    const rowsSnapshot = pending.rows;
    const r = await store.applyBulk(payload);

    // 파일에 적힌 날짜가 그대로 들어갔는지 한 건씩 대조합니다.
    const audit = excel.auditDates(rowsSnapshot, state.tasks);
    closePreview();
    await refresh();

    if (audit.mismatched.length){
      showDateAudit(audit);
      toast(`날짜 ${audit.mismatched.length}건이 파일과 다릅니다. 확인해 주세요.`, true);
    } else {
      toast(`반영 완료 — 수정 ${r.updated} · 추가 ${r.added} · 삭제 ${r.removed}`
        + (audit.checked ? ` · 날짜 ${audit.matched}/${audit.checked} 일치` : ''));
    }
  } catch (e){
    btn.disabled = false; btn.textContent = '다시 시도';
    toast('반영 실패: ' + e.message, true);
  }
}

/* ---------- 배포 진단 ---------- */
async function runDiagnostics(){
  const el = $('#diag');
  if (!el) return;
  const rows = [];
  // ok: true=정상 / false=문제 / null=해당 없음
  const mark = (ok, label, detail) => {
    const cls = ok === null ? '' : ok ? 'b-mint' : 'b-rose';
    const txt = ok === null ? '—' : ok ? 'OK' : '실패';
    rows.push(`<div><span class="badge ${cls}" style="min-width:34px;justify-content:center">${txt}</span>
      <span style="margin-left:7px">${label}</span>
      <span style="color:var(--muted)"> ${detail}</span></div>`);
  };

  // 1) 폰트가 실제로 내려왔는지
  try { await document.fonts.ready; } catch (_) {}
  const loaded = [...document.fonts].filter(f => f.family === 'Paperlogy' && f.status === 'loaded');
  mark(loaded.length > 0, '페이퍼로지 글꼴',
       loaded.length ? `${loaded.length}종 로드됨` : '내려오지 않음 (아래 안내 참고)');

  // 2) 실제로 그려지는 글꼴이 무엇인지
  const fam = getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g,'');
  mark(fam === 'Paperlogy', '본문 적용 글꼴', fam);

  // 3) 폰트 파일에 직접 접근되는지 (경로·MIME 확인)
  try {
    const r = await fetch('./assets/fonts/Paperlogy-400.woff2', { method:'HEAD', cache:'no-store' });
    mark(r.ok, '글꼴 파일 경로',
         r.ok ? `${r.headers.get('content-type') || 'type 미지정'}` : `${r.status} ${r.statusText}`);
  } catch (_) { mark(false, '글꼴 파일 경로', '요청 실패'); }

  // 3-b) store.js 가 최신인지. normalizeUrl 은 최신 버전에만 있다.
  const fresh = typeof store.normalizeUrl === 'function';
  mark(fresh, '코드 버전(store.js)',
       fresh ? '최신' : '옛 캐시가 남아 있습니다. 강력 새로고침(Ctrl/Cmd+Shift+R) 하세요.');

  // 4) 지금 보고 있는 CSS 가 최신인지 (build.sh 가 붙인 버전)
  const link = [...document.querySelectorAll('link[rel=stylesheet]')]
    .find(l => l.href.includes('app.css'));
  const ver = link ? (link.href.match(/[?&]v=([^&]+)/) || [,'없음(로컬)'])[1] : '없음';
  mark(true, '자산 버전', ver);

  // 5) Supabase 연결 상태
  const c = store.getConfig();
  if (!c){
    mark(null, 'Supabase', '미설정 (브라우저 저장 모드)');
  } else {
    const dirty = /\/rest\/v1|\/$/.test(c.url);
    mark(state.mode === 'supabase', 'Supabase',
      `${state.mode === 'supabase' ? '연결됨' : '연결 실패'} · ${c.url}` +
      (dirty ? ' ← URL 에 경로가 붙어 있습니다' : ''));
    if (state.error) mark(false, '마지막 오류', state.error.slice(0, 90));
  }

  el.innerHTML = rows.join('');
}

async function runWriteTest(){
  const out = $('#writeOut'), btn = $('#writeTest');
  if (!out) return;
  btn.disabled = true; btn.textContent = '확인 중…';
  out.innerHTML = '';
  try {
    const r = await store.writeSelfTest();
    out.innerHTML = `
      <div class="note" style="border-left-color:${r.ok ? 'var(--mint)' : 'var(--rose)'};
           background:${r.ok ? 'var(--mint-bg)' : 'var(--rose-bg)'};
           color:${r.ok ? '#B8EEDA' : '#F5C4CE'}">
        <b>${r.ok ? '쓰기 성공' : r.step + ' 실패'}</b>
        ${r.status ? `<span class="mono" style="margin-left:6px">HTTP ${r.status}</span>` : ''}
        ${r.code ? `<span class="mono" style="margin-left:6px">${esc(r.code)}</span>` : ''}
        <div style="margin-top:6px;font-size:11.5px;line-height:1.6">${esc(r.detail)}</div>
        ${r.headers ? `<div class="mono" style="margin-top:6px;font-size:10.5px;opacity:.75">보낸 헤더: ${esc(r.headers)}</div>` : ''}
      </div>`;
  } catch (e){
    out.innerHTML = `<div class="note">확인 실패: ${esc(e.message)}</div>`;
  }
  btn.disabled = false; btn.textContent = '쓰기 테스트';
}

/* ---------- 토스트 ---------- */
let toastTimer;
function toast(msg, isErr){
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast on' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

/* ==================================================================
   라우팅 + 이벤트
   ================================================================== */
const VIEWS = {
  dashboard:   { label:'진척 현황', icon:ICON.dash,  render:viewDashboard },
  tree:        { label:'WBS 트리',  icon:ICON.tree,  render:viewTree },
  gantt:       { label:'일정 간트', icon:ICON.gantt, render:viewGantt },
  calendar:    { label:'스케줄 달력', icon:ICON.cal,  render:viewCalendar },
  log:         { label:'변경 이력', icon:ICON.hist,  render:viewLog },
  settings:    { label:'설정',      icon:ICON.cog,   render:viewSettings }
};
let current = 'dashboard';

function renderNav(){
  const leaves = state.tasks.filter(t => t.level === 4).length;
  $('#nav').innerHTML = `
    <div class="nav-label">Project</div>
    ${Object.entries(VIEWS).map(([k,v]) => `
      <button class="nav-item" data-view="${k}" aria-current="${k===current}">
        ${svg(v.icon,17)}<span>${v.label}</span>
        ${k==='tree' ? `<span class="badge">${leaves}</span>` : ''}
      </button>`).join('')}`;
}

async function renderView(){
  const out = VIEWS[current].render();
  $('#view').innerHTML = out instanceof Promise ? await out : out;
  if (current === 'settings') runDiagnostics();
  if (current === 'tree') renderSelBar();
}

async function refresh(){ renderTop(); renderSpine(); renderNav(); await renderView(); }

function bind(){
  document.addEventListener('pointerdown', startAgendaDrag);
  document.addEventListener('pointermove', moveAgendaDrag, { passive:false });
  document.addEventListener('pointerup', endAgendaDrag);
  document.addEventListener('pointercancel', endAgendaDrag);

  document.addEventListener('click', async e => {
    const nav = e.target.closest('[data-view]');
    if (nav){
      current = nav.dataset.view;
      await refresh();
      window.scrollTo(0, 0);
      return;
    }

    const tw = e.target.closest('[data-toggle]');
    if (tw){
      const c = tw.dataset.toggle;
      collapsed.has(c) ? collapsed.delete(c) : collapsed.add(c);
      $('#rows').innerHTML = treeRows();
      renderSelBar();
      return;
    }

    const msBtn = e.target.closest('[data-ms-edit],[data-ms-del]');
    if (msBtn){
      const d = msBtn.dataset;
      if (d.msEdit){ msEditing = d.msEdit; paintMs(); $('#msName')?.focus(); return; }
      if (d.msDel){ await msAction(() => store.deleteMilestone(d.msDel)); return; }
    }

    const cb = e.target.closest('[data-cal-task]');
    if (cb){
      const code = cb.dataset.calTask;
      filter = { q: code, status:'', level:'4' };
      collapsed.clear();
      current = 'tree';
      await refresh();
      window.scrollTo(0, 0);
      toast(`${code} 를 WBS 트리에서 찾았습니다.`);
      return;
    }

    const ag = e.target.closest('[data-ag-open],[data-ag-del]');
    if (ag){
      const d = ag.dataset;
      if (d.agOpen){ editingAgenda = d.agOpen; paintAgenda();
        const inp = $('.ag-input'); if (inp){ inp.focus(); inp.select(); } return; }
      if (d.agDel){ await agendaAction(() => store.deleteAgenda(d.agDel)); return; }
    }

    const id = e.target.closest('button')?.id;
    if (!id) return;
    if (id === 'pickClear'){ selected.clear(); $('#rows').innerHTML = treeRows(); renderSelBar(); return; }
    if (id === 'pickDelete'){ confirmDelete(); return; }
    if (id === 'renumber'){ confirmRenumber(false); return; }
    if (id === 'msManage'){ openMsManager(); return; }
    if (id === 'msAdd'){ msEditing = 'new'; paintMs(); $('#msName')?.focus(); return; }
    if (id === 'msCancel'){ msEditing = null; paintMs(); return; }
    if (id === 'msSave'){
      const d = msRead();
      await msAction(() => msEditing === 'new'
        ? store.addMilestone(d)
        : store.updateMilestone(msEditing, d));
      return;
    }
    if (id === 'expandAll'){ collapsed.clear(); $('#rows').innerHTML = treeRows(); renderSelBar(); }
    if (id === 'collapseAll'){
      state.tasks.filter(t => t.level === 2).forEach(t => collapsed.add(t.code));
      $('#rows').innerHTML = treeRows();
      renderSelBar();
    }
    if (id === 'exportXlsx' || id === 'expXlsx') await exportXlsx();
    if (id === 'importXlsx' || id === 'impXlsx') $('#xlsxFile')?.click();
    if (id === 'agAdd'){
      const v = $('#agNew')?.value;
      if (v && v.trim()) await agendaAction(() => store.addAgenda(v), true);
      return;
    }
    if (id === 'calPrev'){ shiftMonth(-1); await renderView(); return; }
    if (id === 'calNext'){ shiftMonth(1); await renderView(); return; }
    if (id === 'calToday'){ calYm = null; calInit(); await renderView(); return; }
    if (id === 'writeTest') await runWriteTest();
    if (id === 'modalClose' || id === 'modalCancel') closePreview();
    if (id === 'modalApply' && modalAction) await modalAction();
    if (id === 'expJson') exportJson();
    if (id === 'resetLocal'){
      store.resetLocal(); toast('원본 WBS 상태로 되돌렸습니다.');
      await store.load(); await refresh();
    }
    if (id === 'sbSave'){
      const u = $('#sbUrl').value.trim(), k = $('#sbKey').value.trim();
      if (!u || !k) return toast('URL 과 키를 모두 넣어 주세요.', true);
      store.saveConfig(u, k); toast('저장했습니다. 다시 불러옵니다.');
      await store.load(); await refresh();
    }
    if (id === 'sbTest'){
      const u = $('#sbUrl').value.trim(), k = $('#sbKey').value.trim();
      try { await store.testConnection(u, k); toast('연결됐습니다.'); }
      catch (err){ toast('연결 실패: ' + err.message, true); }
    }
    if (id === 'sbClear'){
      store.clearConfig(); toast('연결을 해제했습니다.');
      await store.load(); await refresh();
    }
  });

  document.addEventListener('input', async e => {
    const t = e.target;
    if (t.id === 'q'){ filter.q = t.value; $('#rows').innerHTML = treeRows(); renderSelBar(); return; }
  });

  document.addEventListener('focusout', async e => {
    const t = e.target;
    if (t.dataset && t.dataset.agEdit && editingAgenda === t.dataset.agEdit){
      const id = t.dataset.agEdit, v = t.value;
      setTimeout(() => {
        if (editingAgenda === id) agendaAction(() => store.updateAgenda(id, v));
      }, 120);   // 삭제 버튼 클릭이 먼저 처리되도록 잠깐 기다린다
    }
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.pick){ togglePick(t.dataset.pick, t.checked); return; }
    if (t.id === 'pickAll'){
      visibleCodes().forEach(c => t.checked ? selected.add(c) : selected.delete(c));
      $('#rows').innerHTML = treeRows();
      renderSelBar();
      return;
    }
    if (t.id === 'xlsxFile'){
      const f = t.files && t.files[0];
      t.value = '';                      // 같은 파일을 다시 골라도 반응하도록
      if (f) await handleFile(f);
      return;
    }
    if (t.id === 'fStatus'){ filter.status = t.value; $('#rows').innerHTML = treeRows(); renderSelBar(); return; }
    if (t.id === 'fLevel'){ filter.level = t.value; $('#rows').innerHTML = treeRows(); renderSelBar(); return; }
    if (t.id === 'gDepth'){ ganttDepth = +t.value; await renderView(); return; }
    if (t.id === 'rnTop'){ confirmRenumber(t.checked); return; }
    if (t.id === 'calPhase'){ calFilter.phase = t.value; await renderView(); return; }
    if (t.id === 'calStatus'){ calFilter.status = t.value; await renderView(); return; }
    if (t.id === 'calLevel'){ calFilter.level = t.value; await renderView(); return; }

    if (t.dataset.status){
      const code = t.dataset.status;
      const patch = { status: t.value };
      try {
        await store.updateTask(code, patch);
        $('#rows').innerHTML = treeRows();
        renderTop();
      } catch (err){ toast('저장 실패: ' + err.message, true); }
    }
  });

  document.addEventListener('keydown', async e => {
    const t = e.target;
    if (t.id === 'agNew' && e.key === 'Enter'){
      e.preventDefault();
      if (t.value.trim()) await agendaAction(() => store.addAgenda(t.value), true);
      return;
    }
    if (t.dataset && t.dataset.agGrip){
      if (e.key === 'ArrowUp'){ e.preventDefault(); await nudgeAgenda(t.dataset.agGrip, -1); return; }
      if (e.key === 'ArrowDown'){ e.preventDefault(); await nudgeAgenda(t.dataset.agGrip, 1); return; }
    }
    if (t.dataset && t.dataset.agEdit){
      if (e.key === 'Enter'){
        e.preventDefault();
        await agendaAction(() => store.updateAgenda(t.dataset.agEdit, t.value));
      } else if (e.key === 'Escape'){
        e.preventDefault(); editingAgenda = null; paintAgenda();
      }
      return;
    }
    if (e.key === 'Escape' && $('#modal').classList.contains('on')){ closePreview(); return; }
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT'){
      const q = $('#q'); if (q){ e.preventDefault(); q.focus(); }
    }
  });
}

/* ---------- 부팅 ---------- */
(async function boot(){
  await store.load();
  $('#conn').innerHTML = state.mode === 'supabase'
    ? `<span class="dot live"></span><span>Supabase 연결됨</span>`
    : `<span class="dot local"></span><span>브라우저 저장 모드</span>`;
  bind();
  await refresh();
  if (state.error && state.mode === 'local') toast(state.error, true);
})();
