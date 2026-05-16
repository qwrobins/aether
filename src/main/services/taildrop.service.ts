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

function getTailscaleEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SHLVL: process.env.SHLVL ?? '1',
  };
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
      await this.run(['version'], { timeout: COMMAND_TIMEOUT_MS });
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
      const { stdout } = await this.run(['file', 'cp', '--targets'], {
        timeout: COMMAND_TIMEOUT_MS,
      });
      return stdout
        .split(/\r?\n/)
        .map(parseTargetLine)
        .filter((target): target is TaildropTarget => Boolean(target));
    } catch (error) {
      throw new Error(`Could not list Taildrop devices: ${getCommandOutput(error)}`);
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
