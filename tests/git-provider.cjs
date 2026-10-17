'use strict';

// Exercise real provider planning/requests against deterministic in-memory Git services only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const sandbox = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, URL, AbortController, setTimeout, clearTimeout, btoa, fetch: () => { throw Error('Live network forbidden'); } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../git-provider.js'), 'utf8'), sandbox);
const git = sandbox.GitProvider;
const sha = value => createHash('sha1').update(value).digest('hex');
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const head = sha('head'); const tree = sha('tree'); const changed = sha('changed'); const committed = sha('commit');
const destination = provider => ({ provider, server: 'https://git.example.edu', repository: provider === 'github' ? 'owner/repo' : 'group/subgroup/project', branch: 'exports/test', folder: 'DataConnect/Test' });
const files = [{ path: 'Package/A_v1.json', bytes: new TextEncoder().encode('{"name":"synthetic"}\r\n') }, { path: 'Package/B.js', bytes: new TextEncoder().encode('// unchanged\n') }];

// Return only known metadata; every unexpected endpoint or request shape fails the fixture.
function service(provider, flags = {}) {
  const state = { head, writes: [], calls: [], lastBody: null, uploaded: [], message: '' };
  const entries = [{ path: 'DataConnect', type: 'tree', mode: '040000', sha: tree }, { path: 'DataConnect/Test', type: 'tree', mode: '040000', sha: tree },
    { path: 'DataConnect/Test/Package', type: 'tree', mode: '040000', sha: tree },
    { path: 'DataConnect/Test/Package/B.js', type: 'blob', mode: '100644', sha: blob(files[1].bytes) },
    { path: 'unrelated/keep.txt', type: 'blob', mode: '100644', sha: sha('keep') }, ...(flags.entries || [])];
  if (flags.update) entries.push({ path: 'DataConnect/Test/Package/A_v1.json', type: 'blob', mode: '100644', sha: sha('old') });
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.equal(url.includes('SYNTHETIC_TOKEN'), false);
    assert.equal(provider === 'github' ? options.headers.Authorization : options.headers['PRIVATE-TOKEN'], provider === 'github' ? 'Bearer SYNTHETIC_TOKEN' : 'SYNTHETIC_TOKEN');
    const expected = provider === 'github' ? 'https://api.github.com/repos/owner/repo' : 'https://git.example.edu/api/v4/projects/group%2Fsubgroup%2Fproject';
    assert.ok(url.startsWith(expected));
    const route = url.slice(expected.length); const method = options.method;
    const body = options.body && JSON.parse(options.body);
    state.calls.push({ route, method });
    const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (flags.redirect) throw Error('SYNTHETIC_TOKEN secret server error');
    if (flags.denied) return response({ error: 'SYNTHETIC_TOKEN' }, 403);
    if (method === 'GET' && route === '') return response(flags.visibilityMissing ? {} : provider === 'github' ? { private: true } : { visibility: 'private' });
    if (method === 'GET' && route.startsWith('/git/ref/heads/')) return response({ ref: 'refs/heads/exports/test', object: { sha: state.head } });
    if (method === 'GET' && route.startsWith('/git/commits/')) return response({ tree: { sha: tree } });
    if (method === 'GET' && route.startsWith('/git/trees/')) return response({ tree: route.includes(sha('new-tree')) ? state.newTree : entries, truncated: flags.truncated === true });
    if (method === 'GET' && route.startsWith('/repository/branches/')) return response({ name: 'exports/test', commit: { id: state.head, message: state.message, parent_ids: [head] } });
    if (method === 'GET' && route.startsWith('/repository/tree?')) {
      const page = Number(new URL(url).searchParams.get('page'));
      assert.equal(new URL(url).searchParams.get('ref'), head);
      const rows = flags.paginate ? [...entries, ...Array.from({ length: 120 }, (_, i) => ({ path: 'Other/' + i, type: 'blob', mode: '100644', sha: sha(String(i)) }))] : entries;
      return response(rows.slice((page - 1) * 100, page * 100).map(entry => ({ ...entry, id: entry.sha })));
    }
    if (method === 'HEAD' && route.startsWith('/repository/files/')) return new Response(null, { status: 200, headers: { 'X-Gitlab-Blob-Id': sha('old'), 'X-Gitlab-Last-Commit-Id': sha('last-file-commit') } });
    if (!['POST', 'PATCH'].includes(method)) throw Error('Unexpected read: ' + route);
    state.writes.push({ route, body });
    assert.equal(options.body.includes('SYNTHETIC_TOKEN'), false);
    if (route === '/git/blobs') { const actual = blob(Buffer.from(body.content, 'base64')); state.uploaded.push(actual); return response({ sha: actual }, 201); }
    if (route === '/git/trees') {
      assert.equal(body.base_tree, tree); assert.equal(body.tree.length, 1); assert.equal(body.tree[0].path, 'DataConnect/Test/Package/A_v1.json');
      assert.equal(body.tree[0].content, flags.expectedText || Buffer.from(files[0].bytes).toString());
      state.newTree = body.tree.map(file => ({ path: file.path, type: 'blob', mode: file.mode, sha: blob(Buffer.from(file.content)) }));
      state.uploaded.push(...state.newTree.map(file => file.sha));
      return response({ sha: sha('new-tree') }, 201);
    }
    if (route === '/git/commits') { assert.deepEqual(body.parents, [head]); state.message = body.message; return response({ sha: committed }, 201); }
    if (route.startsWith('/git/refs/heads/')) {
      assert.equal(body.force, false); assert.equal(body.sha, committed);
      if (flags.conflict) { state.head = changed; return response({ error: 'synthetic private failure' }, 422); }
      state.head = committed;
      if (flags.serverError) return response({ error: 'SYNTHETIC_TOKEN' }, 503);
      if (flags.lost) throw Error('Lost synthetic write response');
      return response({ object: { sha: committed } });
    }
    if (route === '/repository/commits') {
      assert.equal(body.branch, 'exports/test'); assert.equal(body.actions.length, 1);
      assert.equal(body.actions[0].action, flags.update ? 'update' : 'create');
      if (flags.update) assert.equal(body.actions[0].last_commit_id, sha('last-file-commit'));
      assert.equal(body.actions[0].file_path, 'DataConnect/Test/Package/A_v1.json');
      assert.equal(Buffer.from(body.actions[0].content, 'base64').toString(), Buffer.from(files[0].bytes).toString());
      state.head = committed; state.message = body.commit_message;
      if (flags.serverError) return response({ error: 'SYNTHETIC_TOKEN' }, 503);
      if (flags.lost) throw Error('Lost synthetic write response');
      return response({ id: committed }, 201);
    }
    throw Error('Unexpected write: ' + route);
  };
  return { state, fetcher };
}

