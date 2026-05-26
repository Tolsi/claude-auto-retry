import { execFileSync, execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

export function buildCaptureArgs(pane, lines = 200) {
  return ['capture-pane', '-t', pane, '-p', '-S', `-${lines}`];
}

export function buildSendKeysArgs(pane, text) {
  // Use -l flag to send text literally, then C-m to send (carriage return/Enter)
  // This ensures special characters and spaces in the text are handled correctly
  if (text) {
    return [['send-keys', '-t', pane, '-l', text], ['send-keys', '-t', pane, 'C-m']];
  }
  // For empty string, just send C-m
  return [['send-keys', '-t', pane, 'C-m']];
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
  const args = buildSendKeysArgs(pane, text);
  // If buildSendKeysArgs returns nested arrays (multiple commands), execute them sequentially
  if (Array.isArray(args[0])) {
    for (const cmdArgs of args) {
      await execFileAsync('tmux', cmdArgs);
    }
  } else {
    // Single command
    await execFileAsync('tmux', args);
  }
}

export async function getPaneCommand(pane) {
  const { stdout } = await execFileAsync('tmux', buildDisplayArgs(pane, '#{pane_current_command}'));
  return stdout.trim();
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
