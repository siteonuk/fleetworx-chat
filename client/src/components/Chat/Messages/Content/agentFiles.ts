import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { request, apiBaseUrl } from 'librechat-data-provider';
import { fileToArtifact, TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import store from '~/store';

/**
 * A link to a file the Fleetworx agent produced — a cost file or an export,
 * served at /files/<name> with no user folder. Uploaded and code-output files
 * live under /files/<userId>/… and keep their own handling in the anchor.
 */
export const AGENT_FILE_LINK =
  /\/files\/([A-Za-z0-9][A-Za-z0-9._-]{0,200}\.(csv|xlsx|xls))(?:[?#].*)?$/i;

const MIME: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

type AgentFilePreview = { status: 'ready' | 'failed'; text?: string; textFormat?: string };

/**
 * Opens an agent file as a table in the right-side artifacts panel — the
 * same spreadsheet preview a code-execution .xlsx gets. The HTML is built
 * and sanitized by the chat server (`/files/agent-export/…`). The panel's
 * Download button fetches the original file from the link itself.
 *
 * Resolves false when no preview could be made, so the caller can fall
 * back to opening the link.
 */
export function useOpenAgentFile() {
  const setArtifacts = useSetRecoilState(store.artifactsState);
  const setCurrentArtifactId = useSetRecoilState(store.currentArtifactId);
  const setVisible = useSetRecoilState(store.artifactsVisibility);

  return useCallback(
    async (href: string, name: string): Promise<boolean> => {
      try {
        const preview = (await request.get(
          `${apiBaseUrl()}/api/files/agent-export/${encodeURIComponent(name)}/preview`,
        )) as AgentFilePreview;
        if (preview?.status !== 'ready' || preview.textFormat !== 'html' || !preview.text) {
          return false;
        }
        const ext = name.split('.').pop()?.toLowerCase() ?? '';
        const artifact = fileToArtifact(
          {
            file_id: `agent-export-${name}`,
            filename: name,
            filepath: href,
            type: MIME[ext],
            text: preview.text,
            textFormat: 'html',
          },
          { preClassifiedType: TOOL_ARTIFACT_TYPES.SPREADSHEET },
        );
        if (!artifact) {
          return false;
        }
        setArtifacts((prev) => ({ ...(prev ?? {}), [artifact.id]: artifact }));
        setCurrentArtifactId(artifact.id);
        setVisible(true);
        return true;
      } catch {
        return false;
      }
    },
    [setArtifacts, setCurrentArtifactId, setVisible],
  );
}
