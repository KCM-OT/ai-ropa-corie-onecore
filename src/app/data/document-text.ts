// Plain text from an attached document, for the assistant to draft from.
// Reads .txt (and .md / .csv), .docx, .doc (Word 97–2003), .rtf and .pdf in the
// browser; nothing is uploaded. The PDF and .doc readers are loaded on first
// use so they don't weigh on the first page load.
// Text only: images, scanned pages and embedded objects are skipped.

/** What the Attach button offers. */
export const DOCUMENT_ACCEPT =
  '.docx,.doc,.pdf,.txt,.rtf,.md,.csv,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/msword,application/pdf,application/rtf,text/rtf,text/plain';

/** Per-file cap for the composer (bytes). */
export const DOCUMENT_MAX_SIZE = 10_000_000;

export interface DocumentText {
  name: string;
  text: string;
  /** "3 pages", "1,240 words": what was read, for the assistant's reply. */
  summary: string;
}

export type ReadResult = { ok: true; doc: DocumentText } | { ok: false; name: string; reason: string };

/** The prompt the start screen fills in when a document is attached to an empty composer. */
export function attachPrompt(fileName: string): string {
  return `Create a RoPA record from ${fileName}.`;
}

/** Whether a prompt is only the one `attachPrompt` wrote, so it isn't read as part of the description. */
export function isAttachPrompt(prompt: string, fileNames: string[]): boolean {
  return fileNames.some((n) => prompt.trim() === attachPrompt(n));
}

type Kind = 'text' | 'docx' | 'doc' | 'rtf' | 'pdf';

function kindOf(file: File): Kind | undefined {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc';
  if (ext === 'rtf') return 'rtf';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'txt' || ext === 'md' || ext === 'csv') return 'text';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.includes('rtf')) return 'rtf';
  if (file.type.startsWith('text/')) return 'text';
  return undefined;
}

