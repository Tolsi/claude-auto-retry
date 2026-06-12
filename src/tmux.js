import { execFileSync, execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

const SEND_ENTER_DELAY_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Submit delay: when sending a message to a TUI like Claude Code (Ink-based),
// the text and the submitting Enter must be sent as TWO separate tmux send-keys
// calls with a brief pause between them. Without the pause, Ink on Linux often:
//   - interprets the Enter as a newline within a bracketed-paste burst and just
//     inserts "\n" into the input box instead of submitting (most common case)
//   - or processes the Enter before React reconciliation has incorporated the
//     text into input state, dropping the submit
// 150ms is empirically reliable across Linux + macOS for Claude Code.
export const SUBMIT_DELAY_MS = 150;

export function buildCaptureArgs(pane, lines = 200) {
  return ['capture-pane', '-t', pane, '-p', '-S', `-${lines}`];
}

/**
 * @deprecated Single-shot send-keys (text + Enter atomically) races with the
 * Claude TUI paste-heuristic: when text + \r arrive in the same pty write,
 * \r is treated as a paste-newline rather than a submit. Retries pile into
 * the input box without ever being submitted. Use buildSendLiteralArgs +
 * buildSendEnterArgs with a delay between them instead.
 */
export function buildSendKeysArgs(pane, text) {
  return ['send-keys', '-t', pane, text, 'Enter'];
}

export function buildSendLiteralArgs(pane, text) {
  return ['send-keys', '-t', pane, '-l', text];
}

// Split form: text-only (no Enter), no -l flag.
export function buildSendTextArgs(pane, text) {
  return ['send-keys', '-t', pane, text];
}

// Split form: bare Enter.
export function buildSendEnterArgs(pane) {
  return ['send-keys', '-t', pane, 'Enter'];
}

export function buildDisplayArgs(pane, format) {
  return ['display-message', '-t', pane, '-p', format];
}

export function parseTmuxVersion(versionString) {
  const match = versionString.match(/tmux\s+(\d+\.\d+)/);
  return match ? parseFloat(match[1]) : 0;
}

export function getTmuxVersion() {
  try {
    return parseTmuxVersion(execFileSync('tmux', ['-V'], { encoding: 'utf-8' }).trim());
  } catch { return 0; }
}

export async function capturePane(pane, lines = 200) {
  const { stdout } = await execFileAsync('tmux', buildCaptureArgs(pane, lines));
  return stdout;
}

export async function sendKeys(pane, text) {
  await execFileAsync('tmux', buildSendLiteralArgs(pane, text));
  await sleep(SEND_ENTER_DELAY_MS);
  await execFileAsync('tmux', buildSendEnterArgs(pane));
}

export async function sendEnter(pane) {
  await execFileAsync('tmux', buildSendEnterArgs(pane));
}

export async function sendKeySequence(pane, keys, delayMs = 250) {
  for (let i = 0; i < keys.length; i++) {
    await execFileAsync('tmux', ['send-keys', '-t', pane, keys[i]]);
    if (i < keys.length - 1) await sleep(delayMs);
  }
}

export async function getPaneCommand(pane) {
  const { stdout } = await execFileAsync('tmux', buildDisplayArgs(pane, '#{pane_current_command}'));
  return stdout.trim();
}

export function buildSetWindowOptionArgs(target, option, value) {
  return ['set-window-option', '-t', target, option, value];
}

export async function isProcessForeground(pid) {
  try {
    const { stdout } = await execFileAsync('ps', ['-o', 'stat=', '-p', String(pid)]);
    return stdout.trim().includes('+');
  } catch {
    return null;
  }
}

export function isInsideTmux() { return !!process.env.TMUX; }
export function getCurrentPane() { return process.env.TMUX_PANE || null; }
