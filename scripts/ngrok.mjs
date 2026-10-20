import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ngrokApi = 'http://127.0.0.1:4040/api/tunnels';
const processFile = root => resolve(root, '.data', 'local-ngrok.json');
const pause = milliseconds => new Promise(resolvePause => setTimeout(resolvePause, milliseconds));

function tunnelForApi(tunnels) {
  return tunnels.find(tunnel => {
    try {
      const address = new URL(tunnel.config?.addr);
      return address.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(address.hostname) && address.port === '3001';
    } catch {
      return false;
    }
  });
}

async function listTunnels(fetcher) {
  const response = await fetcher(ngrokApi, { signal: AbortSignal.timeout(800) });
  if (!response.ok) throw new Error('ngrok local API returned an error');
  const body = await response.json();
  if (!Array.isArray(body.tunnels)) throw new Error('ngrok local API returned an invalid response');
  return body.tunnels;
}

export async function startNgrok(root, {
  spawnProcess = spawn,
  fetcher = fetch,
  wait = pause,
  timeoutMs = 20_000,
} = {}) {
  let tunnels;
  try {
    tunnels = await listTunnels(fetcher);
  } catch {
    tunnels = null;
  }
  if (tunnels) {
    const existing = tunnelForApi(tunnels);
    if (existing?.public_url?.startsWith('https://')) {
      let saved;
      try { saved = JSON.parse(await readFile(processFile(root), 'utf8')); } catch {}
      return { publicUrl: existing.public_url, owned: Boolean(saved?.pid && saved.publicUrl === existing.public_url && saved.tunnelId === existing.ID), reused: true };
    }
    throw new Error('ngrok is already running but has no tunnel for port 3001. Stop that ngrok session or add the API tunnel, then retry.');
  }

  const child = spawnProcess('ngrok', ['http', '3001'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  await new Promise((resolveSpawn, rejectSpawn) => {
    child.once('spawn', resolveSpawn);
    child.once('error', rejectSpawn);
  }).catch(error => {
    if (error.code === 'ENOENT') throw new Error('ngrok is not installed. Install the ngrok agent and add your authtoken, then retry npm run local.');
    throw error;
  });
  child.unref();

  const metadata = { pid: child.pid, publicUrl: null, tunnelId: null };
  await mkdir(resolve(root, '.data'), { recursive: true });
  await writeFile(processFile(root), JSON.stringify(metadata), { mode: 0o600 });
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) break;
    try {
      const active = tunnelForApi(await listTunnels(fetcher));
      if (active?.public_url?.startsWith('https://')) {
        metadata.publicUrl = active.public_url;
        metadata.tunnelId = active.ID;
        await writeFile(processFile(root), JSON.stringify(metadata), { mode: 0o600 });
        return { publicUrl: active.public_url, owned: true, reused: false };
      }
    } catch {}
    await wait(250);
  }
  try { child.kill(); } catch {}
  await rm(processFile(root), { force: true });
  throw new Error('ngrok did not start a public HTTPS tunnel. Check `ngrok config add-authtoken` and retry.');
}

export async function stopNgrok(root, { fetcher = fetch, kill = process.kill } = {}) {
  let metadata;
  try { metadata = JSON.parse(await readFile(processFile(root), 'utf8')); } catch { return { stopped: false, owned: false }; }
  if (!Number.isInteger(metadata.pid) || metadata.pid <= 0 || !metadata.publicUrl || !metadata.tunnelId) {
    await rm(processFile(root), { force: true });
    return { stopped: false, owned: true };
  }
  try {
    const active = tunnelForApi(await listTunnels(fetcher));
    if (active?.public_url === metadata.publicUrl && active.ID === metadata.tunnelId) kill(metadata.pid);
  } catch {}
  await rm(processFile(root), { force: true });
  return { stopped: true, owned: true };
}
