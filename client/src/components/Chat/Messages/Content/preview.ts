import { FileSources, excelMimeTypes } from 'librechat-data-provider';

export type PreviewKind = 'pdf' | 'text' | 'office' | false;

/**
 * Office documents the backend renders to a sanitized HTML preview on upload
 * (`buildOfficePreview` -> `bufferToOfficeHtml`). Kept as extensions rather
 * than MIME alone because browsers are unreliable at typing these: the same
 * .xls arrives as `application/vnd.ms-excel`, `application/x-xls` or
 * `application/octet-stream` depending on the OS.
 */
const OFFICE_EXTENSIONS = new Set(['csv', 'xls', 'xlsx', 'xlsm', 'ods', 'docx', 'pptx']);

const OFFICE_MIME_PATTERN =
  /^(text\/csv|application\/csv|text\/comma-separated-values|application\/vnd\.oasis\.opendocument\.spreadsheet|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation))$/i;

/**
 * True when the backend would have produced an HTML preview for this file.
 *
 * MUST be tested before {@link getPreviewKindByMime}: that function matches
 * `mime.includes('xml')`, and every OOXML type contains "xml" twice over
 * (`openxmlformats`, `spreadsheetml`). An .xlsx therefore matched as 'text'
 * and the dialog rendered the raw ZIP container as mojibake.
 */
function isOfficePreviewType(fileName: string, mime?: string): boolean {
  const normalized = (mime ?? '').split(';')[0].trim().toLowerCase();
  if (normalized && (OFFICE_MIME_PATTERN.test(normalized) || excelMimeTypes.test(normalized))) {
    return true;
  }
  return OFFICE_EXTENSIONS.has(getFileExtension(fileName));
}

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'xml',
  'yaml',
  'yml',
  'html',
  'css',
  'js',
  'ts',
  'jsx',
  'tsx',
  'py',
  'rb',
  'java',
  'c',
  'cpp',
  'h',
  'go',
  'rs',
  'sh',
  'sql',
  'log',
]);

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

export function shouldUseSharedFileDownload(shareId?: string, fileId?: string): boolean {
  return !!shareId && !!fileId;
}

function getPreviewKindByMime(mime?: string): PreviewKind {
  if (!mime) {
    return false;
  }
  if (mime.includes('pdf')) {
    return 'pdf';
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    mime.includes('yaml') ||
    mime.includes('csv')
  ) {
    return 'text';
  }
  return false;
}

function getPreviewKindByExtension(filename: string): PreviewKind {
  const extension = getFileExtension(filename);
  if (extension === 'pdf') {
    return 'pdf';
  }
  return TEXT_EXTENSIONS.has(extension) ? 'text' : false;
}

export function getPreviewKind(
  fileName: string,
  fileType?: string,
  fileSource?: string,
): PreviewKind {
  /* Before every other branch, including the `FileSources.text` shortcut: a
   * spreadsheet stored as extracted text is still better shown as a table,
   * and the MIME branch below would mis-claim OOXML types as plain text. */
  if (isOfficePreviewType(fileName, fileType)) {
    return 'office';
  }
  if (fileSource === FileSources.text) {
    return 'text';
  }
  return getPreviewKindByMime(fileType) || getPreviewKindByExtension(fileName);
}
