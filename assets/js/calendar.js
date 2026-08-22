/* ==================================================================
   calendar.js — 스케줄 달력 (월간)

   WBS Task 를 달력 위에 막대로 그립니다.
   여러 날에 걸친 Task 는 주가 바뀌어도 이어지고, 그 주를 벗어나는 쪽은
   ◀ ▶ 로 표시합니다. 겹치는 Task 는 위아래 줄(레인)로 나눠 놓습니다.

   막대 배치는 업로드해 주신 worklog 앱의 방식을 가져왔습니다.
   한 주를 [뒤쪽 배경 7칸] + [앞쪽 CSS 그리드] 로 겹쳐 놓고,
   막대는 grid-column 으로 며칠짜리인지, grid-row 로 몇 번째 줄인지 정합니다.
   ================================================================== */

import { getHoliday, hasHolidayData, FIRST_YEAR, LAST_YEAR } from './holidays.js';

const DAY = 864e5;
const p2 = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const parse = s => (s ? new Date(s + 'T00:00:00') : null);

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/* ---------- 달력 격자 ----------
   그 달을 일요일 시작 주 단위로 자른다. 앞뒤 빈칸은 null. */
export function buildWeeks(year, month){
  const first = new Date(year, month - 1, 1);
  const last  = new Date(year, month, 0);
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++){
    const dt = new Date(year, month - 1, d);
    cells.push({ day: d, date: iso(dt), dow: dt.getDay(), holiday: getHoliday(iso(dt)) });
  }
  while (cells.length % 7) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push({ cells: cells.slice(i, i + 7), bars: [] });
  return weeks;
}

/* ---------- 막대 배치 ----------
   tasks: [{ code, name, start, end, ... }]
   한 주 안에서 겹치지 않도록 레인을 배정한다. */
export function layoutBars(weeks, tasks, maxLanes = 4){
  const overflow = new Map();      // 주 인덱스 -> 자리 없어 못 그린 건수

  weeks.forEach((week, wi) => {
    const days = week.cells.filter(Boolean);
    if (!days.length) return;
    const wStart = days[0].date, wEnd = days[days.length - 1].date;

    const hits = tasks
      .filter(t => t.start && t.end && t.start <= wEnd && t.end >= wStart)
      .sort((a, b) =>
        (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) ||
        (b.span - a.span) ||
        (a.code < b.code ? -1 : 1));

    const lanes = [];              // lanes[n] = 그 레인에서 마지막으로 찬 칸 번호
    let hidden = 0;

    for (const t of hits){
      const s = t.start < wStart ? wStart : t.start;
      const e = t.end   > wEnd   ? wEnd   : t.end;
      const from = week.cells.findIndex(c => c && c.date === s);
      const toIdx = week.cells.findIndex(c => c && c.date === e);
      if (from < 0 || toIdx < 0) continue;

      let lane = lanes.findIndex(end => end < from);
      if (lane < 0) lane = lanes.length;
      if (lane >= maxLanes){ hidden++; continue; }
      lanes[lane] = toIdx;

      week.bars.push({
        ...t,
        from: from + 1, to: toIdx + 2,          // CSS grid 는 1부터, 끝은 배타적
        lane,
        cutLeft:  t.start < wStart,
        cutRight: t.end   > wEnd
      });
    }
    if (hidden) overflow.set(wi, hidden);
  });

  return overflow;
}

/* ---------- 그 달에 걸치는 Task 만 추리기 ---------- */
export function tasksInMonth(tasks, year, month){
  const first = iso(new Date(year, month - 1, 1));
  const last  = iso(new Date(year, month, 0));
  return tasks
    .filter(t => t.start && t.end && t.start <= last && t.end >= first)
    .map(t => ({ ...t, span: Math.round((parse(t.end) - parse(t.start)) / DAY) + 1 }));
}

/* ---------- 그 달의 공휴일 ---------- */
export function holidaysInMonth(year, month){
  const out = [];
  const last = new Date(year, month, 0).getDate();
  for (let d = 1; d <= last; d++){
    const key = `${year}-${p2(month)}-${p2(d)}`;
    const h = getHoliday(key);
    if (h) out.push({ day: d, date: key, ...h });
  }
  return out;
}

/* ---------- 그 달에 걸리는 마일스톤 ---------- */
export function milestonesInMonth(milestones, year, month){
  const first = iso(new Date(year, month - 1, 1));
  const last  = iso(new Date(year, month, 0));
  return milestones
    .filter(m => (m.end || m.start) && (m.end || m.start) >= first && (m.end || m.start) <= last)
    .map(m => ({ ...m, at: m.end || m.start }));
}

export { hasHolidayData, FIRST_YEAR, LAST_YEAR };
