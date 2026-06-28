import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { posToDOMRect } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { Check, Loader2, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

export type AiTransformStatus = 'streaming' | 'complete' | 'error';

export interface AiTransformState {
  /** Editor range captured when the action fired. */
  from: number;
  to: number;
  original: string;
  proposed: string;
  status: AiTransformStatus;
  errorMessage: string | null;
  /** What to re-run on Retry. */
  action: import('@inkeep/open-knowledge-core').AiTransformAction;
  instruction?: string;
}

interface AiTransformPreviewProps {
  editor: Editor;
  mdManager: MarkdownManager;
  state: AiTransformState;
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
}

/** Word-level line diff (LCS). Returns per-line entries: same / removed / added. */
interface DiffLine {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

function diffLines(a: string, b: string): DiffLine[] {
  const la = a.split('\n');
  const lb = b.split('\n');
  const m = la.length;
  const n = lb.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (la[i] === lb[j]) {
      out.push({ kind: 'same', text: la[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'removed', text: la[i] });
      i++;
    } else {
      out.push({ kind: 'added', text: lb[j] });
      j++;
    }
  }
  while (i < m) out.push({ kind: 'removed', text: la[i++] });
  while (j < n) out.push({ kind: 'added', text: lb[j++] });
  return out;
}

export function AiTransformPreview({
  editor,
  mdManager,
  state,
  onAccept,
  onReject,
  onRetry,
}: AiTransformPreviewProps) {
  const { t } = useLingui();
  const cardRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const virtualEl = {
      getBoundingClientRect: () => {
        try {
          return posToDOMRect(editor.view, state.from, state.to);
        } catch {
          return new DOMRect();
        }
      },
      contextElement: editor.view.dom,
    };
    stopRef.current?.();
    stopRef.current = autoUpdate(virtualEl, card, () => {
      computePosition(virtualEl, card, {
        placement: 'bottom',
        strategy: 'fixed',
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      })
        .then(({ x, y }) => {
          if (card.isConnected) {
            card.style.position = 'fixed';
            card.style.left = `${x}px`;
            card.style.top = `${y}px`;
          }
        })
        .catch(() => {});
    });
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [editor, state.from, state.to]);

  function accept() {
    const json = mdManager.parse(state.proposed);
    editor.chain().focus().insertContentAt({ from: state.from, to: state.to }, json).run();
    onAccept();
  }

  const lines = diffLines(state.original, state.proposed);

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-label={t`AI edit preview`}
      data-testid="ai-transform-preview"
      className="fixed z-[60] flex max-h-[60vh] w-[min(560px,calc(100vw-2rem))] flex-col gap-2 overflow-hidden rounded-lg border bg-background p-3 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {state.status === 'streaming' ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : null}
          <span>
            {state.status === 'streaming' ? (
              <Trans>Generating...</Trans>
            ) : state.status === 'error' ? (
              <Trans>Something went wrong</Trans>
            ) : (
              <Trans>Proposed edit</Trans>
            )}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={t`Reject`}
          onClick={onReject}
          data-testid="ai-transform-reject"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      {state.status === 'error' ? (
        <p className="text-sm text-destructive" data-testid="ai-transform-error">
          {state.errorMessage ?? t`The AI request failed.`}
        </p>
      ) : (
        <div className="subtle-scrollbar overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs leading-relaxed">
          {lines.length === 0 && state.status === 'streaming' ? (
            <span className="text-muted-foreground">
              <Trans>Waiting for the model...</Trans>
            </span>
          ) : null}
          {lines.map((line, idx) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: line order is the identity here.
              key={idx}
              className={
                line.kind === 'removed'
                  ? 'bg-destructive/10 text-destructive line-through'
                  : line.kind === 'added'
                    ? 'bg-emerald-500/15 text-foreground'
                    : 'text-muted-foreground'
              }
            >
              {line.text === '' ? ' ' : line.text}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {state.status !== 'streaming' ? (
          <Button variant="outline" size="sm" onClick={onRetry} data-testid="ai-transform-retry">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <Trans>Retry</Trans>
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={accept}
          disabled={state.status === 'streaming' || state.status === 'error'}
          data-testid="ai-transform-accept"
        >
          <Check className="size-3.5" aria-hidden="true" />
          <Trans>Accept</Trans>
        </Button>
      </div>
    </div>,
    document.body,
  );
}
