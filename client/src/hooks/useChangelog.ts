import useSWR from 'swr';

export interface ChangelogEntry {
    version: string;
    date: string;
    devDate?: string;
    isCurrent?: boolean;
    highlights: string[];
    sections?: {
        title: string;
        items: string[];
    }[];
    workInProgress?: {
        title: string;
        items: string[];
    };
}

// The changelog lives in the agent and is published to the shared /files volume,
// so it updates without a frontend rebuild. Override with VITE_CHANGELOG_URL if
// the agent is proxied at a different path.
const CHANGELOG_URL = import.meta.env.VITE_CHANGELOG_URL || '/files/changelog.json';

const fetcher = async (url: string) => {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as ChangelogEntry[];
};

export default function useChangelog() {
    const { data: changelog, error, isLoading } = useSWR<ChangelogEntry[]>(CHANGELOG_URL, fetcher, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false,
    });

    if (error) {
        console.error('Changelog fetch error:', error);
    }

    const currentVersion = changelog?.find((e) => e.isCurrent)?.version ?? 'v1.3.1';

    return {
        changelog: changelog ?? [],
        currentVersion,
        isLoading,
        error,
    };
}
