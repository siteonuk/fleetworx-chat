import React, { useState } from 'react';
import { X, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import useChangelog, { type ChangelogEntry } from '~/hooks/useChangelog';



interface VersionBadgeProps {
    version: string;
    isCurrent?: boolean;
}

function VersionBadge({ version, isCurrent }: VersionBadgeProps) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isCurrent
                ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                : 'bg-surface-secondary text-text-secondary ring-1 ring-border-medium'
                }`}
        >
            <Tag size={10} />
            {version}
            {isCurrent && <span className="ml-1 font-normal opacity-75">current</span>}
        </span>
    );
}

interface ChangelogCardProps {
    entry: ChangelogEntry;
    defaultOpen?: boolean;
}

function ChangelogCard({ entry, defaultOpen = false }: ChangelogCardProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div
            className={`rounded-xl border transition-all duration-200 ${entry.isCurrent
                ? 'border-green-500/30 bg-green-500/5'
                : 'border-border-medium bg-surface-secondary'
                }`}
        >
            {/* Header */}
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                aria-expanded={open}
            >
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <VersionBadge version={entry.version} isCurrent={entry.isCurrent} />
                    <span className="truncate text-sm font-medium text-text-primary">{entry.date}</span>
                </div>
                <div className="ml-2 flex shrink-0 items-center">
                    {open ? (
                        <ChevronUp size={16} className="text-text-secondary" />
                    ) : (
                        <ChevronDown size={16} className="text-text-secondary" />
                    )}
                </div>
            </button>

            {/* Body */}
            {open && (
                <div className="border-t border-border-medium px-5 pb-5 pt-4">
                    {entry.sections?.map((section) => (
                        <div key={section.title} className="mb-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                                {section.title}
                            </p>
                            <ul className="space-y-2">
                                {section.items.map((item, i) => (
                                    <li key={i} className="flex gap-2 text-sm text-text-primary">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    {entry.workInProgress && (
                        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                                🚧 {entry.workInProgress.title}
                            </p>
                            <ul className="space-y-2">
                                {entry.workInProgress.items.map((item, i) => (
                                    <li key={i} className="flex gap-2 text-sm text-amber-200/80">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ChangelogModal({ isOpen, onClose }: ChangelogModalProps) {
    const { changelog, currentVersion, isLoading, error } = useChangelog();
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Changelog"
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div
                className="relative z-10 flex w-full max-w-xl flex-col rounded-2xl border border-border-medium bg-surface-primary shadow-2xl"
                style={{ maxHeight: '85vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border-medium px-6 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-text-primary">Changelog</h2>
                        <p className="text-xs text-text-secondary">Fleetworx AI release history</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                        aria-label="Close changelog"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {isLoading ? (
                        <div className="flex h-40 items-center justify-center">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : error ? (
                        <div className="flex h-40 flex-col items-center justify-center gap-3 px-4 text-center">
                            <p className="text-sm text-text-secondary">Failed to load release history.</p>
                            <button 
                                onClick={() => window.location.reload()}
                                className="text-xs font-medium text-primary hover:underline"
                            >
                                Try refreshing the page
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {changelog.map((entry, index) => (
                                <ChangelogCard key={entry.version} entry={entry} defaultOpen={index === 0} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-border-medium px-6 py-3 text-center text-xs text-text-secondary">
                    Current version: <span className="font-semibold text-text-primary">{currentVersion}</span>
                </div>
            </div>
        </div>
    );
}


