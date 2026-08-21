/* ==================================================================
   excel.js — WBS 엑셀 왕복 (내려받기 → 수정 → 업로드)
   SheetJS 는 index.html 에서 전역(XLSX)으로 먼저 읽힙니다.
   ================================================================== */

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
export function buildWorkbook(tasks, project, progressOf){
  const rows = tasks.map(t => {
    const o = {};
    for (const c of COLUMNS){
      let v;
      switch (c.key){
        case 'progress': v = progressOf(t); break;
        case 'status':   v = t.level === 4 ? (STATUS_LABEL[t.status] || '미착수') : ''; break;
        case 'parent':   v = t.parent || ''; break;
        default:         v = t[c.key] ?? '';
      }
      o[c.head] = v;
    }
    return o;
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS.map(c => c.head) });
  ws['!cols'] = COLUMNS.map(c => ({ wch: c.width }));
  ws['!freeze'] = { xSplit:'0', ySplit:'1' };
  ws['!autofilter'] = { ref: `A1:K${rows.length + 1}` };

  const help = [
    ['WBS 수정 양식 — 작성 안내'],
    [],
    ['프로젝트', `${project.name} (${project.code} ${project.version})`],
    ['기간', `${project.start} ~ ${project.end}`],
    ['내려받은 시각', new Date().toLocaleString('ko-KR')],
    ['Task 수', String(tasks.length)],
    [],
    ['1. 이 파일을 고친 뒤 앱의 [엑셀 올리기] 로 다시 넣으면 반영됩니다.'],
    ['2. 반영 전에 무엇이 바뀌는지 미리보기로 확인할 수 있습니다.'],
    [],
    ['고칠 수 있는 열'],
    ...COLUMNS.filter(c => c.edit).map(c => ['', c.head]),
    [],
    ['고쳐도 무시되는 열 (구조 유지용)'],
    ...COLUMNS.filter(c => !c.edit).map(c => ['', c.head]),
    [],
    ['작성 규칙'],
    ['', 'WBS 열은 각 행을 식별하는 열쇠입니다. 절대 바꾸지 마세요.'],
    ['', '행 순서를 바꾸거나 정렬해도 괜찮습니다. WBS 코드로 찾아갑니다.'],
    ['', '날짜는 2026-09-01 형식으로 씁니다. 엑셀 날짜 서식도 인식합니다.'],
    ['', '진척률은 0~100 사이 숫자입니다.'],
    ['', `상태는 ${Object.values(STATUS_LABEL).join(' / ')} 중 하나입니다.`],
    ['', 'L4(맨 아래) Task 의 진척률만 입력하세요. 상위 단계는 자동 계산됩니다.'],
    ['', '행을 지우면 삭제 후보로 표시되고, 반영 여부는 미리보기에서 고릅니다.'],
    ['', '새 행을 추가하려면 WBS, 레벨, 상위, 작업명을 채우세요.'],
  ];
  const wsHelp = XLSX.utils.aoa_to_sheet(help);
  wsHelp['!cols'] = [{ wch:22 }, { wch:64 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET);
  XLSX.utils.book_append_sheet(wb, wsHelp, HELP_SHEET);
  return wb;
}

export function downloadWorkbook(wb, filename){
  const buf = XLSX.write(wb, { type:'array', bookType:'xlsx' });
  const url = URL.createObjectURL(new Blob([buf],
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