(async () => {
  // Reject credentials/paths in origins and refs that could select unintended API operations.
  for (const server of ['http://git.example.edu', 'https://user:pass@git.example.edu', 'https://git.example.edu/subpath', 'https://127.0.0.1', 'https://localhost', 'https://git.example.edu:8443', 'https://git.example.edu?x=1']) assert.throws(() => git.config({ ...destination('gitlab'), server }));
  for (const branch of ['../main', 'refs/../main', '-main', 'a.lock', 'a@{b', 'a b', 'a//b']) assert.throws(() => git.config({ ...destination('github'), branch }));
  for (const folder of ['', '../Data', '.github/workflows', 'Data/.git', '/Data', 'Data//Test']) assert.throws(() => git.config({ ...destination('github'), folder }));
  assert.equal(await git.blobSha(files[0].bytes), blob(files[0].bytes));

  for (const provider of ['github', 'gitlab']) {
    for (const flags of [{}, { lost: true }, { serverError: true }, ...(provider === 'gitlab' ? [{ update: true, paginate: true }] : [])]) {
      const fake = service(provider, flags);
      const plan = await git.preview(destination(provider), files, 'SYNTHETIC_TOKEN', fake);
      assert.equal(plan.changes.length, 1); assert.equal(plan.visibility, 'private'); assert.equal(fake.state.writes.length, 0);
      const result = await git.push(plan, 'SYNTHETIC_TOKEN', fake);
      assert.equal(result.commit, committed); assert.equal(result.count, 1);
      // Both providers describe changed records while retaining a unique lost-response reconciliation marker.
      assert.equal(fake.state.message.split('\n')[0], `Integration Navigator: ${flags.update ? 0 : 1} added, ${flags.update ? 1 : 0} updated files`);
      assert.equal(fake.state.message.includes('DataConnect/'), false, 'File paths belong in the Git diff, not the commit message');
      assert.equal(fake.state.message.includes('B.js'), false, 'Unchanged records are not listed');
      assert.match(fake.state.message, /\nExport-ID: [a-f\d-]{36}$/u);
      assert.equal(fake.state.writes.filter(x => x.route.includes('/refs/') || x.route === '/repository/commits').length, 1, 'Lost responses must not replay writes');
      assert.ok(git.commitUrl(destination(provider), result.commit).startsWith(provider === 'github' ? 'https://github.com/owner/repo/commit/' : 'https://git.example.edu/group/subgroup/project/-/commit/'));
    }
    // A changed head is detected before any writes, while no-op selections produce no commit.
    const conflict = service(provider); const plan = await git.preview(destination(provider), files, 'SYNTHETIC_TOKEN', conflict); conflict.state.head = changed;
    await assert.rejects(git.push(plan, 'SYNTHETIC_TOKEN', conflict), /Remote branch changed/); assert.equal(conflict.state.writes.length, 0);
    const noop = service(provider); const same = await git.preview(destination(provider), [files[1]], 'SYNTHETIC_TOKEN', noop);
    assert.equal(same.changes.length, 0); assert.equal((await git.push(same, 'SYNTHETIC_TOKEN', noop)).count, 0); assert.equal(noop.state.writes.length, 0);
    // Symlinks/executable files, folder collisions, cancellation, and denied responses fail closed.
    for (const entry of [{ path: 'DataConnect/Test/Package/A_v1.json', type: 'blob', mode: '120000', sha: tree }, { path: 'DataConnect/Test/Package/A_v1.json', type: 'tree', mode: '040000', sha: tree }]) {
      await assert.rejects(git.preview(destination(provider), files, 'SYNTHETIC_TOKEN', service(provider, { entries: [entry] })), /collides/);
    }
    const denied = service(provider, { denied: true }); await assert.rejects(git.preview(destination(provider), files, 'SYNTHETIC_TOKEN', denied), error => /denied/.test(error.message) && !error.message.includes('SYNTHETIC_TOKEN'));
    await assert.rejects(git.preview(destination(provider), files, 'SYNTHETIC_TOKEN', service(provider, { visibilityMissing: true })), /visibility/);
    const abort = new AbortController(); abort.abort(); const stopped = service(provider);
    await assert.rejects(git.preview(destination(provider), files, 'SYNTHETIC_TOKEN', { ...stopped, signal: abort.signal }), /cancelled/); assert.equal(stopped.state.calls.length, 0);
  }
  const rejected = service('github', { conflict: true }); const plan = await git.preview(destination('github'), files, 'SYNTHETIC_TOKEN', rejected);
  await assert.rejects(git.push(plan, 'SYNTHETIC_TOKEN', rejected), /rejected/); assert.equal(rejected.state.uploaded.length, 1);
  await assert.rejects(git.preview(destination('github'), files, 'SYNTHETIC_TOKEN', service('github', { truncated: true })), /too large/);
  await assert.rejects(git.preview(destination('github'), Array.from({ length: 501 }, () => files[0]), 'SYNTHETIC_TOKEN', service('github')), /1–500/);
  await assert.rejects(git.preview(destination('github'), [files[0], files[0]], 'SYNTHETIC_TOKEN', service('github')), /collide/);
  // An original JavaScript UTF-8 BOM must not be silently stripped by the inline tree text conversion.
  const withBom = { ...files[0], bytes: new TextEncoder().encode('\ufeff// Synthetic source\r\n') };
  const bomService = service('github', { expectedText: '\ufeff// Synthetic source\r\n' });
  const bomPlan = await git.preview(destination('github'), [withBom], 'SYNTHETIC_TOKEN', bomService);
  assert.equal((await git.push(bomPlan, 'SYNTHETIC_TOKEN', bomService)).commit, committed);
  console.log('PASS Git providers: both APIs, self-hosted origins, bytes/no-op, add/update-only, pagination, per-file guards, conflicts, lost responses without replay, collisions, limits, cancellation, and secret-safe errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
