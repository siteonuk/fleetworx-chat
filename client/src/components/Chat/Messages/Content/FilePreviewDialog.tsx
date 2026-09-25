import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import copy from 'copy-to-clipboard';
import { Download } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogDescription } from '@librechat/client';
import { getDownloadFilename, logger, sortPagesByRelevance, triggerDownload } from '~/utils';
import {
  revokeDownloadURL,
  useFileDownload,
  useFilePreview,
  useSharedFileDownload,
} from '~/data-provider';
import { getFileExtension, getPreviewKind, shouldUseSharedFileDownload } from './preview';
import CopyButton from '~/components/Messages/Content/CopyButton';
import { useShareContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  fileId?: string;
  filePath?: string;
  relevance?: number;
  pages?: number[];
  pageRelevance?: Record<number, number>;
  fileType?: string;
  fileSource?: string;
  fileSize?: number;
}

/** Formats bytes with unit suffix (differs from ~/utils/formatBytes which returns a raw number). */
function formatBytes(bytes: number): string {
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function getDisplayType(fileType?: string, fileName?: string): string {
  if (fileType) {
    if (fileType.includes('pdf')) {
      return 'PDF';
    }
    if (fileType.includes('word') || fileType.includes('document')) {
      return 'Document';
    }
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) {
      return 'Spreadsheet';
    }
    if (fileType.includes('presentation') || fileType.includes('powerpoint')) {
      return 'Presentation';
    }
    if (fileType.includes('image')) {
      return 'Image';
    }
    if (fileType.startsWith('text/')) {
      return fileType.split('/')[1]?.toUpperCase() || 'Text';
    }
    if (fileType.includes('json')) {
      return 'JSON';
    }
    if (fileType.includes('xml')) {
      return 'XML';
    }
  }
  const ext = fileName ? getFileExtension(fileName) : '';
  return ext ? ext.toUpperCase() : 'File';
}

