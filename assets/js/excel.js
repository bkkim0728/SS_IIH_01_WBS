/* ==================================================================
   excel.js — WBS 엑셀 왕복 (내려받기 → 수정 → 업로드)
   SheetJS 는 index.html 에서 전역(XLSX)으로 먼저 읽힙니다.
   ================================================================== */

import { writeXlsx, S } from './xlsx-writer.js';
import { HOLIDAYS, HOLIDAY_SET } from './holidays.js';

export const SHEET = 'WBS';
export const HELP_SHEET = '작성안내';
export const HOL_SHEET  = '공휴일';

/* 열 정의. key 는 내부 필드, head 는 엑셀 머리글.
   edit=false 인 열은 읽기 전용이며, 바꿔도 무시합니다. */
export const COLUMNS = [
  { key:'code',        head:'WBS',      width:14, edit:false },
  { key:'level',       head:'레벨',      width:6,  edit:false },
  { key:'parent',      head:'상위',      width:12, edit:false },
  { key:'name',        head:'작업명',    width:44, edit:true  },
  { key:'owner',       head:'담당자',    width:12, edit:true  },
  { key:'start',       head:'계획시작',  width:12, edit:true  },
  { key:'end',         head:'계획종료',  width:12, edit:true  },
  { key:'days',        head:'일수',      width:7,  edit:false },
  { key:'progress',    head:'진척률',    width:8,  edit:true  },
  { key:'status',      head:'상태',      width:10, edit:true  },
];

const STATUS_LABEL = { not_started:'미착수', in_progress:'진행중', done:'완료', blocked:'지연' };
const LABEL_STATUS = Object.fromEntries(Object.entries(STATUS_LABEL).map(([k,v]) => [v,k]));

/* 계획시작~계획종료 사이 영업일 수.
   양 끝 포함, 주말과 공휴일(holidays.js) 제외.
   일수는 어디서도 입력받지 않고 항상 이 함수로 구합니다. */
export function bizDays(start, end){
  if (!start || !end) return 0;
  const a = new Date(start + 'T00:00:00'), b = new Date(end + 'T00:00:00');
  if (isNaN(a) || isNaN(b) || a > b) return 0;
  const p = n => String(n).padStart(2, '0');
  let n = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)){
    const w = d.getDay();
    if (w === 0 || w === 6) continue;
    const iso = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    if (HOLIDAY_SET.has(iso)) continue;
    n++;
  }
  return n;
}

/* 엑셀 날짜 일련번호 (1899-12-30 기준) */
export function excelSerial(iso){
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Math.round((Date.UTC(+m[1], +m[2]-1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5);
}

/* ---------- 값 정리 ---------- */
const txt = v => String(v ?? '').trim();

/* 엑셀은 날짜를 1900 기준 일련번호로 줄 수도, 문자열로 줄 수도 있습니다. */
function toDate(v){
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)){
    // 가장 가까운 자정으로 반올림합니다.
    // 23:27 처럼 자정 직전으로 떨어진 값이 전날로 읽히는 것을 막습니다.
    const p = n => String(n).padStart(2,'0');
    const d = new Date(v.getTime());
    if (d.getHours() >= 12) d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  // 엑셀 일련번호. UTC 로만 계산해 어느 시간대에서든 같은 날짜가 나옵니다.
  if (typeof v === 'number' && isFinite(v) && v > 1 && v < 400000){
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return d.toISOString().slice(0, 10);
  }
  const pad = (a, b, c) => `${a}-${String(b).padStart(2,'0')}-${String(c).padStart(2,'0')}`;
  const raw = txt(v);

  // 2026년 9월 1일
  const kr = raw.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/);
  if (kr) return pad(kr[1], kr[2], kr[3]);

  // 20260901
  const packed = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (packed) return pad(packed[1], packed[2], packed[3]);

  const s = raw.replace(/[./]/g,'-').replace(/\s+/g,'');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);       // 2026-9-1, 2026.9.1, 2026/9/1
  if (m) return pad(m[1], m[2], m[3]);
  const m2 = s.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);      // 26-09-01
  if (m2) return pad('20' + m2[1], m2[2], m2[3]);

  return null;   // 9/1/2026 처럼 월·일 순서가 모호한 것은 추측하지 않고 알린다
}

