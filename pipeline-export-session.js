(() => {
  "use strict";

  // Match auto-sync's whitespace review pass without executing code or decoding literal escaped backslashes.
  function formatReview(content) {
    // Match escaped backslash pairs first; one replacement pass avoids a per-character array for large files.
    return content.replace(/\\\\|\\r\\n|\\[nrt]/gu, match =>
      match === '\\\\' ? match : match === '\\t' ? '\t' : '\r\n');
  }

  // Escape service-provided labels so artifact names cannot inject Markdown links, rows, or HTML.
  function cell(value) {
    const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '|': '&#124;', '[': '&#91;', ']': '&#93;', '\x60': '&#96;' };
    return String(value).replace(/[&<>|[\]\x60]/gu, character => escapes[character]).replace(/[\r\n]/gu, ' ');
  }

  // Keep the README inventory limited to selected records and existing metadata, without extra audit lookups.
  function packageReadme(name, entries, environment, layout) {
    const labels = { pipeline: 'Pipeline', 'sub-pipeline': 'Sub-Pipeline', api: 'API', transformer: 'Transformer' };
    const lines = ['# ' + cell(name), '', 'Environment: ' + cell(environment || 'Not available'), '',
      entries[0]?.state ? 'Source contains native JSON or original JavaScript. Any Formatted copies are for review, not import or execution.' : 'Source contains the importable JSON or original JavaScript. Formatted is a readable review copy, not for import or execution.', '',
      entries[0]?.state ? 'Folder organization follows the saved export configuration. Draft names are unversioned; published names retain their version suffix. Source versions are not rewritten.' : 'Versions below are package-reported. Sub-Pipeline source resolves within its major; transformer source resolves to latest. Source versions are not rewritten.', '',
      entries[0]?.state ? '| Name | Type | Major | Version | State | File |' : '| Name | Type | Major | Published Version |', entries[0]?.state ? '|---|---|---:|---|---|---|' : '|---|---|---:|---|'];
    for (const entry of entries) {
      const major = entry.state === 'draft' || entry.type === 'transformer' ? '—' : entry.version.replace(/^v/u, '').split('.')[0];
      const values = [entry.name, labels[entry.type], major, entry.version];
      if (entry.state) values.push(entry.state === 'draft' ? 'Draft' : 'Published', entryPaths(entry,false,layout)[0].path);
      lines.push('| ' + values.map(cell).join(' | ') + ' |');
    }
    // Do not imply a draft was published, or absent sharing observations prove no destinations exist.
    if (entries[0]?.state) {
      lines.push('', '## Shared To', '', 'Cached observations only; destinations may have changed.', '');
      for (const entry of entries) {
        const observed = entry.sharing;
        const destinations = observed?.destinations.map(d=>cell(d.environment)+' (v'+cell(d.version)+')').join(', ');
        lines.push('- ' + cell(PipelineExportCore.filePath(entry).split('/').at(-1)) + ': ' + (observed ? (destinations || 'None observed') + ' — observed ' + new Date(observed.observedAt).toISOString() : entry.state === 'draft' ? 'Not applicable to this draft.' : 'Not observed in this page session.'));
      }
    }
    return lines.join('\r\n') + '\r\n';
  }

  // Optional review files share the existing bounded, all-or-nothing collection and require no new requests.
  async function collectFiles(entries, { read, verify, signal, onProgress = () => {}, formatted = false, environment = '', layout = null }) {
    // Count physical generated files before requesting source code, retaining the existing archive file cap.
    const withReadme = formatted || layout || entries.some(entry => entry.state);
    const plannedPaths = paths(entries, formatted, layout);
    if (plannedPaths.length > PipelineExportCore.MAX_FILES) throw new Error('Too many export files.');
    // Reject any raw/formatted/README collision before source reads or provider operations.
    if (new Set(plannedPaths.map(path => path.toLowerCase())).size !== plannedPaths.length) throw new Error('Export filenames collide.');
    const files = new Array(entries.length);
    let next = 0;
    let completed = 0;
    let bytes = 0;
    let failure = null;
    const encoder = new TextEncoder();
    // Account for both representations and READMEs under the same existing archive byte limit.
    const file = (path, payload) => {
      bytes += payload.length;
      if (bytes > PipelineExportCore.MAX_BYTES) throw new Error('Export exceeds the 64 MB development limit.');
      return { path, bytes: payload };
    };
    const check = () => {
      if (signal?.aborted) throw new Error('Export cancelled.');
      if (failure) throw failure;
    };
    // Never start more than six readers; a timed-out native adapter must retain its own slot.
    async function worker() {
      while (next < entries.length) {
        check();
        const index = next++;
        const entry = entries[index];
        try {
          // Recheck document, tenant, and consent before every source request and after it settles.
          await verify();
          check();
          const data = await read(entry);
          check();
          await verify();
          check();
          const transformer = entry.type === 'transformer';
          if (transformer ? typeof data !== 'string' || !data.trim() : !data || typeof data !== 'object' || Array.isArray(data) || data.error) throw new Error('Published source unavailable.');
          // Native helpers return parsed JSON, so retain content while formatting portable CRLF text.
          // Transformer source stays plain JavaScript with the native response text unchanged, never evaluated.
          const content = transformer ? data : JSON.stringify(data, null, 2).replace(/\r?\n/gu, '\r\n') + '\r\n';
          const path = PipelineExportCore.filePath(entry);
          const separator = path.indexOf('/');
          // Unchecked exports retain exactly the previous two-level layout and source serialization.
          files[index] = entryPaths(entry,formatted,layout).map(item=>file(item.path,encoder.encode(item.formatted ? formatReview(content) : content)));
          // Keep: both Designer states live under the package, with state recorded in its README (3.1.4).
          completed += 1;
          onProgress({ completed, total: entries.length, bytes });
        } catch (error) {
          // The first failure stops queued work; do not pass a partial archive off as complete.
          failure ||= error;
          throw error;
        }
      }
    }
    // Wait for started readers before discarding partial buffers, even after cancellation/failure.
    const results = await Promise.allSettled(Array.from({ length: Math.min(6, entries.length) }, worker));
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    check();
    await verify();
    check();
    const output = files.flat();
    if (withReadme) {
      // Build one inventory per selected package only after every source has succeeded.
      const packages = new Map();
      for (const entry of entries) {
        const key = entry.packageName;
        if (!packages.has(key)) packages.set(key, []);
        packages.get(key).push(entry);
      }
      for (const items of packages.values()) {
        check();
        const name = items[0].packageName;
        output.push(file(PipelineExportCore.folderName(name) + '/README.md', encoder.encode(packageReadme(name, items, environment,layout))));
      }
    }
    check();
    return output;
  }

  // Keep ZIP byte construction unchanged while Git can reuse the same verified generated files.
  async function collect(entries, options) {
    return PipelineExportCore.makeZip(await collectFiles(entries, options),options.root || '');
  }

  // Keep the runner free of storage, live network calls, and authentication handling.
  // Describe the same physical layout using metadata only; destination previews never retrieve source code.
  function paths(entries, formatted, layout = null) {
    const output = [];
    const readmes = new Set();
    const withReadme = formatted || layout || entries.some(entry=>entry.state);
    for (const entry of entries) {
      for (const item of entryPaths(entry,formatted,layout)) output.push(item.path);
      if (withReadme) readmes.add(PipelineExportCore.folderName(entry.packageName)+'/README.md');
    }
    return [...output,...readmes];
  }
  // Build exactly the same physical paths for preview and collection, without reading source contents.
  function entryPaths(entry,formatted,layout) {
    const path=PipelineExportCore.filePath(entry);
    const split=path.indexOf('/');
    const name=path.slice(split+1),extension=name.slice(name.lastIndexOf('.')),stem=name.slice(0,name.lastIndexOf('.'));
    const state=entry.state==='draft' ? 'draft' : 'published';
    const root=(layout?.folderStructure.separateDraftAndPublished && entry.state ? (state==='draft'?'Draft/':'Published/') : '')+path.slice(0,split+1);
    const types=layout?.exportFileTypes || {source:true,formatted};
    const separate=layout ? layout.folderStructure.separateSourceAndFormatted : formatted;
    const suffix=layout?.filenameSuffixes || {};
    return ['source','formatted'].filter(type=>types[type]).map(type=>({
      path:root+(separate ? (type==='source'?'Source/':'Formatted/') : '')+stem+(entry.state ? suffix[state] || '' : '')+(suffix[type] || '')+extension,
      formatted:type==='formatted'
    }));
  }
  globalThis.PipelineExportSession = Object.freeze({ collect, collectFiles, paths });
})();
