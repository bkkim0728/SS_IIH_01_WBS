/* ==================================================================
   app.js — 화면
   ================================================================== */
import * as store from './store.js';
import { state } from './store.js';

/* ---------- 유틭 ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const D = s => s ? new Date(s + 'T00:00:00') : null;
const fmt = s => s ? s.slice(2).replace(/-/g,'.') : '—';
const clamp = (n,a,b) => Math.max(a, Math.min(b, n));
const DAY = 864e5;

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
  chev:'<path d="M9 6l6 6-6 6"/>'
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
      <div class="sub">${esc(state.project.code)} · ${esc(state.project.version)}
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
  const ms = state.milestones.filter(m => m.start || m.end);
  const anchor = m => D(m.end || m.start);
  const nextIdx = ms.findIndex(m => anchor(m) >= today);
  const donePct = nextIdx < 0 ? 100 : (nextIdx / Math.max(ms.length - 1, 1)) * 100;
  const adj = state.milestones.filter(m => m.adjusted).length;

  $('#spine').innerHTML = `
    <div class="spine-head">
      <h2>Milestone</h2>
      <em>${ms.length}개 · ${WEEKS}주 여정</em>
      ${adj ? `<span class="badge b-amber">연도 보정 ${adj}건</span>` : ''}
    </div>
    <div class="spine-track">
      <div class="spine-line"></div>
      <div class="spine-done" style="width:${donePct}%"></div>
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
        return `<div class="phase-row">
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

      <div class="card">
        <h3>공유 안건</h3>
        <div class="hint" style="margin-bottom:6px">원본 시트 상단에 적힌 논의 항목입니다.</div>
        <ul class="agenda">${state.agenda.map(a =>
          `<li>${esc(a.replace(/^\d+\.\s*/, ''))}</li>`).join('')}</ul>
      </div>
    </div>
  </div>`;
}

/* ==================================================================
   VIEW 2 — WBS 트리
   ================================================================== */
const collapsed = new Set();
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
    <button class="btn" id="exportCsv">${svg(ICON.down,14)} CSV 내려받기</button>
  </div>

  <div class="tree">
    <div class="tree-head">
      <div>WBS</div><div>작업명</div><div class="r-deliv">산출물</div><div class="r-dates">기간</div>
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
    <div class="row lv${t.level}" data-code="${esc(t.code)}">
      <div class="r-code indent-${t.level}">
        <span class="twist ${kid ? (open?'open':'') : 'leaf'}" data-toggle="${esc(t.code)}">${svg(ICON.chev,12)}</span>
        <code>${esc(t.code)}</code>
      </div>
      <div class="r-name">
        <span>${esc(t.name)}</span>
        ${t.note ? `<span class="badge b-amber" title="${esc(t.note)}">메모</span>` : ''}
        ${overdue ? `<span class="badge b-rose">초과</span>` : ''}
      </div>
      <div class="r-deliv">${esc(t.deliverable) || '<span style="color:#3D4A61">—</span>'}</div>
      <div class="r-dates">
        <s class="${t.dateSource==='auto'?'auto':''}">${fmt(t.start)}</s><br>
        <s class="${t.dateSource==='auto'?'auto':''}">${fmt(t.end)}</s>
      </div>
      <div class="r-prog">
        ${t.level === 4
          ? `<input type="range" min="0" max="100" step="5" value="${pr}" data-prog="${esc(t.code)}">
             <span class="pct">${pr}%</span>`
          : `<div class="bar"><i class="${pr>=100?'full':pr===0?'zero':''}" style="width:${pr}%"></i></div>
             <span class="pct">${pr}%</span>`}
      </div>
      <div class="r-status">
        ${t.level === 4
          ? `<select data-status="${esc(t.code)}">${Object.entries(STATUS).map(([k,v]) =>
              `<option value="${k}" ${t.status===k?'selected':''}>${v.label}</option>`).join('')}</select>`
          : `<span class="badge ${st.cls}">${pr>=100?'완료':pr>0?'진행중':'미착수'}</span>`}
      </div>
      <div class="r-days mono">${t.days || '—'}</div>
    </div>`;
  }).join('');
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
        const cls = pr >= 100 ? 'done' : t.status === 'blocked' ? 'blocked' : '';
        return `<div class="g-row lv${t.level}">
          <div class="g-label indent-${t.level}"><code>${esc(t.code)}</code><span>${esc(t.name)}</span></div>
          <div class="g-track">
            <div class="g-grid">${weekList.map(w =>
              `<i class="${w.mid.getDate() <= 7 ? 'month' : ''}" style="width:${cw}%"></i>`).join('')}</div>
            <div class="g-bar ${cls}" style="left:${l}%;width:${Math.max(r-l,.7)}%"
                 title="${esc(t.name)} · ${fmt(t.start)} → ${fmt(t.end)} · ${pr}%">
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
   VIEW 4 — 산출물
   ================================================================== */
