const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

export function mimeTypeForExtension(extension: string): string {
  return MIME_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
