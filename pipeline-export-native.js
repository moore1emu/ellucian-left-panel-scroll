(() => {
  'use strict';

  // Keep this adapter in the page world; no authentication object crosses into extension messages.
  const fail = (code) => Object.assign(new Error(code), { exportCode: code });
  const version = (value) => {
    if (typeof value !== 'string' || !/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(value)) throw fail('unsupported-version');
    return value.replace(/^v/u, '');
  };
  const segment = (value) => {
    if (typeof value !== 'string' || !value || value.length > 500 || /[%/\\?#\u0000-\u001f]/u.test(value) || value === '.' || value === '..') throw fail('unsupported-name');
    return value;
  };
  const type = (value) => {
    const key = String(value || 'integration').toLowerCase().replace(/[ _-]/gu, '');
    return new Map([['integration', 'pipeline'], ['pipeline', 'pipeline'], ['api', 'api'], ['subpipeline', 'sub-pipeline']]).get(key);
  };

  // Reuse the exact callbacks/readers used by Integration Packages, not copied authentication code.
  function create(server, getJwt, tenantId, schedule, http, verifyContext = () => {}) {
    if (typeof getJwt !== 'function' || !['G9', 'bP', 'B0', 'db'].every((key) => typeof server?.[key] === 'function')) throw fail('reader-unavailable');
    segment(tenantId);
    return {
      async list() {
        // The false argument lists latest references without native Promise.all package fan-out.
        const result = await schedule(() => server.G9(getJwt, tenantId, false));
        if (!Array.isArray(result) || result.length > 10000) throw fail('metadata-unavailable');
        return result.map((entry) => ({ filename: segment(entry?.nameAndExtension), version: `v${version(entry?.version)}`,
          provisioned: entry.provisioned === true, merge: entry.merge === true, provisionedVersion: entry.provisionedVersion ? (version(entry.provisionedVersion), entry.provisionedVersion) : '' }));
      },
      async package(ref) {
        // Native helpers prepare and consume their opaque config; never inspect/copy its headers or token.
        const result = await schedule(async () => server.bP(await server.db(getJwt), tenantId, ref.version, ref.filename, ref.provisioned, ref.merge, ref.provisionedVersion));
        if (!result || result.error || !Array.isArray(result.pipelines)) throw fail('metadata-unavailable');
        // Match the isolated preview's existing total-record bound before allocating projected metadata.
        if (result.pipelines.length + (Array.isArray(result.transformFunctions) ? result.transformFunctions.length : 0) > 100000) throw fail('metadata-unavailable');
        segment(result.name);
        // Retain only metadata in the preview/session; package descriptions and any other fields are discarded.
        const pipelines = result.pipelines.filter((entry) => entry?.version && type(entry.type)).map((entry) => ({
          name: segment(entry.name), version: `v${version(entry.version)}`, type: type(entry.type),
        }));
        // Published transform-function metadata is separate from pipelines; never collect source during preview.
        if (result.transformFunctions !== undefined && !Array.isArray(result.transformFunctions)) throw fail('metadata-unavailable');
        for (const entry of result.transformFunctions || []) {
          pipelines.push({ name: segment(entry?.name), version: `v${version(entry?.version)}`, type: 'transformer' });
        }
        return { name: result.name, version: ref.version, ref, pipelines };
      },
      async read(entry, ref) {
        const expected = version(entry.version);
        segment(entry.name);
        // Keep: the owner-approved transformer reader uses only this fixed GET resource and untouched native config (2.0.7).
        if (entry.type === 'transformer') {
          if (typeof http?.get !== 'function') throw fail('reader-unavailable');
          return schedule(async () => {
            const config = await server.db(getJwt);
            // A tenant/navigation/consent change during authentication must not start another source request.
            verifyContext();
            const url = `https://semver-s3-service.prod.10005.elluciancloud.com/artifact/${encodeURIComponent(tenantId)}/transformFunction/latest/${encodeURIComponent(entry.name)}.js`;
            const response = await http.get(url, config);
            const text = response?.data;
            // Do not execute, JSON-wrap, or silently save a login/error HTML page as JavaScript.
            if (response?.status !== 200 || typeof text !== 'string' || !text.trim() || /^\s*<(?:!doctype|html|head|body)\b/iu.test(text)) throw fail('source-unavailable');
            return text;
          });
        }
        // Sub-Pipeline service paths use the major number; other artifacts use an exact full version.
        const isSubPipeline = entry.type === 'sub-pipeline';
        const route = isSubPipeline ? expected.split('.')[0] : `v${expected}`;
        const result = await schedule(() => server.B0(getJwt, tenantId, route, entry.name, ref.provisioned));
        if (!result || typeof result !== 'object' || Array.isArray(result) || result.error || result.name !== entry.name) throw fail('source-unavailable');
        // Keep: Sub-Pipelines resolve within a major and normally return version:null; metadata stays package-reported (2.0.6).
        if (isSubPipeline) {
          // If the service supplies a version, reject another major but allow compatible minor/patch updates.
          if (result.version != null && version(result.version).split('.')[0] !== route) throw fail('version-mismatch');
        } else if (typeof result.version !== 'string' || !result.version || version(result.version) !== expected) {
          // Only Sub-Pipelines may omit their resolved version; normal Pipeline/API sources must prove the exact release.
          throw fail('version-mismatch');
        }
        if (result.type && type(result.type) !== entry.type) throw fail('source-mismatch');
        return result;
      },
    };
  }

  // Synthetic fixtures can exercise the same contracts without live services or session credentials.
  globalThis.PipelineExportNative = Object.freeze({ create, fail });
})();