export async function readDocument(file: File): Promise<ReadResult> {
  const kind = kindOf(file);
  const fail = (reason: string): ReadResult => ({ ok: false, name: file.name, reason });
  if (!kind) return fail("it isn't a format I can read (Word .docx or .doc, PDF, RTF or plain text)");
  try {
    let text: string;
    let pages: number | undefined;
    switch (kind) {
      case 'text':
        text = await file.text();
        break;
      case 'docx':
        text = await docxText(await file.arrayBuffer());
        break;
      case 'doc':
        text = await docText(await file.arrayBuffer());
        break;
      case 'rtf':
        text = rtfText(await file.text());
        break;
      case 'pdf':
        ({ text, pages } = await pdfText(await file.arrayBuffer()));
        break;
    }
    text = tidy(text);
    if (!text) {
      return fail(
        kind === 'pdf'
          ? 'it has no text layer (it may be a scanned image)'
          : "I couldn't find any text in it",
      );
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    const summary = [
      pages ? `${pages.toLocaleString()} ${pages === 1 ? 'page' : 'pages'}` : '',
      `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`,
    ]
      .filter(Boolean)
      .join(', ');
    return { ok: true, doc: { name: file.name, text, summary } };
  } catch (e) {
    return fail(e instanceof DocumentError ? e.message : 'it looks damaged or in an unexpected format');
  }
}

class DocumentError extends Error {}

/** Normalise line endings and spacing; keep paragraphs one per line. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---- .docx: a zip of XML; the body is word/document.xml -----------------------

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function docxText(buffer: ArrayBuffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(buffer), { filter: (f) => f.name === 'word/document.xml' });
  const xml = files['word/document.xml'];
  if (!xml) throw new DocumentError("it isn't a Word document (word/document.xml is missing)");
  const dom = new DOMParser().parseFromString(strFromU8(xml), 'application/xml');
  const body = dom.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new DocumentError("its Word body couldn't be read");
  return blockText(body);
}

/** Paragraphs one per line; a table row as "cell: cell" so labelled forms read as "Label: value". */
function blockText(el: Element): string {
  const lines: string[] = [];
  for (const child of Array.from(el.children)) {
    if (child.namespaceURI !== W) continue;
    if (child.localName === 'p') lines.push(runText(child));
    else if (child.localName === 'tbl') {
      for (const row of Array.from(child.getElementsByTagNameNS(W, 'tr'))) {
        const cells = Array.from(row.children)
          .filter((c) => c.namespaceURI === W && c.localName === 'tc')
          .map((c) => blockText(c).replace(/\n+/g, '; ').trim())
          .filter(Boolean);
        if (cells.length) lines.push(cells.join(cells.length === 2 ? ': ' : ' | '));
      }
    } else if (child.localName === 'sdt' || child.localName === 'sdtContent' || child.localName === 'customXml') {
      lines.push(blockText(child));
    }
  }
  return lines.join('\n');
}

function runText(p: Element): string {
  let out = '';
  const walk = (node: Element) => {
    for (const c of Array.from(node.children)) {
      if (c.namespaceURI !== W) continue;
      switch (c.localName) {
        case 't':
          out += c.textContent ?? '';
          break;
        case 'tab':
          out += '\t';
          break;
        case 'br':
        case 'cr':
          out += '\n';
          break;
        case 'noBreakHyphen':
          out += '-';
          break;
        case 'delText':
        case 'instrText':
          break; // tracked deletions and field codes aren't document text
        default:
          walk(c);
      }
    }
  };
  walk(p);
  return out;
}

// ---- .doc: Word 97–2003, a compound file; text is found through the piece table

async function docText(buffer: ArrayBuffer): Promise<string> {
  const CFB = await import('cfb');
  const cfb = CFB.read(new Uint8Array(buffer), { type: 'array' });
  const stream = (name: string) => {
    const entry = CFB.find(cfb, name);
    return entry?.content ? Uint8Array.from(entry.content as ArrayLike<number>) : undefined;
  };
  const word = stream('WordDocument');
  if (!word) throw new DocumentError("it isn't a Word 97–2003 document");
  const wv = new DataView(word.buffer);
  if (wv.getUint16(0, true) !== 0xa5ec) throw new DocumentError("it isn't a Word 97–2003 document");
  const flags = wv.getUint16(0x0a, true);
  if (flags & 0x0100) throw new DocumentError("it's password-protected");
  const table = stream(flags & 0x0200 ? '1Table' : '0Table');
  if (!table) throw new DocumentError("its text table couldn't be found");

  // FIB: fibBase (32 bytes), then the 16-bit, 32-bit and fc/lcb arrays.
  let at = 32;
  const csw = wv.getUint16(at, true);
  at += 2 + csw * 2;
  const cslw = wv.getUint16(at, true);
  const rgLw = at + 2;
  at = rgLw + cslw * 4 + 2;
  const ccpText = wv.getInt32(rgLw + 3 * 4, true); // main document length, in characters
  const fcClx = wv.getUint32(at + 66 * 4, true);
  const lcbClx = wv.getUint32(at + 66 * 4 + 4, true);

  // Clx: skip Prc entries (0x01), then the piece table (0x02).
  const tv = new DataView(table.buffer);
  let p = fcClx;
  while (p < fcClx + lcbClx && table[p] === 0x01) p += 3 + tv.getUint16(p + 1, true);
  if (table[p] !== 0x02) throw new DocumentError("its text table couldn't be read");
  const lcb = tv.getUint32(p + 1, true);
  const plc = p + 5;
  const n = (lcb - 4) / 12;
  const cp1252 = new TextDecoder('windows-1252');
  const utf16 = new TextDecoder('utf-16le');
  let text = '';
  for (let i = 0; i < n; i++) {
    const cpStart = tv.getUint32(plc + i * 4, true);
    if (cpStart >= ccpText) break;
    const cpEnd = Math.min(tv.getUint32(plc + (i + 1) * 4, true), ccpText);
    const pcd = plc + (n + 1) * 4 + i * 8;
    const fc = tv.getUint32(pcd + 2, true);
    const chars = cpEnd - cpStart;
    if (fc & 0x40000000) {
      const start = (fc & 0x3fffffff) / 2;
      text += cp1252.decode(word.subarray(start, start + chars));
    } else {
      text += utf16.decode(word.subarray(fc, fc + chars * 2));
    }
  }
  return wordControls(text);
}

/** Word's in-text control characters: keep field results, drop field codes. */
function wordControls(text: string): string {
  let out = '';
  const fields: ('code' | 'result')[] = [];
  for (const ch of text) {
    if (ch === '\u0013') fields.push('code');
    else if (ch === '\u0014') fields[fields.length - 1] = 'result';
    else if (ch === '\u0015') fields.pop();
    else if (fields.includes('code')) continue;
    else if (ch === '\r' || ch === '\u000b' || ch === '\u000c') out += '\n';
    else if (ch === '\u0007') out += '\t'; // table cell or row end
    else out += ch;
  }
  return out;
}

// ---- .rtf ----------------------------------------------------------------------

/** Groups that hold formatting, metadata or pictures rather than text. */
const RTF_SKIP = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'fldinst', 'themedata',
  'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable',
  'listoverridetable', 'rsidtbl', 'generator', 'filetbl', 'revtbl', 'header', 'headerl',
  'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'listtext', 'pntext',
  'pntxta', 'pntxtb', 'mmathPr', 'wgrffmtfilter', 'shppict', 'nonshppict',
]);

