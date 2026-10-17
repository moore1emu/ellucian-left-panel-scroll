(() => {
  'use strict';

  // Keep the existing response-memory safeguard independent of the owner-removed upload-size cap.
  const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
  const SHA = /^[a-f\d]{40}$/u;
  const encoder = new TextEncoder();
  const fail = message => { throw new Error(message); };
  const part = value => encodeURIComponent(value);

  // Allow HTTPS DNS origins only; no credentials, local/IP endpoints, ports, or URL-path prefixes.
  function origin(value) {
    let url;
    try { url = new URL(value); } catch { fail('Enter an HTTPS GitLab server origin.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z][a-z\d-]*$/iu.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal)$/iu.test(url.hostname)) fail('Use an HTTPS server domain without credentials, paths, ports, or local addresses.');
    return url.origin;
  }

  // Repository destinations cannot select arbitrary API URLs, Git internals, or workflow configuration.
  function config(input) {
    if (!input || !['github', 'gitlab'].includes(input.provider)) fail('Choose GitHub or GitLab.');
    const server = input.provider === 'github' ? 'https://github.com' : origin(input.server);
    const repository = typeof input.repository === 'string' ? input.repository.trim() : '';
    const branch = typeof input.branch === 'string' ? input.branch.trim() : '';
    const folder = typeof input.folder === 'string' ? input.folder.trim() : '';
    const segment = /^[a-z\d_][a-z\d._-]{0,99}$/iu;
    const segments = repository.split('/');
    if (segments.length < 2 || segments.length > 10 || input.provider === 'github' && segments.length !== 2 || segments.some(x => !segment.test(x) || x.endsWith('.git'))) fail('Enter owner/repository or group/project, not a URL.');
    if (!branch || branch.length > 200 || /[\s~^:?*\[\\\u0000-\u001f]/u.test(branch) || branch.includes('..') || branch.includes('@{') || branch.startsWith('-') || branch.startsWith('/') || branch.endsWith('/') || branch.endsWith('.') || branch.split('/').some(x => !x || x.startsWith('.') || x.endsWith('.lock'))) fail('Enter a valid existing branch name.');
    if (!folder || folder.length > 500 || folder.split('/').some(x => !segment.test(x) || x === '.' || x === '..' || /^(?:\.git|\.github|\.gitlab)$/iu.test(x))) fail('Choose a dedicated relative export folder, such as DataConnect/Test.');
    return { provider: input.provider, server, repository, branch, folder };
  }

  // Resolve a tenant-named child only from the exact verified tenant's saved Designer observation.
  function tenantDestination(destination, tenantId, cache) {
    const c = config(destination);
    const name = typeof tenantId === 'string' && Object.hasOwn(cache || {}, tenantId) ? cache[tenantId]?.environment : null;
    if (typeof name !== 'string' || !name.trim()) fail('Tenant name is unavailable. Refresh sources in Designer, then reopen export.');
    const tenantName = name.trim();
    // Do not silently sanitize two different labels into the same folder or fall back to a different tenant.
    if (!/^[a-z\d_][a-z\d._-]{0,99}$/iu.test(tenantName) || /^(?:\.git|\.github|\.gitlab)$/iu.test(tenantName)) fail('The saved tenant name cannot be used as a Git folder. Check the Designer environment name.');
    if (Object.entries(cache).some(([id, entry]) => id !== tenantId && typeof entry?.environment === 'string' && entry.environment.trim().toLowerCase() === tenantName.toLowerCase())) fail('Multiple saved tenants have the same name. Resolve the environment names before Git export.');
    return config({ ...c, folder: c.folder + '/' + tenantName });
  }

  // Keep byte encoding portable without spreading a large buffer onto the JavaScript call stack.
  function base64(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(text);
  }

  // Git blob identity compares unchanged raw bytes without reading remote source payloads.
  async function blobSha(bytes) {
    const prefix = encoder.encode(`blob ${bytes.length}\0`);
    const input = new Uint8Array(prefix.length + bytes.length);
    input.set(prefix); input.set(bytes, prefix.length);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', input)), x => x.toString(16).padStart(2, '0')).join('');
  }

  // Fix each endpoint to the configured provider; returned URLs are never followed or used for requests.
  function client(destination, token, { fetcher = fetch, signal, check = async () => {} } = {}) {
    const c = config(destination);
    const api = c.provider === 'github' ? 'https://api.github.com' : c.server;
    const root = c.provider === 'github' ? `/repos/${c.repository.split('/').map(part).join('/')}` : `/api/v4/projects/${part(c.repository)}`;
    async function request(path, method = 'GET', body) {
      await check();
      if (signal?.aborted) fail('Git operation cancelled.');
      if (path !== '' && (!path.startsWith('/') || path.startsWith('//'))) fail('Invalid provider operation.');
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const abort = new AbortController();
      const stop = () => abort.abort();
      const timeout = setTimeout(stop, 30000);
      signal?.addEventListener('abort', stop, { once: true });
      try {
        const response = await fetcher(api + root + path, { method, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: abort.signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(c.provider === 'github'
            ? { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } : { 'PRIVATE-TOKEN': token }) }, body: payload });
        // Never return provider error bodies, which can echo tokens, source content, or institutional names.
        if (!response.ok) {
          // A server error after a write is not proof of rejection; verify its outcome instead of replaying.
          if (response.status >= 500 && !['GET', 'HEAD'].includes(method)) throw new Error('uncertain-server-write');
          const messages = { 401: 'Git authentication failed. Reconnect with a valid token.', 403: 'Git access was denied or rate limited. Check permissions and branch protection.', 404: 'Git repository, branch, or file was not found.', 409: 'Git changed or rejected this commit. Refresh Git preview.', 422: 'Git rejected this change. Check branch protection and refresh preview.', 429: 'Git rate limit reached. Wait before preparing another preview.' };
          throw Object.assign(new Error(messages[response.status] || 'Git service rejected the request.'), { definitive: true });
        }
        // GitLab HEAD exposes only file identity metadata, never an existing file's source contents.
        if (method === 'HEAD') return { blob_id: response.headers.get('X-Gitlab-Blob-Id'), last_commit_id: response.headers.get('X-Gitlab-Last-Commit-Id') };
        // Stream bounded responses; a misleading/missing Content-Length cannot allocate unlimited memory.
        const reader = response.body.getReader();
        const chunks = []; let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); fail('Git response exceeds the supported limit.'); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail('Git returned an unsupported response.'); }
      } catch (error) {
        if (error.definitive) throw error;
        // A sent write may have succeeded even when its response was lost; callers must verify, never replay.
        const write = !['GET', 'HEAD'].includes(method);
        throw Object.assign(new Error(!write ? 'Git could not be reached. Check the server and connection.' : 'Git write result is uncertain. Do not retry until verified.'), { uncertain: write });
      } finally { clearTimeout(timeout); signal?.removeEventListener('abort', stop); }
    }
    return { c, request };
  }

  // Pin a complete branch tree; truncated or oversized inventories are not safe comparison baselines.
  async function snapshot(client) {
    const { c, request } = client;
    const project = await request('');
    const visibility = c.provider === 'github' ? project.private === true ? 'private' : project.private === false ? 'public' : 'unknown'
      : ['private', 'internal', 'public'].includes(project.visibility) ? project.visibility : 'unknown';
    if (visibility === 'unknown') fail('Git repository visibility could not be verified.');
    let head; let tree; const entries = [];
    if (c.provider === 'github') {
      const ref = await request('/git/ref/heads/' + part(c.branch));
      head = ref.object?.sha;
      if (!SHA.test(head || '') || ref.ref !== 'refs/heads/' + c.branch) fail('Git returned an invalid branch.');
      const commit = await request('/git/commits/' + head); tree = commit.tree?.sha;
      if (!SHA.test(tree || '')) fail('Git returned an invalid tree.');
      const result = await request('/git/trees/' + tree + '?recursive=1');
      if (result.truncated || !Array.isArray(result.tree) || result.tree.length > 50000) fail('Repository tree is too large to compare safely.');
      entries.push(...result.tree);
    } else {
      const branch = await request('/repository/branches/' + part(c.branch)); head = branch.commit?.id;
      if (!SHA.test(head || '') || branch.name !== c.branch) fail('Git returned an invalid branch.');
      // Explicit pagination has a hard bound and is pinned to the original immutable commit.
      for (let page = 1; page <= 501; page += 1) {
        const result = await request('/repository/tree?recursive=true&per_page=100&page=' + page + '&ref=' + head);
        if (!Array.isArray(result) || result.length > 100) fail('Git returned an invalid tree.');
        entries.push(...result.map(x => ({ ...x, sha: x.id })));
        if (entries.length > 50000 || page === 501) fail('Repository tree is too large to compare safely.');
        if (result.length < 100) break;
      }
    }
    const paths = new Map();
    for (const entry of entries) {
      if (typeof entry.path !== 'string' || !SHA.test(entry.sha || '') || paths.has(entry.path)) fail('Git returned an invalid tree.');
      paths.set(entry.path, entry);
    }
    return { head, tree, paths, visibility };
  }

  // Compare only generated artifact files inside the chosen folder, preserving everything else.
  async function preview(destination, files, token, options) {
    const connection = client(destination, token, options);
    // The source collector owns its existing record bounds; Git applies byte limits, not an extra file-count cap.
    if (!Array.isArray(files) || !files.length) fail('Select at least one file for Git export.');
    const seen = new Set(); const local = [];
    for (const file of files) {
      if (!(file.bytes instanceof Uint8Array) || !/^[^\u0000-\u001f<>:"/\\|?*]+\/(?:(?:(?:Source|Formatted)\/)?[^\u0000-\u001f<>:"/\\|?*]+\.(?:json|js)|README\.md)$/u.test(file.path) || file.path.split('/').some(x => x === '.' || x === '..' || /^(?:\.git|\.github|\.gitlab)$/iu.test(x))) fail('Invalid Git export file.');
      const path = connection.c.folder + '/' + file.path;
      if (seen.has(path.toLowerCase())) fail('Git filenames collide.');
      seen.add(path.toLowerCase());
      local.push({ path, bytes: file.bytes.slice(), sha: await blobSha(file.bytes), content: base64(file.bytes) });
    }
    // Keep: provider-specific upload limits, not a separate extension byte cap, decide acceptance (3.0.6).
    const remote = await snapshot(connection);
    const foldedRemote = new Map([...remote.paths.keys()].map(path => [path.toLowerCase(), path]));
    const changes = [];
    for (const file of local) {
      // Refuse case-only collisions that would be ambiguous in Windows working folders.
      const folded = foldedRemote.get(file.path.toLowerCase());
      if (folded && folded !== file.path) fail('Git destination collides with a folder, executable, link, or submodule.');
      const ancestors = file.path.split('/'); ancestors.pop();
      while (ancestors.length) {
        const entry = remote.paths.get(ancestors.join('/'));
        if (entry && entry.mode !== '040000' && entry.mode !== '40000') fail('Git destination has a file or link where a folder is needed.');
        ancestors.pop();
      }
      const previous = remote.paths.get(file.path);
      if (previous && (previous.type !== 'blob' || previous.mode !== '100644')) fail('Git destination collides with a folder, executable, link, or submodule.');
      if (previous?.sha === file.sha) continue;
      let lastCommit;
      // GitLab protects updates with the last file commit as well as our whole-branch preflight check.
      if (previous && connection.c.provider === 'gitlab') {
        const metadata = await connection.request('/repository/files/' + part(file.path) + '?ref=' + remote.head, 'HEAD');
        if (!SHA.test(metadata.last_commit_id || '') || metadata.blob_id !== previous.sha) fail('Git file changed. Refresh Git preview.');
        lastCommit = metadata.last_commit_id;
      }
      changes.push({ ...file, action: previous ? 'update' : 'create', lastCommit });
    }
    return { config: connection.c, head: remote.head, tree: remote.tree, visibility: remote.visibility, changes, total: files.length };
  }

  // Recheck remote head immediately before writes; GitHub additionally enforces a non-forced fast-forward.
  async function push(plan, token, options = {}) {
    const connection = client(plan.config, token, options);
    const { c, request } = connection;
    const currentHead = async () => c.provider === 'github' ? (await request('/git/ref/heads/' + part(c.branch))).object?.sha
      : (await request('/repository/branches/' + part(c.branch))).commit?.id;
    if (await currentHead() !== plan.head) fail('Remote branch changed. Prepare and confirm a new Git preview.');
    if (!plan.changes.length) return { commit: null, count: 0 };
    // Describe only files that changed; unchanged selections must not appear as updates.
    const added = plan.changes.filter(file => file.action === 'create');
    const updated = plan.changes.filter(file => file.action === 'update');
    const lines = [`Integration Navigator: ${added.length} added, ${updated.length} updated files`];
    // Keep: file/package lists belong in Git's diff, not the owner-requested concise commit summary (3.0.4).
    // Keep: a unique footer identifies uncertain GitLab writes without replaying a commit (3.0.4).
    lines.push('', 'Export-ID: ' + crypto.randomUUID());
    const marker = lines.join('\n');
    let commit;
    if (c.provider === 'github') {
      // New objects do not alter the branch; any later failure can still leave unreferenced uploaded source.
      try {
        // Generated exports are UTF-8 text; batch inline tree content rather than issuing hundreds of blob writes.
        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
        const treeEntries = plan.changes.map(file => ({ path: file.path, mode: '100644', type: 'blob', content: decoder.decode(file.bytes) }));
        const tree = await request('/git/trees', 'POST', { base_tree: plan.tree, tree: treeEntries });
        if (!SHA.test(tree.sha || '')) fail('Git tree verification failed.');
        // Read the immutable generated tree and compare every raw blob identity before creating its commit.
        const verified = await request('/git/trees/' + tree.sha + '?recursive=1');
        // Allow the actual new files and ancestor folders, rather than retaining the removed 500-file allowance.
        const maxVerifiedEntries = 50000 + plan.changes.reduce((count, file) => count + file.path.split('/').length, 0);
        if (verified.truncated || !Array.isArray(verified.tree) || verified.tree.length > maxVerifiedEntries) fail('Git tree verification failed.');
        const identities = new Map(verified.tree.map(entry => [entry.path, entry]));
        if (plan.changes.some(file => identities.get(file.path)?.sha !== file.sha || identities.get(file.path)?.mode !== '100644')) fail('Git blob verification failed.');
        const result = await request('/git/commits', 'POST', { message: marker, tree: tree.sha, parents: [plan.head] });
        commit = result.sha;
        if (!SHA.test(commit || '')) fail('Git commit verification failed.');
        if (await currentHead() !== plan.head) fail('Remote branch changed.');
      } catch { fail('Git branch was not advanced by this export, but uploaded Git objects may remain. Prepare a fresh preview before retrying.'); }
      try {
        const result = await request('/git/refs/heads/' + part(c.branch), 'PATCH', { sha: commit, force: false });
        if (result.object?.sha !== commit) fail('Unverified Git result.');
      } catch (error) {
        if (error.definitive) throw error;
        // Resolve a lost ref-update response by reading once; never automatically submit the write again.
        try { if (await currentHead() === commit) return { commit, count: plan.changes.length }; } catch { /* Leave uncertain outcomes visibly unresolved. */ }
        fail('Git result is uncertain. Check the remote branch/history before any new push.');
      }
    } else {
      const actions = plan.changes.map(file => ({ action: file.action, file_path: file.path, content: file.content, encoding: 'base64',
        ...(file.action === 'update' ? { last_commit_id: file.lastCommit } : {}) }));
      try {
        const result = await request('/repository/commits', 'POST', { branch: c.branch, commit_message: marker, actions });
        commit = result.id;
        if (!SHA.test(commit || '')) fail('Unverified Git result.');
      } catch (error) {
        if (error.definitive) throw error;
        try {
          const branch = await request('/repository/branches/' + part(c.branch));
          if (SHA.test(branch.commit?.id || '') && branch.commit.message?.trim() === marker && branch.commit.parent_ids?.includes(plan.head)) return { commit: branch.commit.id, count: plan.changes.length };
        } catch { /* A failed verification is not proof that the write failed. */ }
        fail('Git result is uncertain. Check the remote branch/history before any new push.');
      }
    }
    return { commit, count: plan.changes.length };
  }

  // Construct receipt links ourselves rather than trusting a provider-returned URL.
  function commitUrl(destination, sha) {
    const c = config(destination);
    if (!SHA.test(sha || '')) fail('Invalid commit.');
    return c.server + '/' + c.repository.split('/').map(part).join('/') + (c.provider === 'github' ? '/commit/' : '/-/commit/') + sha;
  }
  globalThis.GitProvider = Object.freeze({ config, tenantDestination, origin, preview, push, commitUrl, blobSha });
})();
