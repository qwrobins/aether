import { beforeEach, describe, expect, it, vi } from 'vitest';

const accessMock = vi.fn();
const readdirMock = vi.fn();
const statMock = vi.fn();
const execFileMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  access: accessMock,
  readdir: readdirMock,
  stat: statMock,
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('node:util', () => ({
  promisify: vi.fn(() => execFileMock),
}));

describe('TaildropService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue(undefined);
  });

  it('lists Taildrop targets and marks offline devices', async () => {
    execFileMock.mockResolvedValue({
      stdout: [
        '100.115.119.77\tec2-dev',
        '100.102.209.76\tquentins-macbook-pro\toffline; last seen 11m0s ago',
      ].join('\n'),
      stderr: '',
    });

    const { TaildropService } = await import('../taildrop.service');
    const service = new TaildropService();

    await expect(service.listTargets()).resolves.toEqual([
      {
        id: 'ec2-dev',
        name: 'ec2-dev',
        address: '100.115.119.77',
        status: 'available',
      },
      {
        id: 'quentins-macbook-pro',
        name: 'quentins-macbook-pro',
        address: '100.102.209.76',
        status: 'offline',
        detail: 'offline; last seen 11m0s ago',
      },
    ]);
  });

  it('sends files only to currently available targets', async () => {
    execFileMock
      .mockResolvedValueOnce({
        stdout: '100.115.119.77\tec2-dev\n100.1.1.1\tphone\toffline; last seen 1h ago\n',
        stderr: '',
      })
      .mockResolvedValueOnce({ stdout: '', stderr: '' });

    const { TaildropService } = await import('../taildrop.service');
    const service = new TaildropService();

    await service.sendFile('/tmp/a.txt', 'ec2-dev');

    expect(execFileMock).toHaveBeenLastCalledWith(
      'tailscale',
      ['file', 'cp', '/tmp/a.txt', 'ec2-dev:'],
      expect.objectContaining({ windowsHide: true }),
    );
    await expect(service.sendFile('/tmp/a.txt', 'bad target')).rejects.toThrow('Invalid Taildrop target');
  });

  it('falls back to the bundled macOS app binary when tailscale is not on PATH', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    execFileMock
      .mockRejectedValueOnce(Object.assign(new Error('spawn tailscale ENOENT'), {
        code: 'ENOENT',
        stderr: 'spawn tailscale ENOENT',
      }))
      .mockResolvedValueOnce({ stdout: '1.98.2', stderr: '' });

    try {
      const { TaildropService } = await import('../taildrop.service');
      const service = new TaildropService();

      await expect(service.getAvailability()).resolves.toEqual({
        status: 'available',
        platform: 'darwin',
      });
      expect(execFileMock).toHaveBeenNthCalledWith(
        2,
        '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
        ['version'],
        expect.objectContaining({
          env: expect.objectContaining({ SHLVL: expect.any(String) }),
          windowsHide: true,
        }),
      );
    } finally {
      platformSpy.mockRestore();
    }
  });

  it('provides SHLVL when launching the Tailscale command from GUI environments', async () => {
    const originalShellLevel = process.env.SHLVL;
    delete process.env.SHLVL;
    execFileMock.mockResolvedValue({ stdout: '1.98.2', stderr: '' });

    try {
      const { TaildropService } = await import('../taildrop.service');
      const service = new TaildropService();

      await service.getAvailability();

      expect(execFileMock).toHaveBeenCalledWith(
        'tailscale',
        ['version'],
        expect.objectContaining({
          env: expect.objectContaining({ SHLVL: '1' }),
        }),
      );
    } finally {
      if (originalShellLevel === undefined) {
        delete process.env.SHLVL;
      } else {
        process.env.SHLVL = originalShellLevel;
      }
    }
  });

  it('reuses a resolved macOS Tailscale command for later calls', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    execFileMock
      .mockRejectedValueOnce(Object.assign(new Error('spawn tailscale ENOENT'), {
        code: 'ENOENT',
        stderr: 'spawn tailscale ENOENT',
      }))
      .mockResolvedValueOnce({ stdout: '1.98.2', stderr: '' })
      .mockResolvedValueOnce({ stdout: '100.115.119.77\tec2-dev\n', stderr: '' });

    try {
      const { TaildropService } = await import('../taildrop.service');
      const service = new TaildropService();

      await service.getAvailability();
      await expect(service.listTargets()).resolves.toEqual([
        {
          id: 'ec2-dev',
          name: 'ec2-dev',
          address: '100.115.119.77',
          status: 'available',
        },
      ]);
      expect(execFileMock).toHaveBeenLastCalledWith(
        '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
        ['file', 'cp', '--targets'],
        expect.objectContaining({ windowsHide: true }),
      );
    } finally {
      platformSpy.mockRestore();
    }
  });

  it('collects Linux received files into a destination directory', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    statMock.mockResolvedValue({ isDirectory: () => true });
    readdirMock
      .mockResolvedValueOnce(['existing.txt'])
      .mockResolvedValueOnce(['existing.txt', 'received.txt']);
    execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

    try {
      const { TaildropService } = await import('../taildrop.service');
      const service = new TaildropService();

      await expect(service.receive('/home/q/Downloads')).resolves.toEqual({
        destinationPath: '/home/q/Downloads',
        files: ['received.txt'],
        message: undefined,
      });
    } finally {
      platformSpy.mockRestore();
    }
  });

  it('reports a missing Tailscale CLI as unavailable status', async () => {
    execFileMock.mockRejectedValue(Object.assign(new Error('spawn tailscale ENOENT'), {
      code: 'ENOENT',
      stderr: 'spawn tailscale ENOENT',
    }));

    const { TaildropService } = await import('../taildrop.service');
    const service = new TaildropService();

    await expect(service.getAvailability()).resolves.toEqual({
      status: 'missing',
      platform: process.platform,
      message: 'Tailscale is not installed or Aether could not find the Tailscale command.',
    });
  });
});
