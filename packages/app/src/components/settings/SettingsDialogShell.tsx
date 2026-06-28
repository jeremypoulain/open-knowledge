// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button> awaiting shadcn Button migration; tracked at https://github.com/inkeep/open-knowledge/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import { SHOW_INSTALL_SKILL } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { ArrowUpRight } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { SettingsDialogBodyLazy } from '@/components/settings/SettingsDialogBodyLazy';
import { SettingsDialogErrorBoundary } from '@/components/settings/SettingsDialogErrorBoundary';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentContext } from '@/editor/DocumentContext';
import { useConfigContext } from '@/lib/config-provider';
import { useClaudeDesktopIntegration } from '@/lib/handoff/use-claude-desktop-integration';
import { cn } from '@/lib/utils';

function releaseNotesUrl(version: string): string {
  return `https://github.com/inkeep/open-knowledge/releases/tag/v${encodeURIComponent(version)}`;
}

interface SidebarItem {
  id: string;
  label: string;
}

interface SidebarGroup {
  id: 'user' | 'project' | 'integrations';
  label: string;
  enabled: boolean;
  items: SidebarItem[];
}

interface SettingsDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialogShell({ open, onOpenChange }: SettingsDialogShellProps) {
  const { t } = useLingui();
  const { collabUrl } = useDocumentContext();
  const { userBinding, userSynced, okignoreBinding, okignoreSynced } = useConfigContext();
  const { desktopPresent } = useClaudeDesktopIntegration();
  const titleId = 'settings-dialog-title';

  const [activeId, setActiveId] = useState<string>('preferences');
  useEffect(() => {
    if (open) setActiveId('preferences');
  }, [open]);

  const hasProject = collabUrl !== null;

  const isOkDesktopHost = typeof window !== 'undefined' && window.okDesktop != null;

  const groups: SidebarGroup[] = [
    {
      id: 'user',
      label: t`User`,
      enabled: true,
      items: [
        { id: 'preferences', label: t`Preferences` },
        { id: 'hotkeys', label: t`Hotkeys` },
        { id: 'ai', label: t`AI` },
        { id: 'account', label: t`Account` },
      ],
    },
    {
      id: 'project',
      label: t`This project`,
      enabled: hasProject,
      items: [
        { id: 'sync', label: t`Sync` },
        { id: 'search', label: t`Search` },
        ...(isOkDesktopHost ? [{ id: 'terminal', label: t`Terminal` }] : []),
        { id: 'project-templates', label: t`Templates` },
        { id: 'skills', label: t`Skills` },
        { id: 'okignore', label: t`Ignore patterns` },
        { id: 'sharing', label: t`Config sharing` },
      ],
    },
    {
      id: 'integrations',
      label: t`Integrations`,
      enabled: true,
      items:
        desktopPresent && SHOW_INSTALL_SKILL
          ? [{ id: 'claude-desktop', label: t`Claude Desktop` }]
          : [],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[700px] max-h-[calc(100dvh-4rem)] w-[900px] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:grid sm:grid-cols-[220px_1fr] sm:max-w-[min(900px,calc(100%-2rem))]"
        data-testid="settings-dialog"
      >
        <DialogTitle className="sr-only" id={titleId}>
          <Trans>Settings</Trans>
        </DialogTitle>
        <DialogDescription className="sr-only">
          <Trans>Configure user, project, and integration settings.</Trans>
        </DialogDescription>
        <SettingsSidebar groups={groups} activeId={activeId} onSelect={setActiveId} />
        <section
          aria-labelledby={titleId}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain subtle-scrollbar p-6"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: this scrollable content section must be focusable so keyboard users can scroll long settings pages.
          tabIndex={0}
        >
          <SettingsDialogErrorBoundary>
            <Suspense fallback={<SettingsContentSkeleton />}>
              <SettingsDialogBodyLazy
                activeId={activeId}
                userBinding={userSynced ? userBinding : null}
                okignoreBinding={okignoreBinding}
                okignoreSynced={okignoreSynced}
              />
            </Suspense>
          </SettingsDialogErrorBoundary>
        </section>
      </DialogContent>
    </Dialog>
  );
}

interface SettingsSidebarProps {
  groups: SidebarGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}

function SettingsSidebar({ groups, activeId, onSelect }: SettingsSidebarProps) {
  const { t } = useLingui();
  return (
    <nav
      aria-label={t`Settings sections`}
      className="flex shrink-0 gap-x-3 overflow-x-auto overscroll-contain subtle-scrollbar scroll-fade-mask-x-max-sm border-b bg-muted/30 px-3 py-2 max-sm:pt-10 sm:h-full sm:flex-col sm:gap-0 sm:overflow-x-visible sm:overflow-y-auto sm:border-r sm:border-b-0 sm:py-4"
    >
      {groups.map((group) => (
        <SettingsSidebarGroup
          key={group.id}
          group={group}
          activeId={activeId}
          onSelect={onSelect}
        />
      ))}
      <SettingsSidebarVersion />
    </nav>
  );
}

function SettingsSidebarVersion() {
  const bridge = typeof window !== 'undefined' ? (window.okDesktop ?? null) : null;
  const version = bridge?.appVersion;
  if (!bridge || !version) return null;

  const url = releaseNotesUrl(version);
  return (
    <div className="ml-auto shrink-0 px-2 sm:ml-0 sm:mt-auto sm:pt-3">
      <p
        className="whitespace-nowrap font-mono text-xs text-muted-foreground/70"
        data-testid="settings-sidebar-version"
      >
        v{version}
      </p>
      <button
        type="button"
        onClick={() => {
          void bridge.shell.openExternal(url);
        }}
        data-testid="settings-sidebar-release-notes"
        className={cn(
          'mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded text-xs text-muted-foreground transition-colors hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <Trans>Release notes</Trans>
        <ArrowUpRight className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}

function SettingsSidebarGroup({
  group,
  activeId,
  onSelect,
}: {
  group: SidebarGroup;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (group.items.length === 0) return null;
  const headerId = `settings-group-${group.id}`;
  const captionId = `${headerId}-caption`;
  return (
    <div className="flex shrink-0 items-center gap-2 sm:mb-4 sm:block">
      <h3
        id={headerId}
        aria-describedby={group.enabled ? undefined : captionId}
        className={cn(
          'shrink-0 whitespace-nowrap px-2 text-xs font-semibold uppercase tracking-wide font-mono sm:mb-1',
          group.enabled ? 'text-muted-foreground/80' : 'text-muted-foreground/50',
        )}
      >
        {group.label}
      </h3>
      {!group.enabled ? (
        <p id={captionId} className="px-2 text-xs italic text-muted-foreground/60 sm:mb-1">
          <Trans>Open a project to edit.</Trans>
        </p>
      ) : null}
      <ul aria-labelledby={headerId} className="flex gap-1 sm:block sm:space-y-0.5">
        {group.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-current={activeId === item.id ? 'page' : undefined}
              aria-disabled={group.enabled ? undefined : true}
              aria-describedby={group.enabled ? undefined : captionId}
              tabIndex={group.enabled ? 0 : -1}
              disabled={!group.enabled}
              onClick={() => group.enabled && onSelect(item.id)}
              data-testid={`settings-sidebar-item-${item.id}`}
              className={cn(
                'w-auto whitespace-nowrap rounded px-2 py-1.5 text-left text-sm transition-colors sm:w-full',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                activeId === item.id && group.enabled
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50',
              )}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsContentSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-3"
      data-testid="settings-content-skeleton"
    >
      <span className="sr-only">
        <Trans>Loading settings</Trans>
      </span>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-64" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}
