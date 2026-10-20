import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, basename } from 'node:path';
import { parseEnv } from 'node:util';
import { ensureEnvironment, parseArguments, composeArguments, localDatabaseUrl, runLocal } from './local.mjs';

async function fixture(t, env) {
  const root = await mkdtemp(join(tmpdir(), 'hive-local-test-'));
  t.after(async () => {
    const target = resolve(root);
    assert.equal(resolve(target, '..'), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('hive-local-test-'));
    await rm(target, { recursive: true, force: true });
  });
  await writeFile(join(root, '.env.example'), 'DATABASE_URL=postgres://hive:local-only-replace-me@localhost:5432/hive\nPOSTGRES_PASSWORD=local-only-replace-me\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n');
  if (env !== undefined) await writeFile(join(root, '.env'), env);
  return root;
}

test('first launch creates matching random local credentials and preserves subsequent edits', async t => {
  const root = await fixture(t);
  const first = await ensureEnvironment(root, 'start');
  assert.equal(first.created, true);
  assert.match(first.values.POSTGRES_PASSWORD, /^[a-f0-9]{48}$/);
  assert.match(first.values.RUNNER_API_TOKEN, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.values.DATABASE_URL, `postgres://hive:${first.values.POSTGRES_PASSWORD}@localhost:5432/hive`);
  const custom = 'POSTGRES_PASSWORD="a:b@c/$"\nGOOGLE_CLIENT_SECRET=private-value\n';
  await writeFile(join(root, '.env'), custom);
  const second = await ensureEnvironment(root, 'start');
  assert.equal(second.created, false);
  const preserved = await readFile(join(root, '.env'), 'utf8');
  assert.ok(preserved.startsWith(custom));
  assert.match(parseEnv(preserved).RUNNER_API_TOKEN, /^[A-Za-z0-9_-]{43}$/);
});

test('startup waits for Compose health and migrations and chooses NVIDIA automatically', async t => {
  const root = await fixture(t, 'POSTGRES_PASSWORD=a:b@c/$\n');
  const calls = [], messages = [];
  await runLocal(['start'], { root, environment: {}, log: message => messages.push(message), run: async (command, args, options) => {
    calls.push({ command, args, options });
    return 0;
  } });
  assert.deepEqual(calls.map(call => call.command), ['docker', 'docker', 'nvidia-smi', 'docker']);
  const final = calls.at(-1);
  assert.ok(final.args.includes('compose.local.yaml'));
  assert.ok(final.args.includes('compose.gpu.yaml'));
  assert.ok(final.args.includes('--wait'));
  assert.equal(final.options.env.HIVE_LOCAL_DATABASE_URL, 'postgres://hive:a%3Ab%40c%2F%24@db:5432/hive');
  assert.match(final.options.env.RUNNER_API_TOKEN, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(messages.some(message => message.includes('Google sign-in is not configured')));
  assert.ok(messages.every(message => !message.includes('a:b@c/$')));
});

test('missing NVIDIA tools fall back to CPU; explicit CPU skips detection', async t => {
  const root = await fixture(t, 'POSTGRES_PASSWORD=local-password\n');
  for (const args of [['start'], ['start', '--cpu']]) {
    const calls = [];
    await runLocal(args, { root, environment: {}, log: () => {}, run: async (command, commandArgs) => {
      calls.push({ command, args: commandArgs });
      if (command === 'nvidia-smi') throw new Error('Unavailable');
      return 0;
    } });
    assert.equal(calls.at(-1).args.includes('compose.gpu.yaml'), false);
    if (args.length > 1) assert.equal(calls.some(call => call.command === 'nvidia-smi'), false);
  }
});

test('explicit GPU does not probe host tools', async t => {
  const root = await fixture(t, 'POSTGRES_PASSWORD=local-password\n');
  const calls = [];
  await runLocal(['start', '--gpu'], { root, environment: {}, log: () => {}, run: async (command, args) => {
    calls.push({ command, args }); return 0;
  } });
  assert.ok(calls.at(-1).args.includes('compose.gpu.yaml'));
  assert.equal(calls.some(call => call.command === 'nvidia-smi'), false);
});

test('stop removes project services while preserving volumes and works without .env', async t => {
  const root = await fixture(t);
  const calls = [];
  await runLocal(['stop'], { root, environment: {}, log: () => {}, run: async (command, args) => {
    calls.push({ command, args }); return 0;
  } });
  const args = calls.at(-1).args;
  assert.ok(args.includes('down'));
  assert.ok(args.includes('--remove-orphans'));
  assert.equal(args.includes('--volumes'), false);
  assert.equal(args.includes('-v'), false);
  assert.equal(args.includes('compose.local.yaml'), false);
  await assert.rejects(readFile(join(root, '.env')), { code: 'ENOENT' });
});

test('Docker unavailability fails before writing config or starting services', async t => {
  const root = await fixture(t);
  let calls = 0;
  await assert.rejects(runLocal(['start'], { root, environment: {}, log: () => {}, run: async () => ++calls === 1 ? 0 : 1 }), /Start Docker/);
  assert.equal(calls, 2);
  await assert.rejects(readFile(join(root, '.env')), { code: 'ENOENT' });
});

test('startup failure reports cleanup command and does not report ready', async t => {
  const root = await fixture(t, 'POSTGRES_PASSWORD=local-password\n');
  const messages = [];
  let calls = 0;
  await assert.rejects(runLocal(['start', '--cpu'], { root, environment: {}, log: message => messages.push(message), run: async () => ++calls < 3 ? 0 : 1 }), /local:stop/);
  assert.equal(messages.some(message => message.includes('Hive is ready')), false);
});

test('invalid arguments and missing passwords are rejected', () => {
  for (const args of [[], ['delete'], ['start', '--bad'], ['start', '--gpu', '--cpu'], ['stop', '--gpu']]) {
    assert.throws(() => parseArguments(args));
  }
  assert.throws(() => localDatabaseUrl(''), /POSTGRES_PASSWORD/);
  assert.deepEqual(composeArguments('stop', false).slice(-2), ['down', '--remove-orphans']);
});