export default function FilePreviewDialog({
  open,
  onOpenChange,
  fileName,
  fileId,
  relevance,
  pages,
  pageRelevance,
  fileType,
  fileSource,
  fileSize,
}: FilePreviewDialogProps) {
  const localize = useLocalize();
  const user = useRecoilValue(store.user);
  const { shareId } = useShareContext();
  // Preview reads revoke their blob after consumption, so they need a separate
  // query identity from user-triggered downloads that may be in flight concurrently.
  const { refetch: downloadOwned } = useFileDownload(user?.id ?? '', fileId, { direct: false });
  const { refetch: downloadShared } = useSharedFileDownload(shareId, fileId);
  const { refetch: previewOwned } = useFileDownload(user?.id ?? '', fileId, {
    direct: false,
    purpose: 'preview',
  });
  const { refetch: previewShared } = useSharedFileDownload(shareId, fileId, 'preview');
  // A shared viewer must stay inside the share-scoped authorization boundary;
  // citation and retrieval previews do not carry a rewritten filepath signal.
  const useShared = shouldUseSharedFileDownload(shareId, fileId);
  const downloadFile = useShared ? downloadShared : downloadOwned;
  const previewFile = useShared ? previewShared : previewOwned;

  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const loadingRef = useRef(false);

  const previewKind = getPreviewKind(fileName, fileType, fileSource);
  const downloadFilename = getDownloadFilename(fileName, fileId, fileSource);

  /* Office types render from the sanitized HTML the backend stored at upload
   * (`buildOfficePreview`), not from the raw bytes — a .xlsx is a ZIP and a
   * .csv is unformatted text, neither of which is readable as a document.
   * Only fetched while the dialog is open for such a file. */
  const isOfficePreview = previewKind === 'office';
  /* `isInitialLoading`, not `isLoading`: in React Query v4 a DISABLED query
   * sits at `status: 'loading'` forever (it has no data and never fetches), so
   * `isLoading` stays true for every non-office file and pinned a permanent
   * "Loading…" banner above the PDF viewer. `isInitialLoading` is
   * `isLoading && isFetching`, which is false while disabled. */
  const { data: officePreview, isInitialLoading: officePreviewLoading } = useFilePreview(
    isOfficePreview ? fileId : undefined,
    { enabled: isOfficePreview && open && !!fileId },
    shareId,
  );
  /* The `textFormat: 'html'` trust signal is required before injecting into
   * the iframe, mirroring the gate in `detectArtifactTypeFromFile`. Without
   * it (older records, or a file whose conversion failed) we fall back to the
   * raw-bytes path rather than trusting unlabelled text as markup. */
  const officeHtml =
    officePreview?.status === 'ready' && officePreview.textFormat === 'html'
      ? officePreview.text
      : null;
  const officePreviewFailed = isOfficePreview && !officePreviewLoading && !officeHtml;

  const cancelledRef = useRef(false);

  const loadPreview = useCallback(async () => {
    if (!fileId || !previewKind || loadingRef.current) {
      return;
    }
    /* Office types are served from the stored HTML preview, never from the
     * raw bytes: dumping a .xlsx (a ZIP) into the text pane produced pages of
     * mojibake. When no HTML exists we show "preview unavailable" and leave
     * the user the Download button, which is the honest outcome. */
    if (isOfficePreview) {
      return;
    }
    loadingRef.current = true;
    cancelledRef.current = false;
    setLoading(true);
    setPreviewError(false);

    try {
      const result = await previewFile();
      if (!result.data) {
        if (!cancelledRef.current) {
          setPreviewError(true);
        }
        return;
      }
      if (cancelledRef.current) {
        revokeDownloadURL(result.data);
        return;
      }

      let blob: Blob;
      try {
        const resp = await fetch(result.data);
        blob = await resp.blob();
      } finally {
        revokeDownloadURL(result.data);
      }

      if (cancelledRef.current) {
        return;
      }

      if (previewKind === 'text') {
        setFileContent(await blob.text());
      } else {
        const typed = new Blob([blob], { type: 'application/pdf' });
        setFileBlobUrl(URL.createObjectURL(typed));
      }
    } catch {
      if (!cancelledRef.current) {
        setPreviewError(true);
      }
    } finally {
      loadingRef.current = false;
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [fileId, previewKind, previewFile, isOfficePreview]);

  const handleDownload = useCallback(async () => {
    if (!fileId) {
      return;
    }
    try {
      const result = await downloadFile();
      if (!result.data) {
        return;
      }
      triggerDownload(result.data, downloadFilename);
    } catch (err) {
      logger.error('[FilePreviewDialog] Download failed:', err);
    }
  }, [downloadFile, downloadFilename, fileId]);

  useEffect(() => {
    if (open && previewKind && fileContent === null && !fileBlobUrl) {
      loadPreview();
    }
  }, [open, previewKind, fileContent, fileBlobUrl, loadPreview]);

  useEffect(() => {
    return () => {
      if (fileBlobUrl) {
        URL.revokeObjectURL(fileBlobUrl);
      }
    };
  }, [fileBlobUrl]);

  useEffect(() => {
    if (!open) {
      cancelledRef.current = true;
      setFileContent(null);
      setFileBlobUrl(null);
      setPreviewError(false);
      setLoading(false);
      setIsCopied(false);
    }
  }, [open]);

  const handleCopy = useCallback(() => {
    if (!fileContent) {
      return;
    }
    copy(fileContent, { format: 'text/plain' });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  }, [fileContent]);

  const displayType = useMemo(() => getDisplayType(fileType, fileName), [fileType, fileName]);
  const sortedPages = useMemo(
    () => (pages && pageRelevance ? sortPagesByRelevance(pages, pageRelevance) : pages),
    [pages, pageRelevance],
  );

  const metaParts: string[] = [displayType];
  if (relevance != null && relevance > 0) {
    metaParts.push(`${localize('com_ui_relevance')}: ${Math.round(relevance * 100)}%`);
  }
  if (fileSize != null && fileSize > 0) {
    metaParts.push(formatBytes(fileSize));
  }
  if (sortedPages && sortedPages.length > 0) {
    metaParts.push(localize('com_file_pages', { pages: sortedPages.join(', ') }));
  }

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent
        className="flex w-full max-w-4xl flex-col !overflow-hidden p-0"
        showCloseButton={true}
      >
        <div className="shrink-0 px-6 pr-12 pt-6">
          <OGDialogTitle className="truncate text-base">{fileName}</OGDialogTitle>
          <div className="mt-0.5 flex items-center gap-3">
            <OGDialogDescription className="min-w-0 truncate">
              {metaParts.join(' · ')}
            </OGDialogDescription>
            {fileId && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
                aria-label={`${localize('com_ui_download')} ${fileName}`}
              >
                <Download className="size-3" aria-hidden="true" />
                {localize('com_ui_download')}
              </button>
            )}
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {(loading || officePreviewLoading) && (
            <div className="flex h-60 items-center justify-center rounded-lg bg-surface-secondary">
              <span className="shimmer text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </span>
            </div>
          )}
          {officeHtml != null && (
            /* `sandbox` without `allow-same-origin` puts the document in an
             * opaque origin: no cookies, no storage, no reach into this page.
             * `allow-scripts` is needed for the sheet-tab strip the backend
             * emits for multi-sheet workbooks, and is safe precisely because
             * same-origin is withheld. The HTML itself was already sanitized
             * server-side by `sanitizeOfficeHtml`. */
            <iframe
              srcDoc={officeHtml}
              sandbox="allow-scripts"
              title={`${localize('com_ui_preview')}: ${fileName}`}
              className="h-[70vh] w-full rounded-lg border border-border-light bg-white"
            />
          )}
          {officePreviewFailed && (
            <div className="flex h-32 items-center justify-center rounded-lg bg-surface-secondary">
              <span className="text-sm text-text-secondary">
                {localize('com_ui_preview_unavailable')}
              </span>
            </div>
          )}
          {previewError && (
            <div className="flex h-32 items-center justify-center rounded-lg bg-surface-secondary">
              <span className="text-sm text-text-secondary">
                {localize('com_ui_preview_unavailable')}
              </span>
            </div>
          )}
          {fileBlobUrl && (
            <iframe
              src={fileBlobUrl}
              title={`${localize('com_ui_preview')}: ${fileName}`}
              className="h-[70vh] w-full rounded-lg border border-border-light"
            />
          )}
          {fileContent !== null && (
            <>
              <div className="pointer-events-none sticky top-0 z-10 flex justify-end pr-1">
                <CopyButton
                  isCopied={isCopied}
                  onClick={handleCopy}
                  iconOnly
                  label={localize('com_ui_copy')}
                  className="pointer-events-auto rounded-lg bg-surface-secondary"
                />
              </div>
              <div className="-mt-8 rounded-lg bg-surface-secondary p-4">
                <pre className="whitespace-pre-wrap break-words pr-8 font-mono text-sm leading-6 text-text-primary">
                  {fileContent}
                </pre>
              </div>
            </>
          )}
          {!previewKind && !loading && !isOfficePreview && (
            <div className="flex h-32 items-center justify-center rounded-lg bg-surface-secondary">
              <span className="text-sm text-text-secondary">
                {localize('com_ui_preview_unavailable')}
              </span>
            </div>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
