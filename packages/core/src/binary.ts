/** Extensions whose byte count is not a magnitude of anything the panel is about. */
export const BINARY_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'bmp',
  'tif',
  'tiff',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'm4a',
  'mp4',
  'webm',
  'mov',
  'avi',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'zip',
  'gz',
  'tgz',
  'bz2',
  '7z',
  'rar',
  'jar',
  'pdf',
  'bin',
  'exe',
  'dll',
  'so',
  'dylib',
  'wasm',
  'psd',
  'ai',
  'sketch',
  'fig',
  'blend',
  'glb',
  'gltf',
  'fbx',
  'obj',
];

const extensions = new Set(BINARY_EXTENSIONS);

export function isBinary(id: string): boolean {
  const slash = id.lastIndexOf('/');
  const name = id.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return extensions.has(name.slice(dot + 1).toLowerCase());
}
