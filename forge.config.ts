import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerAppImage } from '@reforged/maker-appimage';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import path from 'node:path';
import fs from 'node:fs';

/** Copy externalized production dependencies and their full transitive tree. */
function copyExternalModules(
  _buildPath: string,
  _electronVersion: string,
  _platform: string,
  _arch: string,
  callback: (err?: Error | null) => void,
) {
  const rootModules = ['ssh2', 'ssh2-sftp-client', 'cpu-features', 'electron-store'];
  const srcBase = path.resolve(__dirname, 'node_modules');
  const destBase = path.join(_buildPath, 'node_modules');

  function copyDir(src: string, dest: string) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /** Recursively collect all transitive dependencies of a module. */
  function collectDeps(modName: string, collected: Set<string>) {
    if (collected.has(modName)) return;
    const modDir = path.join(srcBase, modName);
    if (!fs.existsSync(modDir)) return;
    collected.add(modName);
    const pkgPath = path.join(modDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const { dependencies = {} } = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        for (const dep of Object.keys(dependencies)) {
          collectDeps(dep, collected);
        }
      } catch { /* skip unparseable */ }
    }
  }

  try {
    const allDeps = new Set<string>();
    for (const mod of rootModules) {
      collectDeps(mod, allDeps);
    }
    for (const dep of allDeps) {
      copyDir(path.join(srcBase, dep), path.join(destBase, dep));
    }
    // Also copy the app icon so BrowserWindow can reference it at runtime
    const iconSrc = path.resolve(__dirname, 'assets/icon.png');
    if (fs.existsSync(iconSrc)) {
      fs.copyFileSync(iconSrc, path.join(_buildPath, 'icon.png'));
    }

    callback();
  } catch (err) {
    callback(err as Error);
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/*.node',
    },
    executableName: 'aether',
    icon: path.resolve(__dirname, 'assets/icon'),
    afterCopy: [copyExternalModules],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerDMG({}, ['darwin']),
    new MakerAppImage({
      options: {
        icon: path.resolve(__dirname, 'assets/icon.png'),
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new AutoUnpackNativesPlugin({}),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
