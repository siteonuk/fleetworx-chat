import useSWR from 'swr';

export interface ChangelogEntry {
    version: string;
    date: string;
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

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    return res.json();
};

export default function useChangelog() {
    const { data: changelog, error, isLoading } = useSWR<ChangelogEntry[]>('/changelog.json', fetcher, {
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
