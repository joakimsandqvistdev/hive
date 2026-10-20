import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { startNgrok, stopNgrok } from './ngrok.mjs';

const url = 'https://hive.ngrok.app';
const activeTunnel = { ID: 'tunnel-id', public_url: url, config: { addr: 'http://localhost:3001' } };

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'hive-ngrok-test-'));
  t.after(async () => {
    const target = resolve(root);
    assert.equal(resolve(target, '..'), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('hive-ngrok-test-'));
    await rm(target, { recursive: true, force: true });
  });
  return root;
}

test('reuses an existing ngrok tunnel to port 3001 without claiming ownership', async t => {
  const root = await fixture(t);
  let spawned = false;
  const result = await startNgrok(root, {
    fetcher: async () => Response.json({ tunnels: [activeTunnel] }),
    spawnProcess: () => { spawned = true; throw new Error('should not spawn'); },
  });
  assert.deepEqual(result, { publicUrl: url, owned: false, reused: true });
  assert.equal(spawned, false);
});

test('does not start a duplicate tunnel when ngrok already serves another port', async t => {
  const root = await fixture(t);
  await assert.rejects(startNgrok(root, {
    fetcher: async () => Response.json({ tunnels: [{ public_url: url, config: { addr: 'http://localhost:8080' } }] }),
    spawnProcess: () => { throw new Error('should not spawn'); },
  }), /no tunnel for port 3001/);
});

test('starts ngrok and records only its managed process', async t => {
  const root = await fixture(t);
  const child = new EventEmitter();
  Object.assign(child, { pid: 12345, exitCode: null, signalCode: null, unref() {}, kill() { this.exitCode = 0; } });
  let requests = 0;
  const result = await startNgrok(root, {
    spawnProcess: (command, args, options) => {
      assert.equal(command, 'ngrok');
      assert.deepEqual(args, ['http', '3001']);
      assert.equal(options.detached, true);
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
    fetcher: async () => {
      requests += 1;
      if (requests === 1) throw new Error('not running');
      return Response.json({ tunnels: [activeTunnel] });
    },
  });
  assert.deepEqual(result, { publicUrl: url, owned: true, reused: false });
  assert.deepEqual(JSON.parse(await readFile(join(root, '.data', 'local-ngrok.json'), 'utf8')), { pid: 12345, publicUrl: url, tunnelId: 'tunnel-id' });
});

test('stop terminates only the managed tunnel matching its saved public URL', async t => {
  const root = await fixture(t);
  await mkdir(join(root, '.data'));
  await writeFile(join(root, '.data', 'local-ngrok.json'), JSON.stringify({ pid: 12345, publicUrl: url, tunnelId: 'tunnel-id' }));
  const killed = [];
  const result = await stopNgrok(root, {
    fetcher: async () => Response.json({ tunnels: [activeTunnel] }),
    kill: pid => killed.push(pid),
  });
  assert.deepEqual(result, { stopped: true, owned: true });
  assert.deepEqual(killed, [12345]);
});

test('stop leaves manually started ngrok sessions alone', async t => {
  const root = await fixture(t);
  const result = await stopNgrok(root, { kill: () => assert.fail('must not kill unmanaged process') });
  assert.deepEqual(result, { stopped: false, owned: false });
});
