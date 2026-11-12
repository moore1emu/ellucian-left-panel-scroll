(() => {
  'use strict';

  // Keep fixed source contracts in MAIN; no caller-selected URL or authentication value is accepted.
  const fail = code => PipelineExportNative.fail(code);
  const name = value => {
    if (typeof value !== 'string' || !value || value.length > 500 || /[%/\\?#\u0000-\u001f]/u.test(value) || value === '.' || value === '..') throw fail('source-mismatch');
    return value;
  };
  const version = value => {
    if (typeof value !== 'string' || !/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(value)) throw fail('version-mismatch');
    return value.replace(/^v/u, '');
  };
  const type = value => new Map([['integration','pipeline'],['pipeline','pipeline'],['api','api'],['sub-pipeline','sub-pipeline'],['subpipeline','sub-pipeline']]).get(String(value || 'pipeline').toLowerCase());

  // Page every published API explicitly and keep only preview metadata; source JSON is read on selection.
  function api(client, schedule, verify) {
    const records = new Map();
    async function get(resource, accept = 'application/json') {
      return schedule(async () => {
        verify();
        const response = await client.authenticatedEthosFetch(resource, { method: 'GET', headers: { Accept: accept } });
        verify();
        if (!response?.ok) throw fail('source-unavailable');
        // Bound new fetch responses before parsing; source buffers still share the export's overall limit.
        const reader = response.body?.getReader();
        if (!reader) throw fail('source-unavailable');
        const chunks = []; let size = 0;
        for (;;) {
          const {done,value} = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16*1024*1024) { await reader.cancel(); throw fail('source-unavailable'); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
        verify();
        return { data: JSON.parse(new TextDecoder().decode(bytes)), total: response.headers.get('X-Total-Count') };
      });
    }
    return {
      async prepare() {
        const entries = []; const ids = new Set();
        let offset = 0; let total = null;
        while (total === null || offset < total) {
          const response = await get('database-query-apis?criteria=' + encodeURIComponent(JSON.stringify({ statuses: ['PUBLISHED'] })) + `&offset=${offset}&limit=100`);
          if (!Array.isArray(response.data) || !/^\d+$/u.test(response.total || '')) throw fail('metadata-changed');
          const count = Number(response.total);
          if (!Number.isSafeInteger(count) || count > 10000 || total !== null && total !== count || !response.data.length && offset < count) throw fail('metadata-changed');
          total = count;
          for (const row of response.data) {
            const id = name(row.databaseQueryId);
            const major = String(row.version);
            const semantic = version(row.semanticVersion);
            if (semantic.split('.')[0] !== major || ids.has(id)) throw fail('metadata-changed');
            ids.add(id);
            const entry = { name: name(row.apiName), version: semantic, type: 'api', state: 'published' };
            const key = JSON.stringify([entry.name, semantic]);
            records.set(key, id);
            entries.push({ name: entry.name, version: semantic, pipelines: [entry] });
          }
          offset += response.data.length;
          if (offset > total) throw fail('metadata-changed');
        }
        return entries;
      },
      async read(entry) {
        const id = records.get(JSON.stringify([entry.name, version(entry.version)]));
        if (!id) throw fail('entry-unavailable');
        const { data } = await get('database-queries/' + encodeURIComponent(id), 'application/vnd.hedtech.integration.database-query-artifacts.v1+json');
        // Native export metadata can intentionally say DRAFT for import; verify the selected published identity/version.
        if (!data || Array.isArray(data) || data.metaData?.resource !== entry.name || version(data.metaData?.semanticVersion) !== version(entry.version) || !data.query || typeof data.query !== 'object') throw fail('version-mismatch');
        return data;
      },
    };
  }

  // Designer's native readers own their session; never substitute Packages callbacks or copy native config.
  function designer(server, tenantId, loaded, schedule, verify, mode) {
    if (!['bP','B0','V0','a$'].every(key => typeof server?.[key] === 'function')) throw fail('reader-unavailable');
    const refs = new Map(); const drafts = new Map();
    return {
      async prepare() {
        if (!Array.isArray(loaded) || loaded.length > 10000) throw fail('metadata-changed');
        const output = []; let count = 0;
        // Apply the existing preview inventory bound before retaining native package records.
        const add = pkg => {
          count += pkg.pipelines.length;
          if (count > 100000 || output.length >= 10000) throw fail('metadata-changed');
          output.push(pkg);
        };
        // Native packageList is the full loaded inventory, not a paginated table's current DOM rows.
        if (mode !== 'draft') for (const pkg of loaded) {
          if (!pkg.version || !pkg.nameAndExtension) continue;
          verify();
          const result = await schedule(() => server.bP(tenantId, 'v' + version(pkg.version), name(pkg.nameAndExtension)));
          verify();
          if (result?.name !== pkg.name || !Array.isArray(result.pipelines) || result.pipelines.length > 100000) throw fail('metadata-changed');
          const items = result.pipelines.filter(p => type(p.type)).map(p => ({ name: name(p.name), version: 'v' + version(p.version), type: type(p.type), state: 'published' }));
          if (result.transformFunctions != null && (!Array.isArray(result.transformFunctions) || result.transformFunctions.length > 100000)) throw fail('metadata-changed');
          for (const p of result.transformFunctions || []) items.push({ name: name(p.name), version: 'v' + version(p.version), type: 'transformer', state: 'published' });
          refs.set(pkg.name, true);
          add({ name: name(pkg.name), version: 'v' + version(pkg.version), pipelines: items });
        }
        if (mode !== 'published') {
          const packages = await schedule(() => server.a$(tenantId));
          verify();
          if (!Array.isArray(packages) || packages.length > 10000) throw fail('metadata-changed');
          for (const pkg of packages) {
            const items = [];
            if (!Array.isArray(pkg.draft_pipelines) || pkg.draft_pipelines.length > 100000) throw fail('metadata-changed');
            for (const p of pkg.draft_pipelines) {
              const kind = type(p.type);
              if (!kind || p.deleted || String(p.status).toUpperCase() !== 'DRAFT') continue;
              const entry = { name: name(p.name), version: 'Draft', type: kind, state: 'draft' };
              const key = JSON.stringify([pkg.name, entry.name, kind]);
              if (drafts.has(key)) throw fail('metadata-changed');
              if (pkg.id && p.package_id && pkg.id !== p.package_id) throw fail('metadata-changed');
              drafts.set(key, {id:name(p.id),updatedOn:p.updated_on}); items.push(entry);
            }
            add({ name: name(pkg.name), version: 'Draft', pipelines: items });
          }
        }
        return output;
      },
      async read(entry) {
        name(entry.name); verify();
        if (entry.state === 'draft') {
          const draft = drafts.get(JSON.stringify([entry.packageName, entry.name, entry.type]));
          if (!draft) throw fail('entry-unavailable');
          const response = await schedule(() => server.V0(tenantId, draft.id));
          verify();
          // A draft may change without a semantic version; its observed update marker must remain the same.
          if (response?.id && response.id !== draft.id || draft.updatedOn && response?.updated_on !== draft.updatedOn) throw fail('metadata-changed');
          let data;
          try { data = typeof response?.content === 'string' ? JSON.parse(response.content) : response?.content; } catch { throw fail('source-unavailable'); }
          if (!data || Array.isArray(data) || data.name !== entry.name || data.type && type(data.type) !== entry.type) throw fail('source-mismatch');
          return data;
        }
        if (!refs.has(entry.packageName)) throw fail('entry-unavailable');
        if (entry.type === 'transformer') {
          if (typeof server.B5 !== 'function') throw fail('reader-unavailable');
          const text = await schedule(() => server.B5(tenantId, 'v' + version(entry.version), entry.name + '.js'));
          verify();
          if (typeof text !== 'string' || !text.trim() || /^\s*</u.test(text)) throw fail('source-unavailable');
          return text;
        }
        const expected = version(entry.version);
        const route = entry.type === 'sub-pipeline' ? expected.split('.')[0] : 'v' + expected;
        const data = await schedule(() => server.B0(route, entry.name, tenantId));
        verify();
        if (!data || Array.isArray(data) || data.name !== entry.name || data.error) throw fail('source-mismatch');
        if (data.version != null && (entry.type === 'sub-pipeline' ? version(data.version).split('.')[0] !== route : version(data.version) !== expected)) throw fail('version-mismatch');
        if (data.type && type(data.type) !== entry.type) throw fail('source-mismatch');
        return data;
      },
    };
  }

  globalThis.SourceExportNative = Object.freeze({ api, designer });
})();
