import { appendFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_LOG_DIR = join(homedir(), '.claude-auto-retry', 'logs');
const MAX_AGE_DAYS = 7;
const CLEANUP_INTERVAL_MS = 3600_000;
let lastCleanup = 0;

const pad = (n) => String(n).padStart(2, '0');

// Local-time date string (YYYY-MM-DD) for log file names. Using local time
// (not UTC) keeps log rotation aligned with the user's calendar day.
export function localDateString(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timestamp() {
  const d = new Date();
  return `${localDateString(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Strip control characters (except none — entries are single-line) so a
// crafted rate-limit message captured from the pane can't forge log lines
// or rewrite the terminal when the log is `cat`-ed. Covers \r, \n, \t, \b,
// and other C0/C1 control bytes.
function sanitize(message) {
  // eslint-disable-next-line no-control-regex
  return String(message).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
}

function todayFile(dir) {
  return join(dir, `${localDateString()}.log`);
}

async function cleanup(dir) {
  if (Date.now() - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = Date.now();
  try {
    const files = await readdir(dir);
    const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000;
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const s = await stat(join(dir, file));
      if (s.mtimeMs < cutoff) await unlink(join(dir, file));
    }
  } catch { /* ignore */ }
}

export function createLogger(dir = DEFAULT_LOG_DIR) {
  let dirCreated = false;
  async function ensureDir() {
    if (!dirCreated) { await mkdir(dir, { recursive: true }); dirCreated = true; }
  }
  async function log(level, message) {
    await ensureDir();
    await appendFile(todayFile(dir), `[${timestamp()}] [${level}] ${sanitize(message)}\n`);
    cleanup(dir);
  }
  return {
    info: (msg) => log('INFO', msg),
    warn: (msg) => log('WARN', msg),
    error: (msg) => log('ERROR', msg),
  };
}