function viewDeliverables(){
  const map = new Map();
  state.tasks.filter(t => t.level === 4 && t.deliverable).forEach(t => {
    t.deliverable.split(',').map(s => s.trim()).filter(Boolean).forEach(d => {
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(t);
    });
  });
  const items = [...map.entries()].sort((a,b) => b[1].length - a[1].length);

  return `
  <div class="view-head">
    <div><h2>산출물</h2><p>${items.length}종 · WBS 리프 Task 에 붙은 문서를 이름으로 묶었습니다</p></div>
  </div>
  <div class="deliv">
    ${items.map(([name, ts]) => {
      const pr = Math.round(ts.reduce((a,t) => a + t.progress, 0) / ts.length);
      return `<div class="card">
        <div class="d-top">
          <h4>${esc(name)}</h4>
          <span class="badge ${pr>=100?'b-mint':pr>0?'b-signal':''}">${pr}%</span>
        </div>
        <div class="bar" style="margin-top:10px">
          <i class="${pr>=100?'full':pr===0?'zero':''}" style="width:${pr}%"></i>
        </div>
        <div class="hint" style="margin-top:8px">관련 Task ${ts.length}건</div>
        <ul>${ts.slice(0,5).map(t =>
          `<li><code>${esc(t.code)}</code><span>${esc(t.name)}</span></li>`).join('')}
          ${ts.length > 5 ? `<li style="color:#4E5C74">외 ${ts.length - 5}건</li>` : ''}
        </ul>
      </div>`;
    }).join('')}
  </div>`;
}

/* ==================================================================
   VIEW 5 — 변경 이력
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
   VIEW 6 — 설정
   ================================================================== */
function viewSettings(){
  const c = store.getConfig();
  return `
  <div class="view-head"><div><h2>설정</h2><p>Supabase 를 연결하면 팀 전체가 같은 진척을 봅니다</p></div></div>

  <div class="grid g-2">
    <div class="card">
      <h3>Supabase 연결</h3>
      <div class="hint" style="margin-bottom:14px">
        Supabase 프로젝트의 <b>Project URL</b> 과 <b>anon public</b> 키를 넣으세요.
        키는 이 브라우저에만 저장됩니다. Render 환경변수로 넣으면 모두에게 자동 적용됩니다.
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="field"><label>Project URL</label>
          <input class="input" id="sbUrl" placeholder="https://xxxxxxxx.supabase.co"
                 value="${esc(c?.url || '')}"></div>
        <div class="field"><label>anon public key</label>
          <input class="input" id="sbKey" type="password" placeholder="eyJhbGciOi..."
                 value="${esc(c?.key || '')}"></div>
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
        <h3>데이터 내보내기</h3>
        <div class="hint" style="margin-bottom:12px">현재 진척이 반영된 상태로 저장됩니다.</div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn" id="expCsv">${svg(ICON.down,14)} CSV</button>
          <button class="btn" id="expJson">${svg(ICON.down,14)} JSON</button>
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
function exportCsv(){
  const head = ['WBS','Level','작업명','산출물','담당자','계획시작','계획종료','일수','진척률','상태','날짜출처'];
  const q = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const body = state.tasks.map(t => [t.code, t.level, t.name, t.deliverable, t.owner,
    t.start, t.end, t.days, progressOf(t), (STATUS[t.status]||{}).label || '', t.dateSource].map(q).join(','));
  download(`WBS_${state.project.code}_${new Date().toISOString().slice(0,10)}.csv`,
    [head.map(q).join(','), ...body].join('\n'), 'text/csv;charset=utf-8');
  toast('CSV 를 내려받았습니다.');
}
function exportJson(){
  download(`WBS_${state.project.code}_${new Date().toISOString().slice(0,10)}.json`,
    JSON.stringify({ project:state.project, milestones:state.milestones, tasks:state.tasks }, null, 2),
    'application/json');
  toast('JSON 을 내려받았습니다.');
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
  deliverables:{ label:'산출물',    icon:ICON.file,  render:viewDeliverables },
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
}

async function refresh(){ renderTop(); renderSpine(); renderNav(); await renderView(); }

function bind(){
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
      return;
    }

    const id = e.target.closest('button')?.id;
    if (!id) return;
    if (id === 'expandAll'){ collapsed.clear(); $('#rows').innerHTML = treeRows(); }
    if (id === 'collapseAll'){
      state.tasks.filter(t => t.level === 2).forEach(t => collapsed.add(t.code));
      $('#rows').innerHTML = treeRows();
    }
    if (id === 'exportCsv' || id === 'expCsv') exportCsv();
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
    if (t.id === 'q'){ filter.q = t.value; $('#rows').innerHTML = treeRows(); return; }
    if (t.dataset.prog){
      const row = t.closest('.row');
      row.querySelector('.pct').textContent = t.value + '%';
    }
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'fStatus'){ filter.status = t.value; $('#rows').innerHTML = treeRows(); return; }
    if (t.id === 'fLevel'){ filter.level = t.value; $('#rows').innerHTML = treeRows(); return; }
    if (t.id === 'gDepth'){ ganttDepth = +t.value; await renderView(); return; }

    if (t.dataset.prog || t.dataset.status){
      const code = t.dataset.prog || t.dataset.status;
      const patch = t.dataset.prog ? { progress:+t.value } : { status:t.value };
      try {
        await store.updateTask(code, patch);
        $('#rows').innerHTML = treeRows();
        renderTop();
      } catch (err){ toast('저장 실패: ' + err.message, true); }
    }
  });

  document.addEventListener('keydown', e => {
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