function toProgress(v){
  if (v == null || v === '') return null;
  let n = typeof v === 'number' ? v : parseFloat(txt(v).replace('%',''));
  if (isNaN(n)) return null;
  if (n > 0 && n <= 1 && !Number.isInteger(n)) n *= 100;     // 0.5 를 50% 로
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toStatus(v){
  const s = txt(v);
  if (!s) return null;
  if (LABEL_STATUS[s]) return LABEL_STATUS[s];
  if (STATUS_LABEL[s]) return s;                             // 영문 키도 받아준다
  return undefined;                                          // 잘못된 값
}

/* ==================================================================
   내려받기
   ================================================================== */
export async function buildWorkbook(tasks, project, progressOf){
  // --- 머리글 ---
  const head = COLUMNS.map(c => ({ v: c.head, s: S.HEAD }));

  // --- 본문 ---
  const CENTER = new Set(['level','days','progress','status']);
  const rows = tasks.map(t => COLUMNS.map(c => {
    let v;
    switch (c.key){
      case 'progress': v = progressOf(t); break;
      case 'days':     v = bizDays(t.start, t.end); break;
      case 'status':   v = t.level === 4 ? (STATUS_LABEL[t.status] || '미착수') : ''; break;
      case 'parent':   v = t.parent || ''; break;
      default:         v = t[c.key] ?? '';
    }
    const bold = t.level <= 2;
    const center = CENTER.has(c.key);
    let style;
    if (c.edit) style = bold ? S.EDIT_LB : (center ? S.EDIT_C : S.EDIT_L);
    else        style = bold ? (center ? S.LOCK_CB : S.LOCK_LB) : (center ? S.LOCK_C : S.LOCK_L);
    if (c.key === 'start' || c.key === 'end'){
      // L4 만 직접 입력합니다. 상위 단계는 자식들의 범위로 자동 계산되므로
      // 여기서 고쳐도 반영되지 않습니다. 그래서 회색(고정)으로 칠합니다.
      const editable = t.level === 4;
      const ser = excelSerial(v);
      const st = editable ? S.DATE_EDIT : S.DATE_LOCK;
      return ser ? { v: ser, s: st, t: 'n' } : { v: '', s: st };
    }
    const numeric = (c.key === 'level' || c.key === 'days' || c.key === 'progress');
    return { v, s: style, t: numeric && v !== '' ? 'n' : undefined };
  }));

  // 일수 열(H)을 NETWORKDAYS 수식으로 바꾼다. 계획시작=F, 계획종료=G.
  const iDays = COLUMNS.findIndex(c => c.key === 'days');
  const hRef = `'${HOL_SHEET}'!$A$2:$A$${HOLIDAYS.length + 1}`;
  rows.forEach((cells, i) => {
    const r = i + 2;
    cells[iDays] = {
      ...cells[iDays],
      f: `IFERROR(NETWORKDAYS(F${r},G${r},${hRef}),"")`,
      v: bizDays(tasks[i].start, tasks[i].end)
    };
  });

  const last = tasks.length + 1;
  const wsMain = {
    name: SHEET,
    rows: [head, ...rows],
    opts: {
      cols: COLUMNS.map(c => ({ w: c.width })),
      freeze: 'D2',
      headHeight: 26,
      autoFilter: `A1:J${last}`,
      validations: [
        { type:'list', sqref:`J2:J${last}`, f1:'"미착수,진행중,완료,지연"',
          title:'쓸 수 없는 값', msg:'미착수 / 진행중 / 완료 / 지연 중에서 고르세요.',
          prompt:'목록에서 고르세요.' },
        { type:'whole', operator:'between', sqref:`I2:I${last}`, f1:'0', f2:'100',
          title:'범위를 벗어남', msg:'진척률은 0에서 100 사이 정수입니다.' }
      ]
    }
  };

  // --- 안내 시트 ---
  const T = v => ({ v, s: S.TITLE });
  const H = v => ({ v, s: S.SECTION });
  const L = v => ({ v, s: S.LABEL });
  const P = v => ({ v, s: S.PLAIN });
  const editable = COLUMNS.filter(c => c.edit).map(c => c.head).join(' · ');
  const locked   = COLUMNS.filter(c => !c.edit).map(c => c.head).join(' · ');

  const guide = [
    [T('WBS 수정 양식 — 작성 안내')],
    [],
    [L('프로젝트'), P(`${project.name} (${project.code} ${project.version})`)],
    [L('기간'),     P(`${project.start} ~ ${project.end}`)],
    [L('Task 수'),  P(`${tasks.length}건 (L4 리프 ${tasks.filter(t => t.level === 4).length}건)`)],
    [L('내려받은 시각'), P(new Date().toLocaleString('ko-KR'))],
    [],
    [H('쓰는 법')],
    [P(''), P('1. 노란 칸만 고칩니다. 회색 칸은 고쳐도 무시됩니다.')],
    [P(''), P('2. 앱의 WBS 트리 화면에서 [엑셀 올리기] 로 이 파일을 넣습니다.')],
    [P(''), P('3. 무엇이 바뀌는지 미리보기로 확인한 뒤 반영합니다.')],
    [],
    [H('고칠 수 있는 칸 (노랑)')],
    [P(''), P(editable)],
    [],
    [H('고정 칸 (회색)')],
    [P(''), P(locked)],
    [P(''), P('WBS 는 각 행을 알아보는 열쇠입니다. 절대 바꾸지 마세요.')],
    [],
    [H('규칙')],
    [P(''), P('행 순서를 바꾸거나 정렬해도 됩니다. WBS 코드로 찾아갑니다.')],
    [P(''), P('날짜는 2026-09-01 형식. 엑셀 날짜 서식도 인식합니다.')],
    [P(''), P('진척률은 0~100. 상태는 드롭다운에서 고릅니다.')],
    [P(''), P('L4 Task 의 진척률과 날짜만 넣으세요.')],
    [P(''), P('상위 단계(L1~L3)의 계획시작·계획종료는 자식 Task 들의 범위로 자동 계산됩니다.')],
    [P(''), P('그래서 상위 단계의 날짜 칸은 회색(고정)이고, 고쳐도 반영되지 않습니다.')],
    [P(''), P('일수는 주말과 공휴일을 뺀 영업일입니다. NETWORKDAYS 수식이라 날짜를 고치면 스스로 다시 계산됩니다.')],
    [P(''), P(`공휴일은 [${HOL_SHEET}] 시트에 있습니다. 기간이 늘어나면 거기에 날짜를 더하세요.`)],
    [P(''), P('진척률은 이 엑셀에서만 고칠 수 있습니다. 앱 화면에서는 막대로만 보입니다.')],
    [P(''), P('진척률 100 을 넣으면 상태가 완료로 자동 정리됩니다.')],
    [],
    [H('행을 지우면')],
    [P(''), P('삭제 후보로 표시만 됩니다. 실제 삭제는 미리보기에서 따로 켜야 합니다.')],
    [P(''), P('상위 Task 를 지우면 하위 Task 도 함께 지워집니다.')],
    [],
    [H('행을 더하면')],
    [P(''), P('WBS · 레벨 · 상위 · 작업명 네 칸을 채우면 새 Task 로 추가됩니다.')],
    [P(''), P('상위가 실제로 있는 코드여야 합니다.')],
  ];

  const wsGuide = { name: HELP_SHEET, rows: guide,
    opts: { cols:[{ w:20 }, { w:78 }], landscape: true } };

  // --- 공휴일 시트 ---
  // 일수 수식이 이 범위를 참조합니다. 여기서 날짜를 고치면 일수가 다시 계산됩니다.
  const wsHol = {
    name: HOL_SHEET,
    rows: [
      [{ v:'날짜', s:S.HEAD }, { v:'공휴일명', s:S.HEAD }, { v:'비고', s:S.HEAD }],
      ...HOLIDAYS.map(h => [
        { v: excelSerial(h.date), s: S.DATE_PLAIN, t:'n' },
        { v: h.name, s: S.PLAIN },
        { v: (() => { const d = new Date(h.date + 'T00:00:00').getDay();
              return (d === 0 || d === 6) ? '주말과 겹침 (일수에 영향 없음)' : ''; })(), s: S.PLAIN }
      ]),
      [],
      [{ v:'일수 열의 NETWORKDAYS 수식이 A열을 참조합니다.', s:S.PLAIN }],
      [{ v:'기간이 늘어나면 이 시트에 날짜를 더하고, 앱의 holidays.js 에도 같이 넣으세요.', s:S.PLAIN }],
    ],
    opts: { cols:[{ w:14 }, { w:22 }, { w:34 }], landscape: false }
  };

  return writeXlsx([wsMain, wsGuide, wsHol]);
}

export function downloadWorkbook(bytes, filename){
  const url = URL.createObjectURL(new Blob([bytes],
    { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = Object.assign(document.createElement('a'), { href:url, download:filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ==================================================================
   올리기 — 파일을 읽어 현재 상태와 비교한 결과를 돌려준다.
   실제 반영은 사용자가 미리보기에서 확인한 뒤에만 한다.
   ================================================================== */
export async function readWorkbook(file){
  const buf = await file.arrayBuffer();
  // cellDates:false 가 핵심입니다.
  // SheetJS 는 일련번호를 날짜로 바꿀 때 1899-12-30 시점의 지역 시차를 씁니다.
  // 한국은 1899년 표준시가 UTC+8:27 이라 오늘(UTC+9:00)과 33분이 어긋나고,
  // 그 33분 때문에 자정 직전으로 떨어져 날짜가 하루 밀립니다.
  // 그래서 변환을 맡기지 않고 숫자 그대로 받아 아래 toDate() 에서 UTC 로 계산합니다.
  const wb = XLSX.read(buf, { type:'array', cellDates:false });
  const name = wb.SheetNames.includes(SHEET) ? SHEET : wb.SheetNames[0];
  if (!name) throw new Error('시트를 찾을 수 없습니다.');
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval:'', raw:true, cellDates:false });
  if (!rows.length) throw new Error(`'${name}' 시트에 데이터가 없습니다.`);
  if (!(COLUMNS[0].head in rows[0]))
    throw new Error(`머리글에 '${COLUMNS[0].head}' 열이 없습니다. 앱에서 내려받은 양식을 쓰세요.`);
  return { rows, sheetName: name };
}

export function diff(rows, tasks){
  const byCode = new Map(tasks.map(t => [t.code, t]));
  const seen = new Set();
  const updates = [];      // { code, name, changes:[{field,label,from,to}] }
  const adds = [];
  const problems = [];     // { row, code, msg }
  const ignored = [];      // 상위 단계 날짜처럼 자동 계산이라 반영하지 않은 것

  rows.forEach((r, i) => {
    const line = i + 2;    // 머리글이 1행
    const code = txt(r[COLUMNS[0].head]);
    if (!code) return;     // 빈 행은 조용히 넘긴다
    if (seen.has(code)){ problems.push({ row:line, code, msg:'WBS 코드가 중복됩니다.' }); return; }
    seen.add(code);

    const cur = byCode.get(code);

    // --- 새 Task ---
    if (!cur){
      const lv = parseInt(txt(r['레벨']), 10);
      const nm = txt(r['작업명']);
      if (!nm){ problems.push({ row:line, code, msg:'새 Task 인데 작업명이 비어 있습니다.' }); return; }
      if (!(lv >= 1 && lv <= 4)){ problems.push({ row:line, code, msg:'새 Task 는 레벨(1~4)이 필요합니다.' }); return; }
      const parent = txt(r['상위']) || (code.includes('.') ? code.replace(/\.[^.]+$/,'') : '');
      if (lv > 1 && !byCode.has(parent) && !rows.some(x => txt(x[COLUMNS[0].head]) === parent)){
        problems.push({ row:line, code, msg:`상위 '${parent}' 를 찾을 수 없습니다.` }); return;
      }
      adds.push({
        code, level:lv, parent, name:nm,
        deliverable: '', owner: txt(r['담당자']),
        start: toDate(r['계획시작']) || '', end: toDate(r['계획종료']) || '',
        days: 0,   // 아래에서 날짜로부터 계산
        progress: toProgress(r['진척률']) ?? 0,
        status: toStatus(r['상태']) || 'not_started',
        dateSource: 'file', note: ''
      });
      adds[adds.length - 1].days = bizDays(adds[adds.length - 1].start, adds[adds.length - 1].end);
      return;
    }

    // --- 기존 Task 변경분 ---
    const changes = [];
    // raw 는 실제로 저장할 값. 화면에는 from/to 를 보여준다.
    const push = (field, label, from, to, raw) => {
      if (String(from ?? '') !== String(to ?? ''))
        changes.push({ field, label, from, to, raw: raw !== undefined ? raw : to });
    };

    push('name',        '작업명', cur.name,        txt(r['작업명']) || cur.name);
    push('owner',       '담당자', cur.owner || '', txt(r['담당자']));

    for (const [key, head] of [['start','계획시작'], ['end','계획종료']]){
      const d = toDate(r[head]);
      if (d === null){
        problems.push({ row:line, code,
          msg:`${head} '${txt(r[head])}' 를 날짜로 읽을 수 없습니다. 셀 서식을 '날짜' 로 바꾸거나 2026-09-01 형식으로 적어 주세요.` });
        continue;
      }
      if (!d || d === cur[key]) continue;
      if (cur.level !== 4){
        // 상위 단계 날짜는 자식에서 자동 계산됩니다. 말없이 버리지 않고 알려줍니다.
        ignored.push({ row:line, code, name:cur.name, head, from:cur[key], to:d });
        continue;
      }
      push(key, head, cur[key], d);
    }

    if (cur.level === 4){
      const p = toProgress(r['진척률']);
      if (p === null && txt(r['진척률'])) problems.push({ row:line, code, msg:`진척률 '${txt(r['진척률'])}' 이 숫자가 아닙니다.` });
      else if (p !== null) push('progress', '진척률', cur.progress, p);

      const st = toStatus(r['상태']);
      if (st === undefined) problems.push({ row:line, code, msg:`상태 '${txt(r['상태'])}' 는 쓸 수 없는 값입니다.` });
      else if (st) push('status', '상태', STATUS_LABEL[cur.status], STATUS_LABEL[st], st);
    }

    if (changes.length) updates.push({ code, name: cur.name, changes });
  });

  const removes = tasks.filter(t => !seen.has(t.code));
  return { updates, adds, removes, problems, ignored, matched: seen.size };
}
