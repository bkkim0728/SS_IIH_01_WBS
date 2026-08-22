/* ==================================================================
   xlsx-writer.js — 서식이 들어간 xlsx 를 브라우저에서 직접 만든다.

   SheetJS 커뮤니티 버전은 셀 채우기·글꼴·테두리를 쓰지 못합니다.
   읽기는 SheetJS 에 맡기고, 쓰기는 여기서 합니다.
   xlsx 는 XML 몇 장을 zip 으로 묶은 것이라 직접 만드는 편이 확실합니다.
   ================================================================== */

/* ---------- zip ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++){
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflateRaw(bytes){
  if (typeof CompressionStream === 'undefined') return null;   // 없으면 무압축으로
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (_) { return null; }
}

const enc = new TextEncoder();

/* files: [{ name, text }] */
export async function makeZip(files){
  const parts = [], central = [];
  let offset = 0;

  for (const f of files){
    const raw = enc.encode(f.text);
    const packed = await deflateRaw(raw);
    const useDeflate = packed && packed.length < raw.length;
    const data = useDeflate ? packed : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const name = enc.encode(f.name);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0, true);           // flags
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true);          // time
    lv.setUint16(12, 0x2100, true);     // date (2000-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    parts.push(local, data);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x2100, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);

    offset += local.length + data.length;
  }

  const cenSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, end];
  const total = all.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of all){ out.set(p, at); at += p.length; }
  return out;
}

/* ---------- XML ---------- */
export const xmlEsc = s => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');          // 엑셀이 거부하는 제어문자

