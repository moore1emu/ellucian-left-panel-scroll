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
  function packageReadme(name, entries, environment) {
    const labels = { pipeline: 'Pipeline', 'sub-pipeline': 'Sub-Pipeline', api: 'API', transformer: 'Transformer' };
    const lines = ['# ' + cell(name), '', 'Environment: ' + cell(environment || 'Not available'), '',
      entries[0]?.state ? 'Source contains native JSON or original JavaScript. Any Formatted copies are for review, not import or execution.' : 'Source contains the importable JSON or original JavaScript. Formatted is a readable review copy, not for import or execution.', '',
      entries[0]?.state ? 'Draft and published files are separate. Versions are observed metadata; source versions are not rewritten.' : 'Versions below are package-reported. Sub-Pipeline source resolves within its major; transformer source resolves to latest. Source versions are not rewritten.', '',
      entries[0]?.state ? '| Name | Type | Major | Version |' : '| Name | Type | Major | Published Version |', '|---|---|---:|---|'];
    for (const entry of entries) {
      const major = entry.state === 'draft' || entry.type === 'transformer' ? '—' : entry.version.replace(/^v/u, '').split('.')[0];
      lines.push('| ' + [entry.name, labels[entry.type], major, entry.version].map(cell).join(' | ') + ' |');
    }
    // Do not imply a draft was published, or absent sharing observations prove no destinations exist.
    if (entries[0]?.state) {
      lines.push('', 'State: ' + cell(entries[0].state), '', '## Shared To', '', 'Cached observations only; destinations may have changed.', '');
      for (const entry of entries) {
        const observed = entry.sharing;
        const destinations = observed?.destinations.map(d=>cell(d.environment)+' (v'+cell(d.version)+')').join(', ');
        lines.push('- ' + cell(entry.name) + ': ' + (observed ? (destinations || 'None observed') + ' — observed ' + new Date(observed.observedAt).toISOString() : entry.state === 'draft' ? 'Not applicable to this draft.' : 'Not observed in this page session.'));
      }
    }
    return lines.join('\r\n') + '\r\n';
  }

  // Optional review files share the existing bounded, all-or-nothing collection and require no new requests.
  async function collectFiles(entries, { read, verify, signal, onProgress = () => {}, formatted = false, environment = '' }) {
    // Count physical generated files before requesting source code, retaining the existing archive file cap.
    const withReadme = formatted || entries.some(entry => entry.state);
    if (entries.length * (formatted ? 2 : 1) + (withReadme ? new Set(entries.map(entry => JSON.stringify([entry.packageName,entry.state]))).size : 0) > PipelineExportCore.MAX_FILES) throw new Error('Too many export files.');
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
          files[index] = formatted ? [
            file(path.slice(0, separator + 1) + 'Source/' + path.slice(separator + 1), encoder.encode(content)),
            file(path.slice(0, separator + 1) + 'Formatted/' + path.slice(separator + 1), encoder.encode(formatReview(content))),
          ] : [file(path, encoder.encode(content))];
          // State folders are fixed labels, never paths accepted from native source metadata.
          if (entry.state) for (const output of files[index]) output.path = (entry.state === 'draft' ? 'Draft/' : 'Published/') + output.path;
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
        const key = JSON.stringify([entry.packageName,entry.state]);
        if (!packages.has(key)) packages.set(key, []);
        packages.get(key).push(entry);
      }
      for (const items of packages.values()) {
        check();
        const name = items[0].packageName;
        const prefix = items[0].state ? (items[0].state === 'draft' ? 'Draft/' : 'Published/') : '';
        output.push(file(prefix + PipelineExportCore.folderName(name) + '/README.md', encoder.encode(packageReadme(name, items, environment))));
      }
    }
    check();
    return output;
  }

  // Keep ZIP byte construction unchanged while Git can reuse the same verified generated files.
  async function collect(entries, options) {
    return PipelineExportCore.makeZip(await collectFiles(entries, options));
  }

  // Keep the runner free of storage, live network calls, and authentication handling.
  globalThis.PipelineExportSession = Object.freeze({ collect, collectFiles });
})();
