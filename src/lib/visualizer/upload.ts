const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

interface UploadLike {
  type: string;
  size: number;
}

type UploadValidation = { ok: true } | { ok: false; code: 'AI_CONSENT_REQUIRED' | 'UNSUPPORTED_IMAGE' | 'IMAGE_TOO_LARGE' };

export function validateVisualizerUpload(file: UploadLike, consent: boolean): UploadValidation {
  if (!consent) return { ok: false, code: 'AI_CONSENT_REQUIRED' };
  if (!supportedTypes.has(file.type)) return { ok: false, code: 'UNSUPPORTED_IMAGE' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, code: 'IMAGE_TOO_LARGE' };
  return { ok: true };
}
