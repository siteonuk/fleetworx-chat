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

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function useChangelog() {
    const { data: changelog, error, isLoading } = useSWR<ChangelogEntry[]>('/changelog.json', fetcher, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
    });

    const currentVersion = changelog?.find((e) => e.isCurrent)?.version ?? 'v1.3.1';

    return {
        changelog: changelog ?? [],
        currentVersion,
        isLoading,
        error,
    };
}
