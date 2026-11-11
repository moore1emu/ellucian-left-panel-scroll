(() => {
  'use strict';

  // Render only the existing Job Run Files Ace document. Never fetch, persist, or relay its contents.
  let active = null;
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Preserve quoted commas, embedded record separators, escaped quotes, and trailing empty fields.
  function csvRecords(text) {
    const rows = [];
    let row = [], field = '', quoted = false, closed = false, cells = 0;
    function finishField() {
      if (++cells > 300000) throw new RangeError();
      row.push(field);
      field = '';
      closed = false;
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c !== '"') field += c;
        else if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else if (c === ',') {
        finishField();
      } else if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        finishField();
        rows.push(row);
        row = [];
      } else if (c === '"' && !field && !closed) {
        quoted = true;
      } else {
        if (closed || c === '"') throw new SyntaxError();
        field += c;
      }
    }
    if (quoted) throw new SyntaxError();
    // A final record separator terminates the last row without adding a phantom empty row.
    if (row.length || field || closed || !/[\r\n]$/u.test(text)) { finishField(); rows.push(row); }
    return rows;
  }

  function csvView(text) {
    const [headers, ...rows] = csvRecords(text);
    const width = rows.reduce((max, row) => Math.max(max, row.length), headers.length);
    if (width > 2000) throw new RangeError();
    // Limit mounted table cells while keeping every record reachable.
    const pageSize = Math.max(1, Math.min(100, Math.floor(2000 / width)));
    const root = element('div'), table = element('table'), head = table.createTHead().insertRow();
    table.setAttribute('aria-label', 'CSV file');
    for (let i = 0; i < width; i++) {
      const cell = element('th', headers[i] ?? '');
      cell.scope = 'col';
      head.append(cell);
    }
    const body = table.createTBody();
    let start = 0;
    const nav = element('div'), prev = element('button', 'Previous'), next = element('button', 'Next');
    const count = element('span');
    count.setAttribute('aria-live','polite');
    for (const button of [prev,next]) button.type = 'button';
    nav.className = 'inav-file-pages';
    nav.append(prev, count, next);
    function draw() {
      const end = Math.min(start + pageSize, rows.length);
      body.replaceChildren();
      for (const row of rows.slice(start, end)) {
        const tr = body.insertRow();
        for (let i = 0; i < width; i++) tr.insertCell().textContent = row[i] ?? '';
      }
      prev.disabled = start === 0;
      next.disabled = end === rows.length;
      count.textContent = 'Rows ' + (start + 1) + '–' + end + ' of ' + rows.length;
    }
    prev.onclick = () => { start -= pageSize; draw(); };
    next.onclick = () => { start += pageSize; draw(); };
    if (rows.length > pageSize) root.append(nav);
    root.append(table);
    draw();
    return root;
  }

  function jsonView(text) {
    // Validate syntax, then render the original tokens to preserve large numbers and duplicate keys.
    JSON.parse(text);
    const tokens = [], stack = [], ends = new Map();
    const pattern = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:"]+/gu;
    for (const match of text.matchAll(pattern)) {
      if (tokens.length >= 400000) throw new RangeError();
      const token = match[0], at = tokens.push(token) - 1;
      if (token === '{' || token === '[') stack.push(at);
      if (token === '}' || token === ']') ends.set(stack.pop(), at);
    }

    // Native disclosures build children on demand. Long arrays can be read a page at a time.
    function value(at, prefix, suffix, open) {
      const end = ends.get(at);
      if (end === undefined || end === at + 1) {
        return element('div', prefix + tokens[at] + (end === undefined ? '' : tokens[end]) + suffix);
      }
      const details = element('details'), summary = element('summary');
      const children = element('div'), more = element('button', 'Show more');
      more.type = 'button';
      children.className = 'inav-json-children';
      let cursor = at + 1;
      function appendPage() {
        more.remove();
        for (let n = 0; n < 80 && cursor < end; n++) {
          let label = '';
          if (tokens[at] === '{') { label = tokens[cursor] + ': '; cursor += 2; }
          const first = cursor;
          cursor = (ends.get(first) ?? first) + 1;
          const comma = tokens[cursor] === ',' ? ',' : '';
          if (comma) cursor++;
          children.append(value(first, label, comma, false));
        }
        if (cursor < end) children.append(more);
      }
      function update() {
        summary.textContent = prefix + tokens[at] + (details.open ? '' : '…' + tokens[end] + suffix);
        if (details.open && cursor === at + 1) appendPage();
      }
      more.onclick = appendPage;
      details.append(summary, children, element('div', tokens[end] + suffix));
      details.open = open;
      details.addEventListener('toggle', update);
      update();
      return details;
    }
    const tree = element('div');
    tree.className = 'inav-json-tree';
    tree.append(value(0, '', '', true));
    return tree;
  }

  // Keep the original editor mounted and intact so Close, Download and raw mode retain native behavior.
  function restore() {
    if (!active) return;
    const { host, editor, panel, refresh, timer } = active;
    active = null;
    clearTimeout(timer);
    editor.off('change', refresh);
    editor.off('changeSession', refresh);
    panel.remove();
    host.classList.remove('inav-file-raw-hidden');
    if (host.isConnected) editor.resize();
  }

  function synchronize() {
    const host = document.querySelector('[role="dialog"] #review-file.ace_editor');
    const dialog = host?.closest('[role="dialog"]');
    const title = dialog?.querySelector('h1,h2,h3,[role="heading"]')?.textContent.trim() ?? '';
    const format = title.match(/\.(json|csv)$/iu)?.[1]?.toLowerCase();
    const enabled = dialog?.querySelector('.inav-file-switch input')?.checked;
    const editor = host?.env?.editor;
    if (!enabled || !format || !/\/data-connect(?:\/|$)/iu.test(location.pathname) ||
        !editor?.getValue || !editor.on || !editor.off) { restore(); return; }
    if (active?.editor === editor && active.host === host && active.title === title && active.panel.isConnected) return;
    restore();
    const panel = element('div');
    panel.className = 'inav-file-output';
    panel.setAttribute('aria-label', 'Formatted ' + format.toUpperCase());
    panel.setAttribute('role','region');
    panel.tabIndex = 0;
    panel.style.maxHeight = Math.max(120, host.getBoundingClientRect().height) + 'px';
    host.after(panel);
    function render() {
      if (active?.panel !== panel || !panel.isConnected) return;
      try {
        // Bound preview work and leave large or malformed documents readable in the native viewer.
        if (editor.session.getLength() > 300000) throw new RangeError();
        const text = editor.getValue();
        if (text.length > 8 * 1024 * 1024) throw new RangeError();
        const source = text.replace(/^\uFEFF/u, '');
        const content = format === 'json' ? jsonView(source) : csvView(source);
        panel.replaceChildren(content);
        host.classList.add('inav-file-raw-hidden');
      } catch (error) {
        host.classList.remove('inav-file-raw-hidden');
        panel.textContent = error instanceof RangeError ? 'Large file. Showing raw text.' :
          'Unable to format this ' + format.toUpperCase() + ' file. Showing raw text.';
        editor.resize();
      }
    }
    // Ace sends change notifications even when React reuses a mounted editor or finishes loading later.
    function refresh() {
      if (active?.panel !== panel) return;
      clearTimeout(active.timer);
      active.timer = setTimeout(render, 0);
    }
    active = { host, editor, panel, title, refresh, timer: 0 };
    editor.on('change', refresh);
    editor.on('changeSession', refresh);
    render();
  }
  document.addEventListener('ellucian-job-file-view-change', synchronize);
  window.addEventListener('pagehide', restore);
})();
