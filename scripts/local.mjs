import { randomBytes } from 'node:crypto';
import { appendFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { startNgrok, stopNgrok } from './ngrok.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArguments(args) {
  const [action, ...options] = args;
  if (!['start', 'stop'].includes(action) || options.some(option => !['--cpu', '--gpu'].includes(option)) ||
      options.length > 1 || (action === 'stop' && options.length)) {
    throw new Error('Use npm run local [-- --cpu | -- --gpu] or npm run local:stop.');
  }
  return { action, device: options[0]?.slice(2) ?? 'auto' };
}

export async function ensureEnvironment(root, action) {
  const path = resolve(root, '.env');
  try {
    let content = await readFile(path, 'utf8');
    let values = parseEnv(content);
    if (action === 'start' && !values.RUNNER_API_TOKEN) {
      const token = randomBytes(32).toString('base64url');
      const tokenLine = `RUNNER_API_TOKEN=${token}\n`;
      await appendFile(path, `${content.endsWith('\n') || !content ? '' : '\n'}${tokenLine}`, { mode: 0o600 });
      values = { ...values, RUNNER_API_TOKEN: token };
    }
    return { values, created: false };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (action === 'stop') return { values: {}, created: false };
    const password = randomBytes(24).toString('hex');
    const template = await readFile(resolve(root, '.env.example'), 'utf8');
    let content = template.replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${password}`)
      .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=postgres://hive:${password}@localhost:5432/hive`)
      .replace(/^RUNNER_API_TOKEN=.*$/m, `RUNNER_API_TOKEN=${randomBytes(32).toString('base64url')}`);
    if (!/^RUNNER_API_TOKEN=/m.test(content)) content += `${content.endsWith('\n') ? '' : '\n'}RUNNER_API_TOKEN=${randomBytes(32).toString('base64url')}\n`;
    // Exclusive creation preserves an existing file, including another launcher's config.
    try {
      await writeFile(path, content, { flag: 'wx', mode: 0o600 });
      return { values: parseEnv(content), created: true };
    } catch (writeError) {
      if (writeError.code !== 'EEXIST') throw writeError;
      return { values: parseEnv(await readFile(path, 'utf8')), created: false };
    }
  }
}

export function composeArguments(action, gpu) {
  // Stop doesn't need the app overlay: Compose down stops all services in this project,
  // including the app containers, without deleting volumes or host artifacts.
  const args = ['compose', '-f', 'compose.yaml'];
  if (action === 'start') args.push('-f', 'compose.local.yaml');
  if (gpu && action === 'start') args.push('-f', 'compose.gpu.yaml');
  args.push('--profile', 'zimage');
  if (action === 'start') args.push('up', '--build', '--detach', '--wait', '--wait-timeout', '180');
  else args.push('down', '--remove-orphans');
  return args;
}

export function localDatabaseUrl(password) {
  if (!password) throw new Error('Set POSTGRES_PASSWORD in .env before starting Hive.');
  return `postgres://hive:${encodeURIComponent(password)}@db:5432/hive`;
}

export async function runProcess(command, args, { root, env, quiet = false }) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: quiet ? 'ignore' : 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => resolveExit(code ?? 1));
  });
}

export async function runLocal(args, {
  root = repositoryRoot,
  environment = process.env,
  run = runProcess,
  startTunnel = startNgrok,
  stopTunnel = stopNgrok,
  log = console.log,
} = {}) {
  const { action, device } = parseArguments(args);
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Hive local commands require Node.js 22 or newer.');
  if (await run('docker', ['compose', 'version'], { root, env: environment, quiet: true }) !== 0) {
    throw new Error('Install Docker with Docker Compose 2.24.4 or newer.');
  }
  if (await run('docker', ['info'], { root, env: environment, quiet: true }) !== 0) {
    throw new Error('Start Docker Desktop (Linux containers) or Docker Engine, then retry.');
  }
  const { values, created } = await ensureEnvironment(root, action);
  if (created) log('Created .env with random local credentials. Add your Google OAuth credentials for sign-in.');
  const env = { ...values, ...environment };
  if (!env.RUNNER_API_TOKEN) env.RUNNER_API_TOKEN = randomBytes(32).toString('base64url');
  // A stop remains possible even if .env has been removed; this value is not used to connect.
  if (action === 'stop' && !env.POSTGRES_PASSWORD) env.POSTGRES_PASSWORD = 'unused-for-stop';
  let gpu = device === 'gpu';
  if (action === 'start') {
    if (device === 'auto') {
      try { gpu = await run('nvidia-smi', ['-L'], { root, env, quiet: true }) === 0; }
      catch { gpu = false; }
    }
    env.HIVE_LOCAL_DATABASE_URL = localDatabaseUrl(env.POSTGRES_PASSWORD);
    await mkdir(resolve(root, '.data/artifacts'), { recursive: true });
    const tunnel = await startTunnel(root);
    env.WEBHOOK_PUBLIC_API_URL = tunnel.publicUrl;
    env.INSTAGRAM_PUBLIC_API_URL = tunnel.publicUrl;
    env.INSTAGRAM_REDIRECT_URI = `${tunnel.publicUrl}/api/instagram/oauth/callback`;
    log(`${tunnel.reused ? 'Using' : 'Started'} ngrok API tunnel: ${tunnel.publicUrl}`);
    log(`Register this Instagram callback in Meta: ${env.INSTAGRAM_REDIRECT_URI}`);
    if (await run('docker', composeArguments(action, gpu), { root, env }) !== 0) {
      if (tunnel.owned) await stopTunnel(root);
      throw new Error('Startup failed. Check the Docker output above. Free ports 3001, 5173, 5432 and 8188; use --cpu if GPU passthrough is unavailable. Partial services can be stopped with npm run local:stop.');
    }
    log('Hive is ready at http://localhost:5173. Stop Hive and its ngrok tunnel with npm run local:stop.');
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      log('Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env and rerun npm run local.');
    }
    log('Download models from the Models view before use; runner readiness does not guarantee enough memory for inference.');
    return;
  }
  log('Stopping Hive services…');
  if (await run('docker', composeArguments(action, gpu), { root, env }) !== 0) {
    throw new Error('Stop failed. Check Docker output above and retry npm run local:stop.');
  }
  const tunnel = await stopTunnel(root);
  log(tunnel.stopped ? 'Hive and its ngrok tunnel stopped.' : 'Hive stopped. Any ngrok tunnel started outside npm run local was left running.');
  log('Database, generated pictures, and model cache were preserved.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLocal(process.argv.slice(2)).catch(error => {
    // Command errors never include env contents or database connection strings.
    console.error(error.code === 'ENOENT' ? 'Required command or setup file was not found. Check Node.js, Docker, and the repository files.' : error.message);
    process.exitCode = 1;
  });
}
