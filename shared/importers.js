/* =====================================================================
   LIZZREAD —— 多格式导入器（importers.js）
   支持：TXT / MD / HTML / EPUB / DOCX / ODT / PDF / FB2 / RTF / SRT / VTT /
        CSV / JSON / ZIP（内含文本）/ MOBI（PalmDOC）/ AZW3（尽力）
   输出统一结构：{ title, author, format, text, chapters:[{t,text}], warnings }
   依赖：vendor/jszip.min.js（按需）、vendor/pdf.min.mjs（按需）
   ===================================================================== */
(function(global){
  'use strict';

  /* ---------- 工具 ---------- */
  function ensureJSZip(){
    if(global.JSZip) return Promise.resolve(global.JSZip);
    return new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = './vendor/jszip.min.js';
      s.onload = ()=> global.JSZip ? resolve(global.JSZip) : reject(new Error('JSZip 未初始化'));
      s.onerror = ()=>{
        const c = document.createElement('script');
        c.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        c.onload = ()=> global.JSZip ? resolve(global.JSZip) : reject(new Error('JSZip 加载失败'));
        c.onerror = ()=>reject(new Error('JSZip 加载失败（离线且没有 vendor/jszip.min.js）'));
        document.head.appendChild(c);
      };
      document.head.appendChild(s);
    });
  }
  async function loadPDF(){
    if(global.pdfjsLib) return global.pdfjsLib;
    const lib = await import('../vendor/pdf.min.mjs');
    const pdfjs = lib.default || lib;
    pdfjs.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.mjs';
    global.pdfjsLib = pdfjs;
    return pdfjs;
  }
  function decodeText(buf){
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const tryDec = (label)=>{
      try{ return new TextDecoder(label, {fatal:false}).decode(bytes); }catch(e){ return null; }
    };
    const utf8 = tryDec('utf-8') || '';
    const bad = (utf8.match(/\uFFFD/g)||[]).length;
    if(!bad || bad / Math.max(1,utf8.length) < 0.002) return utf8;
    for(const enc of ['gb18030','big5','shift_jis','windows-1252','iso-8859-1']){
      const s = tryDec(enc);
      if(!s) continue;
      const score = (s.match(/[\u4e00-\u9fff]/g)||[]).length*3 + (s.match(/\uFFFD/g)||[]).length*-10 + (s.match(/[A-Za-z]/g)||[]).length*0.05;
      if(score > 0) return s;
    }
    return utf8;
  }
  function cleanText(t){
    return String(t||'')
      .replace(/\r\n?/g,'\n')
      .replace(/\u0000/g,'')
      .replace(/[\t\f\v]+/g,' ')
      .replace(/[ \u00a0]+\n/g,'\n')
      .replace(/\n{4,}/g,'\n\n\n')
      .replace(/[ \u00a0]{2,}/g,' ')
      .trim();
  }
  function textFromHTML(html, opts){
    opts = opts || {};
    const doc = new DOMParser().parseFromString(String(html||''), 'text/html');
    doc.querySelectorAll('script,style,noscript,iframe,svg,img,object,embed,link,meta').forEach(n=>n.remove());
    const title = doc.querySelector('h1')?.textContent?.trim() || doc.title || '';
    const body = doc.body || doc.documentElement;
    if(!body) return { text:'', title };
    const parts = [];
    const walk = (node, depth)=>{
      if(node.nodeType === 3){
        const t = node.nodeValue.replace(/\s+/g,' ');
        if(t.trim()) parts.push(t);
        return;
      }
      if(node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if(tag === 'br'){ parts.push('\n'); return; }
      const isBlock = /^(p|div|section|article|h1|h2|h3|h4|h5|h6|li|blockquote|pre|tr|hr|table|dd|dt|figure|caption|title)$/.test(tag);
      if(isBlock && parts.length) parts.push('\n\n');
      if(/^h[1-6]$/.test(tag)) parts.push('\n' + (node.textContent||'').trim() + '\n');
      else for(const c of node.childNodes) walk(c, depth+1);
      if(isBlock) parts.push('\n\n');
      if(tag === 'li') parts.push('\n');
    };
    walk(body,0);
    return { title, text: cleanText(parts.join('')) };
  }
  function elementsByLocalName(doc, name){
    try{ return [...doc.getElementsByTagNameNS('*', name)]; }
    catch(e){ return [...doc.getElementsByTagName(name)]; }
  }
  function textFromXML(xml, mime){
    const doc = new DOMParser().parseFromString(String(xml||''), mime || 'application/xml');
    if(doc.querySelector('parsererror')) throw new Error('XML 解析失败');
    return doc;
  }
  function xmlDocText(doc, selectors){
    const parts = [];
    doc.querySelectorAll(selectors || 'p,h1,h2,h3,h4,h5,h6,li,div,section').forEach(el=>{
      const t = (el.textContent||'').replace(/\s+/g,' ').trim();
      if(!t) return;
      const tag = el.tagName.toLowerCase();
      parts.push(/^h[1-6]$/.test(tag) ? ('\n## '+t+'\n') : ('\n'+t+'\n'));
    });
    return cleanText(parts.join(''));
  }
  function chapterize(text){
    /* 依据 markdown/常见章节标题把正文切成章；没有则返回空 */
    const lines = String(text||'').split('\n');
    const chapters = [];
    let curTitle = '', cur = [];
    const isHeading = (line)=>{
      const s = line.trim();
      if(!s) return false;
      if(/^#{1,4}\s+/.test(s)) return true;
      if(/^(chapter|part|book|volume|letter|episode|canto|stave|act|scene|section|prologue|epilogue|preface|introduction|contents|附录|序|前言|第[一二三四五六七八九十百千0-9]+[章节卷部篇回])\b/i.test(s) && s.length < 90 && !/[.!?。！？]\s+\S/.test(s)) return true;
      if(/^第[一二三四五六七八九十百千0-9]+[章节卷部篇回]/.test(s) && s.length < 60) return true;
      if(/^[IVXLCDM\d]{1,4}[.、]\s+\S/.test(s) && s.length < 80) return true;
      return false;
    };
    for(const line of lines){
      if(isHeading(line)){
        if(cur.length) chapters.push({t:curTitle || ('第 '+(chapters.length+1)+' 部分'), text:cur.join('\n')});
        curTitle = line.replace(/^#{1,4}\s+/,'').trim();
        cur = [];
      } else cur.push(line);
    }
    if(cur.length) chapters.push({t:curTitle || ('第 '+(chapters.length+1)+' 部分'), text:cur.join('\n')});
    return chapters;
  }

  /* ---------- EPUB ---------- */
  async function parseEPUB(buf, onProgress){
    const JSZip = await ensureJSZip();
    const zip = await JSZip.loadAsync(buf);
    let opfPath = null;
    try{
      const c = await zip.file('META-INF/container.xml')?.async('string');
      if(c){
        const d = textFromXML(c);
        opfPath = d.querySelector('rootfile')?.getAttribute('full-path') || d.querySelector('rootfile')?.getAttribute('fullpath');
      }
    }catch(e){}
    if(!opfPath){
      const opfs = Object.keys(zip.files).filter(n=>/\.opf$/i.test(n));
      opfPath = opfs[0];
    }
    if(!opfPath) throw new Error('EPUB 缺少 OPF 文件');
    const opfRaw = await zip.file(opfPath).async('string');
    const opf = textFromXML(opfRaw);
    const title = (opf.querySelector('metadata title')?.textContent || opf.querySelector('dc\\:title')?.textContent || '').trim();
    const author = (opf.querySelector('metadata creator')?.textContent || '').trim();
    const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')+1) : '';
    const manifest = {};
    opf.querySelectorAll('manifest item').forEach(it=>{
      manifest[it.getAttribute('id')] = { href: (it.getAttribute('href')||'').replace(/^\.\//,''), type: it.getAttribute('media-type')||'' };
    });
    let order = [];
    const spine = opf.querySelector('spine');
    if(spine){
      spine.querySelectorAll('itemref').forEach(ref=>{
        const id = ref.getAttribute('idref');
        if(manifest[id]) order.push(manifest[id]);
      });
    }
    if(!order.length) order = Object.entries(manifest).filter(([k,v])=>/html|xhtml/i.test(v.type||k+v.href)).map(([k,v])=>v);
    const chapters = []; let full = [];
    let i = 0;
    for(const item of order){
      i++;
      if(onProgress) onProgress(Math.round(i/Math.max(1,order.length)*100), i, order.length);
      const path = base + item.href.split('#')[0];
      const f = zip.file(path) || zip.file(decodeURIComponent(path));
      if(!f) continue;
      let html = await f.async('string');
      const parsed = textFromHTML(html);
      if(!parsed.text) continue;
      let h1 = '';
      for(const name of ['h1','h2','h3']){
        const nodes = elementsByLocalName(textFromXML(html), name);
        if(nodes[0] && nodes[0].textContent.trim()){ h1 = nodes[0].textContent.trim(); break; }
      }
      const cTitle = h1.replace(/^#+\s*/,'') || item.href.split('/').pop().replace(/\.(x?html?|xml)$/i,'') || ('第 '+(chapters.length+1)+' 章');
      chapters.push({t:cTitle, text:parsed.text.replace(/^##\s*/gm,'')});
      full.push(parsed.text);
    }
    return { title: title || 'EPUB 导入', author, format:'EPUB', text: cleanText(full.join('\n\n')), chapters };
  }

  /* ---------- DOCX ---------- */
  async function parseDOCX(buf){
    const JSZip = await ensureJSZip();
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if(!docXml) throw new Error('DOCX 缺少 word/document.xml');
    let title = '', author = '';
    try{
      const core = await zip.file('docProps/core.xml')?.async('string');
      if(core){
        const d = textFromXML(core);
        title = (d.querySelector('title')?.textContent||'').trim();
        author = (d.querySelector('creator')?.textContent||'').trim();
      }
    }catch(e){}
    const doc = textFromXML(docXml);
    const paras = elementsByLocalName(doc, 'p');
    const chapters = []; let cur = [], curTitle = '';
    for(const p of paras){
      const styles = elementsByLocalName(p, 'pStyle');
      const style = (styles[0]?.getAttribute('w:val') || '').toLowerCase();
      const isHead = /heading|title|subtitle/.test(style) || /^[1-6]$/.test(style);
      const t = elementsByLocalName(p, 't').map(x=>x.textContent||'').join('').replace(/\s+/g,' ').trim();
      if(!t) continue;
      if(isHead){
        if(cur.length) chapters.push({t:curTitle||'第 '+(chapters.length+1)+' 部分', text:cur.join('\n')});
        curTitle = t; cur = [];
      } else cur.push(t);
    }
    if(cur.length) chapters.push({t:curTitle||'第 '+(chapters.length+1)+' 部分', text:cur.join('\n')});
    return { title: title || 'DOCX 导入', author, format:'DOCX', text: cleanText(chapters.map(c=>c.text).join('\n\n')), chapters };
  }

  /* ---------- ODT ---------- */
  async function parseODT(buf){
    const JSZip = await ensureJSZip();
    const zip = await JSZip.loadAsync(buf);
    const content = await zip.file('content.xml')?.async('string');
    if(!content) throw new Error('ODT 缺少 content.xml');
    let title = '', author = '';
    try{
      const meta = await zip.file('meta.xml')?.async('string');
      if(meta){
        const d = textFromXML(meta);
        title = (d.querySelector('dc\\:title')?.textContent||'').trim();
        author = (d.querySelector('meta\\:initial-creator')?.textContent||'').trim();
      }
    }catch(e){}
    const doc = textFromXML(content);
    const parts = []; const chapters = []; let curTitle = '', cur = [];
    const oelems = [...elementsByLocalName(doc, 'p'), ...elementsByLocalName(doc, 'h')];
    oelems.forEach(el=>{
      const tag = el.tagName.toLowerCase();
      const t = (el.textContent||'').replace(/\s+/g,' ').trim();
      if(!t) return;
      if(tag.includes('h')){
        if(cur.length) chapters.push({t:curTitle||'第 '+(chapters.length+1)+' 部分', text:cur.join('\n')});
        curTitle = t; cur = [];
      } else cur.push(t);
      parts.push(t);
    });
    if(cur.length) chapters.push({t:curTitle||'第 '+(chapters.length+1)+' 部分', text:cur.join('\n')});
    return { title: title || 'ODT 导入', author, format:'ODT', text: cleanText(parts.join('\n\n')), chapters };
  }

  /* ---------- PDF ---------- */
  async function parsePDF(buf, onProgress){
    const pdfjs = await loadPDF();
    const data = new Uint8Array(buf);
    const doc = await pdfjs.getDocument({data, isEvalSupported:false}).promise;
    const pages = [];
    for(let i=1;i<=doc.numPages;i++){
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let out = ''; let lastY = null;
      for(const item of tc.items){
        const y = item.transform ? item.transform[5] : null;
        if(lastY !== null && y !== null && Math.abs(y-lastY) > 4) out += '\n';
        out += (item.str||'');
        if(item.hasEOL) out += '\n';
        lastY = y;
      }
      pages.push(out.trim());
      if(onProgress) onProgress(Math.round(i/doc.numPages*100), i, doc.numPages);
    }
    const text = cleanText(pages.map((p,i)=>'[第 '+(i+1)+' 页]\n'+p).join('\n\n'));
    return { title: 'PDF 导入', author:'', format:'PDF', text, chapters: chapterize(text) };
  }

  /* ---------- FB2 ---------- */
  function parseFB2(buf){
    const raw = decodeText(buf);
    const doc = textFromXML(raw);
    const title = (doc.querySelector('book-title')?.textContent||'').trim();
    const author = [doc.querySelector('first-name')?.textContent, doc.querySelector('last-name')?.textContent].filter(Boolean).join(' ').trim();
    const chapters = [];
    elementsByLocalName(doc, 'section').forEach(sec=>{
      const h = [...sec.children].find(c=>c.tagName.toLowerCase()==='title');
      const t = h ? (h.textContent||'').replace(/\s+/g,' ').trim() : '第 '+(chapters.length+1)+' 节';
      const body = elementsByLocalName(sec, 'p').map(p=>(p.textContent||'').trim()).filter(Boolean).join('\n');
      if(body) chapters.push({t, text:body});
    });
    const text = cleanText(chapters.map(c=>c.text).join('\n\n'));
    return { title: title || 'FB2 导入', author, format:'FB2', text, chapters };
  }

  /* ---------- RTF ---------- */
  function parseRTF(buf){
    let raw = decodeText(buf);
    /* 去掉字体表/颜色表/样式表等控制组，避免 "Times New Roman;" 混进正文 */
    raw = raw.replace(/\{\*(?:\\[a-z]+)[^{}]*\}/gi, ' ');
    raw = raw.replace(/\{\\fonttbl[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, ' ');
    raw = raw.replace(/\{\\colortbl[^{}]*\}/gi, ' ');
    raw = raw.replace(/\{\\stylesheet[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, ' ');
    raw = raw.replace(/\\'([0-9a-f]{2})/gi,(m,h)=>String.fromCharCode(parseInt(h,16)));
    raw = raw.replace(/\\u([0-9]{1,5})\s?/g,(m,n)=>String.fromCharCode(parseInt(n,10)));
    raw = raw.replace(/\\par[d]?\b/g,'\n').replace(/\\line\b/g,'\n').replace(/\\tab\b/g,'\t');
    raw = raw.replace(/\\[a-z]+[-]?\d*\s?/gi,'').replace(/[{}]/g,'');
    const text = cleanText(raw);
    return { title:'RTF 导入', author:'', format:'RTF', text, chapters: chapterize(text) };
  }

  /* ---------- SRT / VTT ---------- */
  function parseSubtitle(buf){
    let raw = decodeText(buf).replace(/\r/g,'');
    raw = raw.replace(/WEBVTT[\s\S]*?\n\n/i,'');
    raw = raw.replace(/^\d+\s*\n/gm,'').replace(/^\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\S.*$/gm,'');
    const text = cleanText(raw.replace(/<[^>]+>/g,''));
    return { title:'字幕文本导入', author:'', format:'字幕', text, chapters: chapterize(text) };
  }

  /* ---------- JSON / CSV ---------- */
  function parseJSONText(buf){
    let j;
    try{ j = JSON.parse(decodeText(buf)); }catch(e){ throw new Error('JSON 解析失败'); }
    const out = [];
    const walk = (x)=>{
      if(typeof x === 'string'){ if(x.trim().length > 30) out.push(x); return; }
      if(Array.isArray(x)){ x.forEach(walk); return; }
      if(x && typeof x === 'object'){
        for(const k of ['text','content','body','chapter','paragraph','en','zh','title']){
          if(typeof x[k] === 'string' && x[k].trim().length > 2) out.push(x[k]);
        }
        for(const [k,v] of Object.entries(x)) if(!['text','content','body','chapter','paragraph','en','zh','title'].includes(k)) walk(v);
      }
    };
    walk(j);
    const text = cleanText(out.join('\n\n'));
    return { title:'JSON 导入', author:'', format:'JSON', text, chapters: chapterize(text) };
  }
  function parseCSVText(buf){
    const raw = decodeText(buf).replace(/\r/g,'');
    const rows = raw.split('\n').map(r=>r.split(',').map(c=>c.replace(/^"|"$/g,'').trim()));
    const out = rows.map(r=>r.filter(Boolean).join(' ')).filter(x=>x.length>2).join('\n');
    const text = cleanText(out);
    return { title:'CSV 导入', author:'', format:'CSV', text, chapters: chapterize(text) };
  }

  /* ---------- MOBI / PalmDOC ---------- */
  function palmDecompress(data){
    const out = [];
    let i = 0;
    while(i < data.length){
      const b = data[i++];
      if(b === 0){ if(i<data.length) out.push(data[i++]); }
      else if(b >= 1 && b <= 8){ for(let k=0;k<b && i<data.length;k++) out.push(data[i++]); }
      else if(b <= 0x7f){ out.push(b); }
      else if(b >= 0x80 && b <= 0xbf){
        if(i >= data.length) break;
        const b2 = data[i++];
        const dist = ((b & 0x3f) << 5) | (b2 >> 3);
        const len = (b2 & 7) + 3;
        const start = out.length - dist;
        for(let k=0;k<len;k++) out.push(out[start+k] ?? 0);
      } else {
        out.push(32, b ^ 0x80);
      }
    }
    return Uint8Array.from(out);
  }
  function parseMOBI(buf){
    const bytes = new Uint8Array(buf);
    const dv = new DataView(bytes.buffer);
    if(bytes.length < 100) throw new Error('MOBI 文件过小');
    const count = dv.getUint16(76, false);
    if(!count || 78 + count*8 > bytes.length) throw new Error('MOBI 记录表损坏');
    const offsets = [];
    for(let i=0;i<count;i++) offsets.push(dv.getUint32(78 + i*8, false));
    const rec0Start = offsets[0];
    const rec0End = offsets[1] || bytes.length;
    if(rec0End - rec0Start < 16) throw new Error('MOBI 头损坏');
    const compression = dv.getUint16(rec0Start, false);
    if(compression === 17480) throw new Error('这本 AZW3/MOBI 使用了 HUFF/CDIC 压缩，暂不支持；请先转换为 EPUB');
    let rawParts = [];
    for(let i=1;i<count;i++){
      const start = offsets[i];
      const end = offsets[i+1] || bytes.length;
      if(end <= start) continue;
      const rec = bytes.subarray(start, end);
      if(compression === 1) rawParts.push(rec);
      else if(compression === 2) rawParts.push(palmDecompress(rec));
      else throw new Error('不支持的 MOBI 压缩格式：'+compression);
    }
    const all = [];
    rawParts.forEach(p=>{ for(let k=0;k<p.length;k++) all.push(p[k]); });
    const raw = new TextDecoder('utf-8').decode(new Uint8Array(all));
    const parsed = textFromHTML(raw);
    const text = cleanText(parsed.text);
    return { title: parsed.title || 'MOBI 导入', author:'', format:'MOBI', text, chapters: chapterize(text) };
  }

  /* ---------- ZIP ---------- */
  async function parseZIP(buf, onProgress){
    const JSZip = await ensureJSZip();
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter(n=>!zip.files[n].dir);
    const lower = names.map(n=>n.toLowerCase());
    if(lower.some(n=>n.endsWith('.epub'))){
      const name = names[lower.findIndex(n=>n.endsWith('.epub'))];
      return parseEPUB(await zip.file(name).async('arraybuffer'), onProgress);
    }
    if(lower.some(n=>n.endsWith('.docx'))){
      const name = names[lower.findIndex(n=>n.endsWith('.docx'))];
      return parseDOCX(await zip.file(name).async('arraybuffer'));
    }
    const readable = names.filter(n=>/\.(txt|md|xhtml|html?|fb2|srt|vtt)$/i.test(n));
    if(!readable.length) throw new Error('ZIP 里没有可读的文本/EPUB/DOCX 文件');
    const parts = [];
    for(const n of readable.slice(0,200)){
      const raw = await zip.file(n).async('arraybuffer');
      if(/\.(html?|xhtml)$/i.test(n)){
        const p = textFromHTML(decodeText(raw));
        parts.push(p.text);
      } else parts.push(cleanText(decodeText(raw)));
    }
    const text = cleanText(parts.join('\n\n'));
    return { title:'ZIP 文本合集', author:'', format:'ZIP', text, chapters: chapterize(text) };
  }

  /* ---------- 主入口 ---------- */
  async function parseFile(file, onProgress){
    const name = file.name || 'book';
    const ext = (name.match(/\.([a-z0-9]+)$/i)||[])[1]?.toLowerCase() || '';
    if(onProgress) onProgress(1, 0, 1);
    const buf = await file.arrayBuffer();
    let res;
    switch(ext){
      case 'epub': res = await parseEPUB(buf, onProgress); break;
      case 'docx': res = await parseDOCX(buf); break;
      case 'odt': res = await parseODT(buf); break;
      case 'pdf': res = await parsePDF(buf, onProgress); break;
      case 'fb2': res = parseFB2(buf); break;
      case 'rtf': res = parseRTF(buf); break;
      case 'srt': case 'vtt': res = parseSubtitle(buf); break;
      case 'json': res = parseJSONText(buf); break;
      case 'csv': res = parseCSVText(buf); break;
      case 'zip': res = await parseZIP(buf, onProgress); break;
      case 'mobi': case 'azw': case 'azw3': res = parseMOBI(buf); break;
      case 'html': case 'htm': case 'xhtml': {
        const html = decodeText(buf);
        const p = textFromHTML(html);
        res = { title:p.title || name.replace(/\.\w+$/,''), author:'', format:'HTML', text:p.text, chapters: chapterize(p.text) };
        break;
      }
      case 'md': case 'markdown': {
        const raw = cleanText(decodeText(buf));
        const text = raw.replace(/^```[\s\S]*?```$/gm,'').replace(/^#{1,6}\s+/gm,'');
        res = { title:name.replace(/\.\w+$/,''), author:'', format:'Markdown', text, chapters: chapterize(raw) };
        break;
      }
      case 'txt': case 'text': {
        const raw = cleanText(decodeText(buf));
        res = { title:name.replace(/\.\w+$/,''), author:'', format:'TXT', text:raw, chapters: chapterize(raw) };
        break;
      }
      default: {
        /* 无扩展名/未知：先当文本试读，读不出就让用户明确 */
        const raw = cleanText(decodeText(buf));
        if(raw.length < 80 || /\uFFFD/.test(raw.slice(0,200))) throw new Error('无法识别的格式：.'+(ext||'未知')+'。支持 TXT/MD/HTML/EPUB/DOCX/ODT/PDF/FB2/RTF/SRT/VTT/CSV/JSON/ZIP/MOBI/AZW3');
        res = { title:name, author:'', format:(ext||'TEXT').toUpperCase(), text:raw, chapters: chapterize(raw) };
      }
    }
    if(!res || !res.text || res.text.length < 20) throw new Error('文件里没有找到可读正文');
    if(!res.chapters || !res.chapters.length) res.chapters = chapterize(res.text);
    res.title = (res.title || name.replace(/\.\w+$/,'')).slice(0,120);
    if(onProgress) onProgress(100, 1, 1);
    return res;
  }

  global.LZImport = { parseFile, parseEPUB, parseDOCX, parsePDF, parseMOBI, textFromHTML, chapterize, decodeText, cleanText, loadPDF, ensureJSZip };
})(typeof window !== 'undefined' ? window : globalThis);