const RTF_SYMBOLS: Record<string, string> = {
  par: '\n', line: '\n', sect: '\n', page: '\n', row: '\n', cell: '\t', tab: '\t',
  emdash: '—', endash: '–', bullet: '•', lquote: '‘', rquote: '’',
  ldblquote: '“', rdblquote: '”', emspace: ' ', enspace: ' ', qmspace: ' ',
};

export function rtfText(rtf: string): string {
  if (!rtf.trimStart().startsWith('{\\rtf')) throw new DocumentError("it isn't an RTF document");
  const cp1252 = new TextDecoder('windows-1252');
  const stack: { skip: boolean; uc: number }[] = [];
  let skip = false;
  let uc = 1; // fallback characters after each \u
  let pending = 0; // fallback characters still to drop
  let out = '';
  const emit = (s: string) => {
    if (!skip) out += s;
  };
  let i = 0;
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === '{') {
      stack.push({ skip, uc });
      i++;
    } else if (c === '}') {
      ({ skip, uc } = stack.pop() ?? { skip, uc });
      pending = 0;
      i++;
    } else if (c === '\\') {
      const next = rtf[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        if (pending > 0) pending--;
        else emit(next);
        i += 2;
      } else if (next === "'") {
        if (pending > 0) pending--;
        else emit(cp1252.decode(new Uint8Array([parseInt(rtf.substr(i + 2, 2), 16) || 32])));
        i += 4;
      } else if (next === '*') {
        skip = true; // ignorable destination
        i += 2;
      } else if (next === '~') {
        emit(' ');
        i += 2;
      } else if (next === '\n' || next === '\r') {
        emit('\n');
        i += 2;
      } else {
        const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 48));
        if (!m) {
          i += 2;
          continue;
        }
        i += 1 + m[0].length;
        const [, word, param] = m;
        if (RTF_SKIP.has(word)) skip = true;
        else if (word === 'uc') uc = Number(param ?? 1);
        else if (word === 'u') {
          const code = Number(param);
          emit(String.fromCharCode(code < 0 ? code + 65536 : code));
          pending = uc;
        } else if (word in RTF_SYMBOLS) emit(RTF_SYMBOLS[word]);
      }
    } else if (c === '\r' || c === '\n') {
      i++;
    } else {
      if (pending > 0) pending--;
      else emit(c);
      i++;
    }
  }
  return out;
}

// ---- .pdf: pdf.js, with its worker copied to /pdfjs/ (angular.json assets) -----

async function pdfText(buffer: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (e) {
    if ((e as { name?: string })?.name === 'PasswordException') {
      throw new DocumentError("it's password-protected");
    }
    throw e;
  }
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const lines: PdfLine[] = [];
    let line: PdfLine | undefined;
    let breakNext = true;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const [, , , h, x, y] = item.transform as number[];
      const size = Math.abs(h) || item.height || 10;
      if (!line || breakNext || Math.abs(y - line.y) > size / 2) {
        line = { items: [], cells: [], y, size };
        lines.push(line);
      }
      if (item.str.trim()) line.items.push({ str: item.str, x, end: x + item.width });
      breakNext = item.hasEOL;
    }
    const text = lines.filter((l) => l.items.length);
    // In fixed-width text every word lines up, so columns can't be told from alignment.
    const mono = Object.values(content.styles).every((st) => /mono|courier/i.test(st.fontFamily));
    splitColumns(text, !mono);
    pages.push(reflow(text));
  }
  const count = pdf.numPages;
  await pdf.destroy();
  return { text: pages.join('\n\n'), pages: count };
}

