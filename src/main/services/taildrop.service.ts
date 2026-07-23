import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  TaildropAvailability,
  TaildropReceiveResult,
  TaildropTarget,
} from '@shared/types/taildrop';

const execFileAsync = promisify(execFile);
const TAILSCALE_COMMAND = 'tailscale';
const MACOS_TAILSCALE_COMMANDS = [
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  '/opt/homebrew/bin/tailscale',
  '/usr/local/bin/tailscale',
];
const MAX_OUTPUT_BYTES = 1024 * 128;
const COMMAND_TIMEOUT_MS = 60_000;
const SEND_TIMEOUT_MS = 1000 * 60 * 60;
const TARGET_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

interface TailscaleStatusPeer {
  DNSName?: string;
  HostName?: string;
  TailscaleIPs?: string[];
  Online?: boolean;
  TaildropTarget?: number;
  NoFileSharingReason?: string;
  PrimaryRoutes?: string[];
}

interface TailscaleStatus {
  BackendState?: string;
  MagicDNSSuffix?: string;
  Peer?: Record<string, TailscaleStatusPeer>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Tailscale command failed';
}

function getCommandOutput(error: unknown): string {
  const maybeOutput = error as { stdout?: unknown; stderr?: unknown };
  const stderr = typeof maybeOutput.stderr === 'string' ? maybeOutput.stderr.trim() : '';
  const stdout = typeof maybeOutput.stdout === 'string' ? maybeOutput.stdout.trim() : '';
  return stderr || stdout || getErrorMessage(error);
}

function isMissingCommandError(error: unknown): boolean {
  const maybeError = error as { code?: unknown };
  return maybeError.code === 'ENOENT' || /ENOENT|not found|no such file/i.test(getCommandOutput(error));
}

function getCommandCandidates(): string[] {
  return process.platform === 'darwin'
    ? [TAILSCALE_COMMAND, ...MACOS_TAILSCALE_COMMANDS]
    : [TAILSCALE_COMMAND];
}

/**
 * Run tailscale with a minimal environment so secrets present in the parent
 * process environment (tokens, credentials) are never leaked to the child.
 */
function getTailscaleEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SHLVL: process.env.SHLVL ?? '1',
  };
  if (process.env.LANG) env.LANG = process.env.LANG;
  if (process.env.LC_ALL) env.LC_ALL = process.env.LC_ALL;
  if (process.platform === 'win32') {
    if (process.env.SYSTEMROOT) env.SYSTEMROOT = process.env.SYSTEMROOT;
    if (process.env.ComSpec) env.ComSpec = process.env.ComSpec;
  }
  return env;
}

function parseTargetLine(line: string): TaildropTarget | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const [address, name, detail] = trimmed.split(/\t+/);
  if (!address || !name) return null;

  const normalizedDetail = detail?.trim();
  const isOffline = normalizedDetail?.toLowerCase().includes('offline') ?? false;

  return {
    id: name,
    name,
    address,
    status: isOffline ? 'offline' : 'available',
    detail: normalizedDetail || undefined,
  };
}

function getStatusTargetName(peer: TailscaleStatusPeer, magicDnsSuffix?: string): string | null {
  const dnsName = peer.DNSName?.trim().replace(/\.$/, '');
  if (dnsName) {
    const suffix = magicDnsSuffix ? `.${magicDnsSuffix}` : '';
    return suffix && dnsName.endsWith(suffix) ? dnsName.slice(0, -suffix.length) : dnsName;
  }

  return peer.HostName?.trim() || null;
}

function getStatusTargetDetail(peer: TailscaleStatusPeer): string | undefined {
  if (peer.Online === false) return 'offline';
  return peer.PrimaryRoutes?.length ? `routes: ${peer.PrimaryRoutes.join(', ')}` : undefined;
}

function parseStatusTarget(peer: TailscaleStatusPeer, magicDnsSuffix?: string): TaildropTarget | null {
  if (!peer.TaildropTarget || peer.NoFileSharingReason) return null;

  const name = getStatusTargetName(peer, magicDnsSuffix);
  const address = peer.TailscaleIPs?.[0];
  if (!name || !address) return null;

  return {
    id: name,
    name,
    address,
    status: peer.Online === false ? 'offline' : 'available',
    detail: getStatusTargetDetail(peer),
  };
}

function shouldReplaceStatusTarget(
  current: { peer: TailscaleStatusPeer; target: TaildropTarget },
  next: { peer: TailscaleStatusPeer; target: TaildropTarget },
): boolean {
  if (current.target.status === 'offline' && next.target.status === 'available') return true;
  if (current.target.status === next.target.status) {
    const currentRouteCount = current.peer.PrimaryRoutes?.length ?? 0;
    const nextRouteCount = next.peer.PrimaryRoutes?.length ?? 0;
    return nextRouteCount > currentRouteCount;
  }
  return false;
}

function getStatusTargetKey(peerId: string, peer: TailscaleStatusPeer, target: TaildropTarget): string {
  return (peer.DNSName?.trim() || peerId || target.name).toLowerCase();
}

function parseStatusTargets(stdout: string): TaildropTarget[] {
  const status = JSON.parse(stdout) as TailscaleStatus;
  const targets = new Map<string, { peer: TailscaleStatusPeer; target: TaildropTarget }>();

  for (const [peerId, peer] of Object.entries(status.Peer ?? {})) {
    const target = parseStatusTarget(peer, status.MagicDNSSuffix);
    if (!target) continue;

    const key = getStatusTargetKey(peerId, peer, target);
    const current = targets.get(key);
    const next = { peer, target };
    if (!current || shouldReplaceStatusTarget(current, next)) {
      targets.set(key, next);
    }
  }

  return [...targets.values()].map(({ target }) => target);
}

