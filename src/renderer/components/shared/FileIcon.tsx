import {
  Folder,
  FileText,
  Image,
  FileCode,
  Archive,
  Film,
  File,
} from 'lucide-react';
import type { FileEntry } from '@shared/types/filesystem';

const EXT_ICON_MAP: Record<string, { icon: typeof File; className: string }> = {};

const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages'];
const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff'];
const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'json', 'yaml', 'yml', 'toml', 'html', 'css', 'scss', 'sh', 'bash', 'md', 'xml'];
const archiveExts = ['zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz', 'tgz'];
const mediaExts = ['mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'flac', 'ogg', 'webm', 'wmv'];

for (const ext of docExts) EXT_ICON_MAP[ext] = { icon: FileText, className: 'text-rose-400/80' };
for (const ext of imageExts) EXT_ICON_MAP[ext] = { icon: Image, className: 'text-emerald-400/80' };
for (const ext of codeExts) EXT_ICON_MAP[ext] = { icon: FileCode, className: 'text-amber-400/80' };
for (const ext of archiveExts) EXT_ICON_MAP[ext] = { icon: Archive, className: 'text-violet-400/80' };
for (const ext of mediaExts) EXT_ICON_MAP[ext] = { icon: Film, className: 'text-cyan-400/80' };

interface FileIconProps {
  entry: FileEntry;
  size?: number;
}

export function FileIcon({ entry, size = 16 }: FileIconProps) {
  if (entry.isDirectory) {
    return <Folder size={size} className="text-primary/80 shrink-0" />;
  }

  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  const mapping = EXT_ICON_MAP[ext];

  if (mapping) {
    const Icon = mapping.icon;
    return <Icon size={size} className={`${mapping.className} shrink-0`} />;
  }

  return <File size={size} className="text-muted-foreground/50 shrink-0" />;
}
