import path from 'path';

const PROJECT_ROOT = process.cwd();
const UPLOADS_PREFIX = 'uploads/';

const normalizeSeparators = (candidate = '') => candidate.replace(/\\/g, '/');

export const normalizeToUploadsPath = (filePath) => {
  if (!filePath) {
    return null;
  }

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(PROJECT_ROOT, filePath);

  const relativeToRoot = path.relative(PROJECT_ROOT, absolutePath);

  return normalizeSeparators(relativeToRoot);
};

export const buildDebugImagePath = (normalizedImagePath) => {
  if (!normalizedImagePath) {
    return null;
  }

  const parsed = path.posix.parse(normalizeSeparators(normalizedImagePath));
  const fileName = `${parsed.name}_debug.jpg`;
  return path.posix.join('uploads', 'debug', fileName);
};

const stripUploadsPrefix = (storedPath) => {
  if (!storedPath) {
    return null;
  }

  const normalized = normalizeSeparators(storedPath);
  return normalized.startsWith(UPLOADS_PREFIX)
    ? normalized.slice(UPLOADS_PREFIX.length)
    : normalized;
};

export const buildPublicUploadUrl = (storedPath) => {
  const stripped = stripUploadsPrefix(storedPath);

  if (!stripped) {
    return null;
  }

  return `/pistol/uploads/${stripped}`.replace(/\\/g, '/');
};

export const toAbsoluteUploadsPath = (storedPath) => {
  if (!storedPath) {
    return null;
  }

  return path.isAbsolute(storedPath)
    ? storedPath
    : path.join(PROJECT_ROOT, storedPath);
};
