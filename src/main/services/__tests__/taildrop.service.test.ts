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

function statusJson(peers: Record<string, unknown>): string {
  return JSON.stringify({
    BackendState: 'Running',
    MagicDNSSuffix: 'tail23338f.ts.net',
    Peer: peers,
  });
}

function backendStatusJson(backendState: string): string {
  return JSON.stringify({
    BackendState: backendState,
    MagicDNSSuffix: 'tail23338f.ts.net',
    Peer: {},
  });
}

describe('TaildropService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue(undefined);
  });

  it('lists Taildrop targets and marks offline devices', async () => {
    execFileMock.mockResolvedValue({
      stdout: statusJson({
        peer1: {
          DNSName: 'ec2-dev.tail23338f.ts.net.',
          HostName: 'ec2-dev',
          TailscaleIPs: ['100.115.119.77'],
          Online: true,
          TaildropTarget: 1,
          NoFileSharingReason: '',
        },
        peer2: {
          DNSName: 'quentins-macbook-pro.tail23338f.ts.net.',
          HostName: 'quentins-macbook-pro',
          TailscaleIPs: ['100.102.209.76'],
          Online: false,
          TaildropTarget: 5,
          NoFileSharingReason: '',
        },
      }),
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
        detail: 'offline',
      },
    ]);
  });

  it('includes tagged subnet routers without merging peers that share a host name', async () => {
    execFileMock.mockResolvedValue({
      stdout: statusJson({
        staleRouter: {
          DNSName: 'router-lp-ec2-prod-use1.tail23338f.ts.net.',
          HostName: 'router-lp-ec2-prod-use1',
          TailscaleIPs: ['100.64.3.1'],
          Online: false,
          TaildropTarget: 5,
          NoFileSharingReason: '',
        },
        activeRouter: {
          DNSName: 'router-lp-ec2-prod-use1-1.tail23338f.ts.net.',
          HostName: 'router-lp-ec2-prod-use1',
          TailscaleIPs: ['100.89.6.116'],
          Online: true,
          TaildropTarget: 9,
          NoFileSharingReason: '',
          PrimaryRoutes: ['10.3.0.0/16', '10.20.0.0/16'],
        },
        opsRouter: {
          DNSName: 'router-lp-ec2-ops-use1.tail23338f.ts.net.',
          HostName: 'router-lp-ec2-ops-use1',
          TailscaleIPs: ['100.98.163.36'],
          Online: true,
          TaildropTarget: 9,
          NoFileSharingReason: '',
          PrimaryRoutes: ['10.254.0.0/16'],
        },
        stagingRouter: {
          DNSName: 'router-lp-ec2-staging-use1.tail23338f.ts.net.',
          HostName: 'router-lp-ec2-staging-use1',
          TailscaleIPs: ['100.108.28.7'],
          Online: true,
          TaildropTarget: 9,
          NoFileSharingReason: '',
          PrimaryRoutes: ['10.21.0.0/16'],
        },
      }),
      stderr: '',
    });

    const { TaildropService } = await import('../taildrop.service');
    const service = new TaildropService();

    await expect(service.listTargets()).resolves.toEqual([
      {
        id: 'router-lp-ec2-prod-use1',
        name: 'router-lp-ec2-prod-use1',
        address: '100.64.3.1',
        status: 'offline',
        detail: 'offline',
      },
      {
        id: 'router-lp-ec2-prod-use1-1',
        name: 'router-lp-ec2-prod-use1-1',
        address: '100.89.6.116',
        status: 'available',
        detail: 'routes: 10.3.0.0/16, 10.20.0.0/16',
      },
      {
        id: 'router-lp-ec2-ops-use1',
        name: 'router-lp-ec2-ops-use1',
        address: '100.98.163.36',
        status: 'available',
        detail: 'routes: 10.254.0.0/16',
      },
      {
        id: 'router-lp-ec2-staging-use1',
        name: 'router-lp-ec2-staging-use1',
        address: '100.108.28.7',
        status: 'available',
        detail: 'routes: 10.21.0.0/16',
      },
    ]);
  });

  it('includes both online peers when they share a host name but have unique DNS names', async () => {
    execFileMock.mockResolvedValue({
      stdout: statusJson({
        peer1: {
          DNSName: 'router-a.tail23338f.ts.net.',
          HostName: 'router',
          TailscaleIPs: ['100.64.3.1'],
          Online: true,
          TaildropTarget: 9,
          NoFileSharingReason: '',
        },
        peer2: {
          DNSName: 'router-b.tail23338f.ts.net.',
          HostName: 'router',
          TailscaleIPs: ['100.64.3.2'],
          Online: true,
          TaildropTarget: 9,
          NoFileSharingReason: '',
        },
      }),
      stderr: '',
    });

    const { TaildropService } = await import('../taildrop.service');
    const service = new TaildropService();

    await expect(service.listTargets()).resolves.toEqual([
      {
        id: 'router-a',
        name: 'router-a',
        address: '100.64.3.1',
        status: 'available',
      },
      {
        id: 'router-b',
        name: 'router-b',
        address: '100.64.3.2',
        status: 'available',
      },
    ]);
  });

  it('reports both status and fallback errors when target listing fails', async () => {
    execFileMock
      .mockRejectedValueOnce(Object.assign(new Error('status failed'), {
        stderr: 'invalid json',
      }))
      .mockRejectedValueOnce(Object.assign(new Error('targets failed'), {
        stderr: 'file sharing unavailable',
      }));

    const { TaildropService } = await import('../taildrop.service');
    const service = new TaildropService();

    await expect(service.listTargets()).rejects.toThrow(
      'Could not list Taildrop devices: status --json failed: invalid json; file cp --targets failed: file sharing unavailable',
    );
  });

  it('sends files only to currently available targets', async () => {
    execFileMock
      .mockResolvedValueOnce({
        stdout: statusJson({
          peer1: {
            DNSName: 'ec2-dev.tail23338f.ts.net.',
            HostName: 'ec2-dev',
            TailscaleIPs: ['100.115.119.77'],
            Online: true,
            TaildropTarget: 1,
            NoFileSharingReason: '',
          },
          peer2: {
            DNSName: 'phone.tail23338f.ts.net.',
            HostName: 'phone',
            TailscaleIPs: ['100.1.1.1'],
            Online: false,
            TaildropTarget: 5,
            NoFileSharingReason: '',
          },
        }),
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
      .mockResolvedValueOnce({ stdout: backendStatusJson('Running'), stderr: '' });

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
        ['status', '--json'],
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
    execFileMock.mockResolvedValue({ stdout: backendStatusJson('Running'), stderr: '' });

    try {
      const { TaildropService } = await import('../taildrop.service');
      const service = new TaildropService();

      await service.getAvailability();

      expect(execFileMock).toHaveBeenCalledWith(
        'tailscale',
        ['status', '--json'],
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
      .mockResolvedValueOnce({ stdout: backendStatusJson('Running'), stderr: '' })
      .mockResolvedValueOnce({
        stdout: statusJson({
          peer1: {
            DNSName: 'ec2-dev.tail23338f.ts.net.',
            HostName: 'ec2-dev',
            TailscaleIPs: ['100.115.119.77'],
            Online: true,
            TaildropTarget: 1,
            NoFileSharingReason: '',
          },
        }),
        stderr: '',
      });

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
        ['status', '--json'],
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

  it('reports disconnected Tailscale backends as unavailable', async () => {
    execFileMock.mockResolvedValue({ stdout: backendStatusJson('Stopped'), stderr: '' });

    const { TaildropService } = await import('../taildrop.service');
    const service = new TaildropService();

    await expect(service.getAvailability()).resolves.toEqual({
      status: 'unavailable',
      platform: process.platform,
      message: 'Tailscale is disconnected.',
    });
  });

  it('reports Tailscale authorization backend states as unavailable', async () => {
    execFileMock.mockResolvedValue({ stdout: backendStatusJson('NeedsMachineAuth'), stderr: '' });

    const { TaildropService } = await import('../taildrop.service');
    const service = new TaildropService();

    await expect(service.getAvailability()).resolves.toEqual({
      status: 'unavailable',
      platform: process.platform,
      message: 'Tailscale device authorization is required.',
    });
  });
});
