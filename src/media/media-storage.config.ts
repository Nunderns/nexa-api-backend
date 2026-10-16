import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MB = 1024 * 1024;

/** Where uploaded files are written. Mount a volume here in production. */
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? 'uploads');

/** Public path the upload directory is served under (see `configureApp`). */
export const UPLOAD_ROUTE = '/uploads';

export const MAX_IMAGE_BYTES =
  positiveInt(process.env.MEDIA_MAX_IMAGE_MB, 10) * MB;

export const MAX_VIDEO_BYTES =
  positiveInt(process.env.MEDIA_MAX_VIDEO_MB, 100) * MB;

/**
 * Accepted types and the extension each is stored with. The extension is
 * derived from the type, never from the client file name, and SVG is left out
 * because it can carry script.
 */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

export function maxBytesFor(mimeType: string): number {
  return mimeType.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

/**
 * Multer options for `POST /media/upload`. The hard limit is the video one;
 * the tighter image limit is enforced by `MediaService` once the type is known.
 */
export const mediaUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      mkdirSync(UPLOAD_DIR, { recursive: true });
      callback(null, UPLOAD_DIR);
    },
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${ALLOWED_MIME_TYPES[file.mimetype]}`);
    },
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      callback(
        new BadRequestException(
          `Unsupported file type. Allowed: ${Object.keys(ALLOWED_MIME_TYPES).join(', ')}`,
        ),
        false,
      );
      return;
    }

    callback(null, true);
  },
};
