/* ==================================================================
   excel.js — WBS 엑셀 왕복 (내려받기 → 수정 → 업로드)
   SheetJS 는 index.html 에서 전역(XLSX)으로 먼저 읽힙니다.
   ================================================================== */

import { writeXlsx, S } from './xlsx-writer.js';

export const SHEET = 'WBS';
export const HELP_SHEET = '작성안내';

/* 열 정의. key 는 내부 필드, head 는 엑셀 머리글.
   edit=false 인 열은 읽기 전용이며, 바꿔도 무시합니다. */
export const COLUMNS = [
  { key:'code',        head:'WBS',      width:14, edit:false },
  { key:'level',       head:'레벨',      width:6,  edit:false },
  { key:'parent',      head:'상위',      width:12, edit:false },
  { key:'name',        head:'작업명',    width:44, edit:true  },
  { key:'deliverable', head:'산출물',    width:22, edit:true  },
  { key:'owner',       head:'담당자',    width:12, edit:true  },
  { key:'start',       head:'계획시작',  width:12, edit:true  },
  { key:'end',         head:'계획종료',  width:12, edit:true  },
  { key:'days',        head:'일수',      width:7,  edit:false },
  { key:'progress',    head:'진척률',    width:8,  edit:true  },
  { key:'status',      head:'상태',      width:10, edit:true  },
];

const STATUS_LABEL = { not_started:'미착수', in_progress:'진행중', done:'완료', blocked:'지연' };
const LABEL_STATUS = Object.fromEntries(Object.entries(STATUS_LABEL).map(([k,v]) => [v,k]));

/* ---------- 값 정리 ---------- */
const txt = v => String(v ?? '').trim();

/* 엑셀은 날짜를 1900 기준 일련번호로 줄 수도, 문자열로 줄 수도 있습니다. */
function toDate(v){
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)){
    const p = n => String(n).padStart(2,'0');
    return `${v.getFullYear()}-${p(v.getMonth()+1)}-${p(v.getDate())}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000){
    const d = new Date(Date.UTC(1899,11,30) + v * 864e5);
    return d.toISOString().slice(0,10);
  }
  const s = txt(v).replace(/[./]/g,'-').replace(/\s+/g,'');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const m2 = s.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);      // 26-09-01 형태도 받아준다
  if (m2) return `20${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
  return null;                                              // 해석 실패
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
      case 'status':   v = t.level === 4 ? (STATUS_LABEL[t.status] || '미착수') : ''; break;
      case 'parent':   v = t.parent || ''; break;
      default:         v = t[c.key] ?? '';
    }
    const bold = t.level <= 2;
    const center = CENTER.has(c.key);
    let style;
    if (c.edit) style = bold ? S.EDIT_LB : (center ? S.EDIT_C : S.EDIT_L);
    else        style = bold ? (center ? S.LOCK_CB : S.LOCK_LB) : (center ? S.LOCK_C : S.LOCK_L);
    const numeric = (c.key === 'level' || c.key === 'days' || c.key === 'progress');
    return { v, s: style, t: numeric && v !== '' ? 'n' : undefined };
  }));

  const last = tasks.length + 1;
  const wsMain = {
    name: SHEET,
    rows: [head, ...rows],
    opts: {
      cols: COLUMNS.map(c => ({ w: c.width })),
      freeze: 'D2',
      headHeight: 26,
      autoFilter: `A1:K${last}`,
      validations: [
        { type:'list', sqref:`K2:K${last}`, f1:'"미착수,진행중,완료,지연"',
          title:'쓸 수 없는 값', msg:'미착수 / 진행중 / 완료 / 지연 중에서 고르세요.',
          prompt:'목록에서 고르세요.' },
        { type:'whole', operator:'between', sqref:`J2:J${last}`, f1:'0', f2:'100',
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
    [P(''), P('L4 Task 의 진척률만 넣으세요. 상위 단계는 자동 계산됩니다.')],
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

  return writeXlsx([wsMain, wsGuide]);
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
  const wb = XLSX.read(buf, { type:'array', cellDates:true });
  const name = wb.SheetNames.includes(SHEET) ? SHEET : wb.SheetNames[0];
  if (!name) throw new Error('시트를 찾을 수 없습니다.');
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval:'', raw:false, cellDates:true });
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
        deliverable: txt(r['산출물']), owner: txt(r['담당자']),
        start: toDate(r['계획시작']) || '', end: toDate(r['계획종료']) || '',
        days: parseInt(txt(r['일수']), 10) || 0,
        progress: toProgress(r['진척률']) ?? 0,
        status: toStatus(r['상태']) || 'not_started',
        dateSource: 'file', note: ''
      });
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
    push('deliverable', '산출물', cur.deliverable, txt(r['산출물']));
    push('owner',       '담당자', cur.owner || '', txt(r['담당자']));

    for (const [key, head] of [['start','계획시작'], ['end','계획종료']]){
      const d = toDate(r[head]);
      if (d === null){ problems.push({ row:line, code, msg:`${head} '${txt(r[head])}' 를 날짜로 읽을 수 없습니다.` }); continue; }
      if (d) push(key, head, cur[key], d);
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
  return { updates, adds, removes, problems, matched: seen.size };
}
