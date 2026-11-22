// Merges downloaded slide decks into one PDF, in order, with a bookmark
// (outline) entry per class so the combined file is easy to navigate.
(() => {
  'use strict';

  const { PDFDocument, PDFName, PDFHexString, PDFNumber, StandardFonts, rgb } = globalThis.PDFLib;

  const DEFAULT_SIZE = [960, 540]; // 16:9, typical slide size in points

  // Standard PDF fonts only cover Latin-1; swap or drop anything else.
  function latin1(text) {
    return String(text || '')
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/…/g, '...')
      .replace(/•/g, '-')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  }

  function wrap(text, font, size, maxWidth) {
    const lines = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const w of latin1(para).split(/\s+/).filter(Boolean)) {
        const trial = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(trial, size) <= maxWidth || !line) line = trial;
        else { lines.push(line); line = w; }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function drawCard(doc, fonts, size, { eyebrow, title, body }) {
    const [w, h] = size;
    const page = doc.addPage([w, h]);
    const margin = w * 0.09;
    const maxW = w - margin * 2;
    const titleSize = Math.max(18, Math.round(h * 0.06));
    const bodySize = Math.max(11, Math.round(h * 0.03));
    const eyebrowSize = Math.max(9, Math.round(h * 0.024));

    page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(0.97, 0.98, 0.99) });
    page.drawRectangle({ x: 0, y: h - h * 0.012, width: w, height: h * 0.012, color: rgb(0, 0.57, 0.8) });

    const titleLines = wrap(title, fonts.bold, titleSize, maxW);
    const bodyLines = body ? wrap(body, fonts.regular, bodySize, maxW) : [];
    const blockH = eyebrowSize * 2.2 + titleLines.length * titleSize * 1.25 + (bodyLines.length ? bodySize * 1.2 + bodyLines.length * bodySize * 1.45 : 0);
    let y = h / 2 + blockH / 2;

    if (eyebrow) {
      y -= eyebrowSize;
      page.drawText(latin1(eyebrow).toUpperCase(), { x: margin, y, size: eyebrowSize, font: fonts.bold, color: rgb(0, 0.45, 0.66) });
      y -= eyebrowSize * 1.2;
    }
    for (const l of titleLines) {
      y -= titleSize * 1.25;
      page.drawText(l, { x: margin, y, size: titleSize, font: fonts.bold, color: rgb(0.09, 0.15, 0.22) });
    }
    if (bodyLines.length) y -= bodySize * 1.2;
    for (const l of bodyLines) {
      y -= bodySize * 1.45;
      page.drawText(l, { x: margin, y, size: bodySize, font: fonts.regular, color: rgb(0.3, 0.36, 0.42) });
    }
    return page;
  }

  /**
   * entries: [{ title, pageIndex, children?: [{ title, pageIndex }] }]
   * Builds a standard PDF outline tree (bookmarks panel).
   */
  function addOutline(doc, entries) {
    if (!entries.length) return;
    const ctx = doc.context;
    const pageRefs = doc.getPages().map((p) => p.ref);
    const rootRef = ctx.nextRef();

    const build = (list, parentRef) => {
      const refs = list.map(() => ctx.nextRef());
      let visible = list.length;
      list.forEach((entry, i) => {
        const dict = {
          Title: PDFHexString.fromText(entry.title),
          Parent: parentRef,
          Dest: ctx.obj([pageRefs[Math.min(entry.pageIndex, pageRefs.length - 1)], 'Fit']),
        };
        if (i > 0) dict.Prev = refs[i - 1];
        if (i < list.length - 1) dict.Next = refs[i + 1];
        const kids = entry.children || [];
        if (kids.length) {
          const sub = build(kids, refs[i]);
          dict.First = sub.first;
          dict.Last = sub.last;
          dict.Count = PDFNumber.of(sub.visible);
          visible += sub.visible;
        }
        ctx.assign(refs[i], ctx.obj(dict));
      });
      return { first: refs[0], last: refs[refs.length - 1], visible };
    };

    const top = build(entries, rootRef);
    ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: PDFNumber.of(top.visible) }));
    doc.catalog.set(PDFName.of('Outlines'), rootRef);
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  }

  /**
   * classes: [{ index, title, decks: [{ title, result?: {bytes,type,ext}, error?, savedAs? }] }]
   * options: { titlePages, docTitle, onProgress(done,total) }
   * Returns { bytes, pageCount, merged, skipped: [{deck, reason}] }
   */
  async function mergeUnit(classes, options = {}) {
    const out = await PDFDocument.create();
    const fonts = {
      regular: await out.embedFont(StandardFonts.Helvetica),
      bold: await out.embedFont(StandardFonts.HelveticaBold),
    };
    const outline = [];
    const skipped = [];
    let merged = 0;
    let done = 0;
    const total = classes.reduce((n, c) => n + c.decks.length, 0);
    const lastSize = () => {
      const n = out.getPageCount();
      if (!n) return DEFAULT_SIZE;
      const { width, height } = out.getPage(n - 1).getSize();
      return [width, height];
    };

    for (const cls of classes) {
      if (!cls.decks.length) continue;
      const classLabel = `${cls.index}. ${cls.title}`;
      const entry = { title: classLabel, pageIndex: out.getPageCount(), children: [] };

      if (options.titlePages) {
        drawCard(out, fonts, lastSize(), {
          eyebrow: `Class ${cls.index}`,
          title: cls.title,
          body: cls.decks.length > 1 ? cls.decks.map((d, i) => `${i + 1}. ${d.title}`).join('\n') : '',
        });
      }

      for (const deck of cls.decks) {
        const start = out.getPageCount();
        const r = deck.result;
        let added = false;
        if (r && r.type === 'pdf') {
          try {
            const src = await PDFDocument.load(r.bytes, { ignoreEncryption: true, updateMetadata: false });
            const pages = await out.copyPages(src, src.getPageIndices());
            pages.forEach((p) => out.addPage(p));
            added = pages.length > 0;
            if (added) merged++;
          } catch (err) {
            deck.mergeError = err?.message || String(err);
          }
        }
        if (!added) {
          const reason = !r ? `couldn't be downloaded (${deck.error || 'unknown error'})`
            : r.type !== 'pdf' ? (deck.skipReason || `is a .${r.ext} file, which can't be merged into a PDF`)
              : `is a damaged or protected PDF (${deck.mergeError})`;
          skipped.push({ deck, reason, cls });
          drawCard(out, fonts, lastSize(), {
            eyebrow: `Class ${cls.index} - not merged`,
            title: deck.title,
            body: `This file ${reason}.${deck.savedAs ? ` It was saved separately as "${deck.savedAs}".` : ' Open it from PESU Academy.'}`,
          });
        }
        entry.children.push({ title: deck.title, pageIndex: start });
        options.onProgress?.(++done, total);
      }

      // One deck per class: a single bookmark is enough.
      if (entry.children.length === 1) entry.children = [];
      outline.push(entry);
    }

    addOutline(out, outline);
    out.setTitle(options.docTitle || 'PESU slides');
    out.setCreator('Slide Merger for PESU Academy');
    out.setProducer('Slide Merger for PESU Academy (pdf-lib)');

    const bytes = await out.save();
    return { bytes, pageCount: out.getPageCount(), merged, skipped };
  }

  globalThis.PESUMerge = { mergeUnit, latin1 };
})();