export function colLetter(n){
  let s = '';
  while (n > 0){ const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

/* ---------- 서식표 ----------
   S.* 는 cellXfs 의 인덱스입니다. 아래 STYLES 의 순서와 반드시 맞아야 합니다. */
export const S = {
  DEFAULT: 0,
  HEAD: 1,
  EDIT_L: 2, EDIT_C: 3,
  LOCK_L: 4, LOCK_C: 5,
  EDIT_LB: 6, LOCK_LB: 7, LOCK_CB: 8,
  TITLE: 9, SECTION: 10, PLAIN: 11, LABEL: 12,
  DATE_EDIT: 13, DATE_PLAIN: 14
};

const INK   = 'FF1B2233';
const GREY  = 'FF6B6F80';
const HEADBG= 'FF2A3550';
const EDITBG= 'FFFFF8DC';   // 고칠 칸 — 노랑
const LOCKBG= 'FFEFF1F5';   // 고정 칸 — 회색
const RULE  = 'FFC9CFDB';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\-mm\-dd"/></numFmts>
<fonts count="6">
  <font><sz val="9.5"/><color rgb="${INK}"/><name val="맑은 고딕"/></font>
  <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>
  <font><sz val="9.5"/><color rgb="${GREY}"/><name val="맑은 고딕"/></font>
  <font><b/><sz val="9.5"/><color rgb="${INK}"/><name val="맑은 고딕"/></font>
  <font><b/><sz val="13"/><color rgb="${INK}"/><name val="맑은 고딕"/></font>
  <font><b/><sz val="10"/><color rgb="FF2A3550"/><name val="맑은 고딕"/></font>
</fonts>
<fills count="5">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="${HEADBG}"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="${EDITBG}"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="${LOCKBG}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
  <border><left/><right/><top/><bottom/><diagonal/></border>
  <border>
    <left style="thin"><color rgb="${RULE}"/></left>
    <right style="thin"><color rgb="${RULE}"/></right>
    <top style="thin"><color rgb="${RULE}"/></top>
    <bottom style="thin"><color rgb="${RULE}"/></bottom>
    <diagonal/>
  </border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment horizontal="left" vertical="center"/><protection locked="0"/></xf>
  <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment horizontal="center" vertical="center"/><protection locked="0"/></xf>
  <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
  <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment horizontal="left" vertical="center"/><protection locked="0"/></xf>
  <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
  <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment horizontal="center" vertical="center"/><protection locked="0"/></xf>
  <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/* ---------- 시트 ----------
   rows: [[{ v, s, t, f }, ...], ...]  v=값, s=서식인덱스, t='n' 숫자, f=수식
   opts: { cols:[{w}], freeze:'D2', autoFilter:'A1:K152', validations:[...] } */
function sheetXml(rows, opts = {}){
  const maxCol = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const dim = `A1:${colLetter(maxCol)}${Math.max(rows.length, 1)}`;

  let views = '<sheetViews><sheetView workbookViewId="0" tabSelected="1">';
  if (opts.freeze){
    const m = opts.freeze.match(/^([A-Z]+)(\d+)$/);
    const x = m[1].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const y = parseInt(m[2], 10) - 1;
    views += `<pane xSplit="${x}" ySplit="${y}" topLeftCell="${opts.freeze}" activePane="bottomRight" state="frozen"/>`
           + `<selection pane="bottomRight" activeCell="${opts.freeze}" sqref="${opts.freeze}"/>`;
  }
  views += '</sheetView></sheetViews>';

  const cols = opts.cols?.length
    ? `<cols>${opts.cols.map((c, i) =>
        `<col min="${i+1}" max="${i+1}" width="${c.w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const body = rows.map((cells, ri) => {
    const r = ri + 1;
    const cs = cells.map((c, ci) => {
      if (c == null) return '';
      const ref = `${colLetter(ci+1)}${r}`;
      const st = c.s ? ` s="${c.s}"` : '';
      // f 가 있으면 수식 셀. v 는 캐시된 계산값으로 함께 넣는다.
      if (c.f) return `<c r="${ref}"${st}><f>${xmlEsc(c.f)}</f>`
        + (c.v === '' || c.v == null ? '' : `<v>${c.v}</v>`) + `</c>`;
      if (c.v === '' || c.v == null) return `<c r="${ref}"${st}/>`;
      if (c.t === 'n') return `<c r="${ref}"${st}><v>${c.v}</v></c>`;
      return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
    }).join('');
    const h = ri === 0 && opts.headHeight ? ` ht="${opts.headHeight}" customHeight="1"` : '';
    return `<row r="${r}"${h}>${cs}</row>`;
  }).join('');

  const af = opts.autoFilter ? `<autoFilter ref="${opts.autoFilter}"/>` : '';

  const dv = opts.validations?.length
    ? `<dataValidations count="${opts.validations.length}">${opts.validations.map(v => {
        const head = `type="${v.type}"${v.operator ? ` operator="${v.operator}"` : ''}`
          + ` allowBlank="1" showInputMessage="1" showErrorMessage="1"`
          + ` errorTitle="${xmlEsc(v.title)}" error="${xmlEsc(v.msg)}"`
          + (v.prompt ? ` promptTitle="${xmlEsc(v.title)}" prompt="${xmlEsc(v.prompt)}"` : '')
          + ` sqref="${v.sqref}"`;
        return `<dataValidation ${head}><formula1>${xmlEsc(v.f1)}</formula1>`
             + (v.f2 != null ? `<formula2>${xmlEsc(v.f2)}</formula2>` : '')
             + `</dataValidation>`;
      }).join('')}</dataValidations>`
    : '';

  // 인쇄할 때 열이 여러 장으로 쪼개지지 않도록 가로·폭맞춤을 켠다
  const fit = opts.fitWidth !== false;
  const sheetPr = fit ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '';
  const setup = `<pageSetup paperSize="9" orientation="${opts.landscape === false ? 'portrait' : 'landscape'}"`
    + (fit ? ' fitToWidth="1" fitToHeight="0"' : '') + '/>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${sheetPr}<dimension ref="${dim}"/>${views}
<sheetFormatPr defaultRowHeight="16.5"/>${cols}
<sheetData>${body}</sheetData>${af}${dv}
<pageMargins left="0.4" right="0.4" top="0.55" bottom="0.55" header="0.3" footer="0.3"/>
${setup}
</worksheet>`;
}

/* ---------- 통합문서 ---------- */
export async function writeXlsx(sheets){
  const files = [
    { name:'[Content_Types].xml', text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },
    { name:'_rels/.rels', text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
    { name:'xl/workbook.xml', text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) =>
  `<sheet name="${xmlEsc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>
</workbook>` },
    { name:'xl/_rels/workbook.xml.rels', text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) =>
  `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { name:'xl/styles.xml', text: STYLES },
    ...sheets.map((s, i) => ({ name:`xl/worksheets/sheet${i+1}.xml`, text: sheetXml(s.rows, s.opts) }))
  ];
  return makeZip(files);
}
