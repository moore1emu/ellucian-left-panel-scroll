(() => {
  "use strict";

  // Run the same bounded workflow with either a future native adapter or synthetic test reader.
  async function collect(entries, { read, verify, signal, onProgress = () => {} }) {
    const files = new Array(entries.length);
    let next = 0;
    let completed = 0;
    let bytes = 0;
    let failure = null;
    const encoder = new TextEncoder();
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
          const payload = encoder.encode(transformer ? data : JSON.stringify(data, null, 2).replace(/\r?\n/gu, '\r\n') + '\r\n');
          bytes += payload.length;
          if (bytes > PipelineExportCore.MAX_BYTES) throw new Error('Export exceeds the 64 MB development limit.');
          files[index] = { path: PipelineExportCore.filePath(entry), bytes: payload };
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
    return PipelineExportCore.makeZip(files);
  }

  // Keep the runner free of storage, live network calls, and authentication handling.
  globalThis.PipelineExportSession = Object.freeze({ collect });
})();