interface PdfLine {
  /** Its text runs, without the whitespace-only ones. */
  items: { str: string; x: number; end: number }[];
  /** The text, one entry per table cell (one entry for ordinary text). */
  cells: string[];
  /** Baseline, from the bottom of the page. */
  y: number;
  /** Font size. */
  size: number;
}

/**
 * Find table columns. A run starts a new cell after a wide gap, or where
 * neighbouring short lines all break at the same x after a short label
 * ("Retention   2 years…" above "Legal basis   Legitimate interests").
 * Full-width prose lines are left alone so word starts that happen to line
 * up aren't read as a column.
 */
function splitColumns(lines: PdfLine[], byAlignment: boolean): void {
  const right = Math.max(0, ...lines.flatMap((l) => l.items.map((i) => i.end)));
  const textOf = (l: PdfLine, from: number, to: number) => {
    let out = '';
    for (let k = from; k < to; k++) {
      const gap = k > from ? l.items[k].x - l.items[k - 1].end : 0;
      out += (gap > l.size * 0.15 && !/\s$/.test(out) ? ' ' : '') + l.items[k].str;
    }
    return out.trim();
  };
  // Candidate column starts for each line: x positions after a short label.
  const candidates = lines.map((l) => {
    const xs = new Set<number>();
    if (!byAlignment || l.items.length < 2 || l.items[l.items.length - 1].end > right * 0.85) return xs;
    l.items.forEach((it, k) => {
      if (k === 0 || it.x - l.items[k - 1].end < l.size * 0.2) return;
      if (textOf(l, 0, k).split(/\s+/).length <= 6) xs.add(Math.round(it.x));
    });
    return xs;
  });
  const shared = (i: number, x: number) =>
    [i - 1, i + 1].some((j) => [...(candidates[j] ?? [])].some((c) => Math.abs(c - x) <= 2));
  lines.forEach((l, i) => {
    const cuts: number[] = [0];
    l.items.forEach((it, k) => {
      if (k === 0) return;
      const gap = it.x - l.items[k - 1].end;
      const x = Math.round(it.x);
      if (gap > l.size * 1.5 || (candidates[i].has(x) && shared(i, x))) cuts.push(k);
    });
    cuts.push(l.items.length);
    l.cells = cuts.slice(0, -1).map((c, k) => textOf(l, c, cuts[k + 1])).filter(Boolean);
  });
}

/**
 * Put wrapped lines back into paragraphs, so a sentence isn't cut at the page
 * width: a line joins the next unless there's a paragraph gap, it ends a
 * sentence or label, or either is a table row. Table rows read "cell: cell".
 */
function reflow(lines: PdfLine[]): string {
  const out: string[] = [];
  let para = '';
  lines.forEach((line, i) => {
    const cells = line.cells;
    if (!cells.length) return;
    const row = cells.length > 1;
    const text = row ? cells.join(cells.length === 2 ? ': ' : ' | ') : cells[0];
    para = para ? (para.endsWith('-') ? para + text : `${para} ${text}`) : text;
    const next = lines[i + 1];
    const gap = next ? line.y - next.y : Infinity;
    const ends =
      row ||
      !next ||
      next.cells.length > 1 ||
      gap > Math.max(line.size, next.size) * 1.6 ||
      gap < 0 || // a new column or text box higher up the page
      Math.abs(next.size - line.size) > 1 ||
      /^(?:[-\u2013\u2022\u25aa\u25cf*]|\d+[.)])\s/.test(next.cells[0] ?? '') || // a list item
      /[.!?:;]["'’”)]?$/.test(text);
    if (ends) {
      out.push(para);
      para = '';
    }
  });
  return out.join('\n');
}