function getBackendUnavailableMessage(backendState?: string): string | null {
  if (!backendState || backendState === 'Running') return null;
  if (backendState === 'Stopped') return 'Tailscale is disconnected.';
  if (backendState === 'NeedsLogin') return 'Tailscale needs you to sign in.';
  if (backendState === 'NeedsMachineAuth') return 'Tailscale device authorization is required.';
  if (backendState === 'Starting') return 'Tailscale is connecting.';
  if (backendState === 'InUseOtherUser') return 'Tailscale is running as another user.';
  if (backendState === 'NoState') return 'Tailscale is not ready.';
  return `Tailscale is not ready (${backendState}).`;
}

function parseReceiveFiles(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().includes('no files'))
    .map((line) => {
      const quoted = line.match(/"([^"]+)"/);
      if (quoted?.[1]) return path.basename(quoted[1]);
      const lastToken = line.split(/\s+/).at(-1);
      return lastToken ? path.basename(lastToken) : line;
    });
}

async function assertDirectory(directoryPath: string): Promise<void> {
  const info = await stat(directoryPath);
  if (!info.isDirectory()) {
    throw new Error('Taildrop receive destination must be a directory');
  }
}

export class TaildropService {
  private tailscaleCommand?: string;

  async getAvailability(): Promise<TaildropAvailability> {
    try {
      const { stdout } = await this.run(['status', '--json'], { timeout: COMMAND_TIMEOUT_MS });
      const status = JSON.parse(stdout) as TailscaleStatus;
      const message = getBackendUnavailableMessage(status.BackendState);
      if (message) {
        return {
          status: 'unavailable',
          platform: process.platform,
          message,
        };
      }
      return { status: 'available', platform: process.platform };
    } catch (error) {
      const message = getCommandOutput(error);
      const missing = isMissingCommandError(error);
      return {
        status: missing ? 'missing' : 'unavailable',
        platform: process.platform,
        message: missing
          ? 'Tailscale is not installed or Aether could not find the Tailscale command.'
          : message,
      };
    }
  }

  async listTargets(): Promise<TaildropTarget[]> {
    try {
      const { stdout } = await this.run(['status', '--json'], {
        timeout: COMMAND_TIMEOUT_MS,
      });
      return parseStatusTargets(stdout);
    } catch (primaryError) {
      try {
        const { stdout } = await this.run(['file', 'cp', '--targets'], {
          timeout: COMMAND_TIMEOUT_MS,
        });
        return stdout
          .split(/\r?\n/)
          .map(parseTargetLine)
          .filter((target): target is TaildropTarget => Boolean(target));
      } catch (fallbackError) {
        throw new Error(
          `Could not list Taildrop devices: status --json failed: ${getCommandOutput(primaryError)}; ` +
            `file cp --targets failed: ${getCommandOutput(fallbackError)}`,
        );
      }
    }
  }

  async sendFile(sourcePath: string, targetId: string, signal?: AbortSignal): Promise<void> {
    await access(sourcePath);
    const target = await this.getAvailableTarget(targetId);
    await this.run(['file', 'cp', sourcePath, `${target.name}:`], {
      signal,
      timeout: SEND_TIMEOUT_MS,
    });
  }

  async receive(destinationPath: string): Promise<TaildropReceiveResult> {
    if (process.platform !== 'linux') {
      return {
        destinationPath,
        files: [],
        message: 'Received Taildrop files are handled by the Tailscale desktop client on this platform.',
      };
    }

    await assertDirectory(destinationPath);
    const before = new Set(await readdir(destinationPath));

    try {
      const { stdout } = await this.run(['file', 'get', destinationPath], {
        timeout: SEND_TIMEOUT_MS,
      });
      const after = await readdir(destinationPath);
      const created = after.filter((name) => !before.has(name));
      const parsed = parseReceiveFiles(stdout);
      const files = created.length > 0 ? created : parsed;

      return {
        destinationPath,
        files,
        message: files.length === 0 ? 'No received Taildrop files were waiting.' : undefined,
      };
    } catch (error) {
      const message = getCommandOutput(error);
      if (/no files/i.test(message)) {
        return {
          destinationPath,
          files: [],
          message: 'No received Taildrop files were waiting.',
        };
      }
      throw new Error(`Could not collect Taildrop files: ${message}`);
    }
  }

  private async getAvailableTarget(targetId: string): Promise<TaildropTarget> {
    if (!TARGET_NAME_PATTERN.test(targetId)) {
      throw new Error('Invalid Taildrop target');
    }

    const targets = await this.listTargets();
    const target = targets.find((candidate) => candidate.id === targetId);
    if (!target) {
      throw new Error('Taildrop target is no longer available');
    }
    if (target.status !== 'available') {
      throw new Error(target.detail ?? 'Taildrop target is offline');
    }
    return target;
  }

  private run(
    args: string[],
    options: { signal?: AbortSignal; timeout: number },
  ): Promise<{ stdout: string; stderr: string }> {
    return this.runWithCandidates(
      this.tailscaleCommand ? [this.tailscaleCommand] : getCommandCandidates(),
      args,
      options,
    );
  }

  private async runWithCandidates(
    commands: string[],
    args: string[],
    options: { signal?: AbortSignal; timeout: number },
  ): Promise<{ stdout: string; stderr: string }> {
    let missingError: unknown;

    for (const command of commands) {
      try {
        const result = await execFileAsync(command, args, {
          signal: options.signal,
          timeout: options.timeout,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
          env: getTailscaleEnv(),
        });
        this.tailscaleCommand = command;
        return result;
      } catch (error) {
        if (!isMissingCommandError(error)) {
          throw error;
        }
        missingError = error;
      }
    }

    throw missingError ?? new Error('Tailscale command not found');
  }
}
