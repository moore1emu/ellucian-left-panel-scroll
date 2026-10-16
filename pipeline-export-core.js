(() => {
  "use strict";

  // Bound draft export buffers before the session adapter is connected to real services.
  const MAX_FILES = 10000;
  const MAX_BYTES = 64 * 1024 * 1024;
  const encoder = new TextEncoder();
  // Whitelist types without accepting inherited object names such as constructor.
  const types = new Map([["pipeline", "pipeline"], ["integration", "pipeline"], ["api", "api"], ["subpipeline", "sub-pipeline"], ["transformer", "transformer"]]);

  // Match published stable versions numerically, not by lexical filename order.
  function versionParts(value) {
    const match = typeof value === "string" && /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(value);
    if (!match) throw new Error("Unsupported published version.");
    const parts = match.slice(1).map(Number);
    if (parts.some((part) => !Number.isSafeInteger(part))) throw new Error("Unsupported published version.");
    return parts;
  }

  // Compare all three components so 1.10.0 correctly follows 1.9.9.
  function compareVersions(left, right) {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
    }
    return 0;
  }

  // Keep exact package/name relationships; smart-search normalization is not an ownership check.
  function sourceNames(cache, type = 'pipeline') {
    const known = new Map();
    for (const source of Object.values(cache || {})) {
      for (const item of Array.isArray(source?.packages) ? source.packages : []) {
        // Old names without a recorded package cannot authorize a package download.
        if (typeof item?.name !== "string" || !item.name) continue;
        if (!known.has(item.name)) known.set(item.name, new Set());
        // Keep transformer ownership separate: a same-named pipeline or legacy snapshot cannot authorize JavaScript.
        const names = type === 'transformer' ? item.transformFunctions : item.pipelines;
        for (const name of Array.isArray(names) ? names : []) {
          if (typeof name === "string" && name) known.get(item.name).add(name);
        }
      }
    }
    return known;
  }

  // Build a metadata-only preview; this module never performs authenticated requests.
  function buildPlan(packages, cache, { sharedFromEnabled = false, overrideConfirmed = false } = {}) {
    if (!sharedFromEnabled && !overrideConfirmed) throw new Error("Enable Shared From first.");
    const known = sourceNames(cache);
    const knownTransforms = sourceNames(cache, 'transformer');
    if (!known.size && !overrideConfirmed) throw new Error("Visit Designer in each source environment first.");
    const selected = new Map();
    let skipped = 0;
    for (const item of packages) {
      if (typeof item?.name !== "string" || !Array.isArray(item.pipelines)) throw new Error("Incomplete package metadata.");
      for (const pipeline of item.pipelines) {
        // Drafts and unknown artifact types never become published downloads.
        if (typeof pipeline?.name !== "string" || !pipeline.name || !pipeline.version) continue;
        if (pipeline.type != null && typeof pipeline.type !== "string") continue;
        const label = (pipeline.type || "pipeline").toLowerCase().replace(/[ _-]/gu, "");
        const type = types.get(label);
        if (!type) continue;
        const major = versionParts(pipeline.version)[0];
        const eligible = type === 'transformer' ? knownTransforms : known;
        if (!overrideConfirmed && !eligible.get(item.name)?.has(pipeline.name)) { skipped += 1; continue; }
        // Keep: Pipeline/Sub-Pipeline majors are independent published artifacts; retain the latest within each (2.0.8).
        const key = JSON.stringify([item.name, type, pipeline.name, type === 'pipeline' || type === 'sub-pipeline' ? major : null]);
        const previous = selected.get(key);
        if (!previous || compareVersions(pipeline.version, previous.version) > 0) {
          selected.set(key, { packageName: item.name, name: pipeline.name, version: pipeline.version, type });
        }
      }
    }
    if (selected.size > MAX_FILES) throw new Error("Too many export files.");
    // Show same-named major versions together in numeric order, not lexical order (10 before 2).
    const entries = [...selected.values()].sort((a, b) => a.packageName.localeCompare(b.packageName) || a.name.localeCompare(b.name) || a.type.localeCompare(b.type) || compareVersions(a.version, b.version));
    // Expose only preview metadata and whether a separately confirmed override was used.
    return { entries, skipped, override: overrideConfirmed };
  }

  // Escape Windows-invalid characters without collapsing different source names into one filename.
  function folderName(name) {
    if (typeof name !== "string" || !name || name.length > 500) throw new Error("Invalid export name.");
    let result = name.replace(/[%\u0000-\u001f<>:"/\\|?*]/gu, (character) => encodeURIComponent(character));
    result = result.replace(/[. ]+$/u, (suffix) => [...suffix].map((character) => character === "." ? "%2E" : "%20").join(""));
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(result)) result = `%${result.charCodeAt(0).toString(16).toUpperCase()}${result.slice(1)}`;
    return result;
  }

  // Give independent Pipeline/Sub-Pipeline majors stable filenames without rewriting source JSON.
  function filePath(entry) {
    const suffix = entry.type === 'pipeline' || entry.type === 'sub-pipeline' ? `_v${versionParts(entry.version)[0]}` : '';
    return `${folderName(entry.packageName)}/${folderName(entry.name)}${suffix}.${entry.type === 'transformer' ? 'js' : 'json'}`;
  }

  // Precompute standard ZIP CRC-32 values once, with no external ZIP dependency.
  const crcTable = Uint32Array.from({ length: 256 }, (_, initial) => {
    let value = initial;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });

  // Preserve the supplied source bytes; checksums do not parse or rewrite pipeline JSON.
  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }

  // Produce a standard uncompressed ZIP locally; the browser adapter owns download hand-off.
  function makeZip(files) {
    if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error("Too many export files.");
    const parts = [];
    const directory = [];
    const seen = new Set();
    let offset = 0;
    let payloadBytes = 0;
    for (const file of files) {
      // Accept only already-sanitized, relative, two-level JSON/JavaScript paths and real byte buffers.
      if (!/^[^\u0000-\u001f<>:"/\\|?*]+\/[^\u0000-\u001f<>:"/\\|?*]+\.(?:json|js)$/u.test(file.path) || file.path.split("/").some((part) => part === "." || part === "..") || !(file.bytes instanceof Uint8Array)) throw new Error("Invalid export file.");
      const key = file.path.toLowerCase();
      if (seen.has(key)) throw new Error("Export filenames collide.");
      seen.add(key);
      payloadBytes += file.bytes.length;
      if (payloadBytes > MAX_BYTES) throw new Error("Export exceeds the 64 MB development limit.");
      const name = encoder.encode(file.path);
      if (name.length > 65535) throw new Error("Export filename is too long.");
      const checksum = crc32(file.bytes);

      // Emit a local header with UTF-8 names and STORE compression, followed by unchanged bytes.
      const local = new Uint8Array(30 + name.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(12, 0x0021, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, file.bytes.length, true);
      localView.setUint32(22, file.bytes.length, true);
      localView.setUint16(26, name.length, true);
      local.set(name, 30);
      parts.push(local, file.bytes);

      // Record the same size/checksum and the local header's byte offset in the central directory.
      const central = new Uint8Array(46 + name.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(14, 0x0021, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, file.bytes.length, true);
      centralView.setUint32(24, file.bytes.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint32(42, offset, true);
      central.set(name, 46);
      directory.push(central);
      offset += local.length + file.bytes.length;
    }

    // Finish with the central-directory location and record count; ZIP64 is unnecessary within these bounds.
    const directoryBytes = directory.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, directoryBytes, true);
    endView.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: "application/zip" });
  }

  // Keep pure planning and archive assembly separate from session access and user confirmation.
  globalThis.PipelineExportCore = Object.freeze({ buildPlan, sourceNames, compareVersions, folderName, filePath, crc32, makeZip, MAX_BYTES });
})();
