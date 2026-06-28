import type { AiProviderId, AiTransformAction } from '@inkeep/open-knowledge-core';
import { Trans } from '@lingui/react/macro';
import { isMacOS } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { Sparkles } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { emitOpenAskAiComposer } from '@/components/ask-ai-composer-events';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { AiTransformPreview, type AiTransformState } from '@/editor/ai/AiTransformPreview';
import { serializeWysiwygSelection } from '@/editor/edit-with-ai-selection';
import { getSharedMarkdownManager } from '@/editor/utils/md-singleton';
import { pickDefaultProvider, useAiStatus } from '@/hooks/use-ai-status';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { type AiKeyTransport, httpAiKeyTransport } from '@/lib/transports/ai-key-transport';

interface QuickAction {
  id: AiTransformAction;
  label: ReactNode;
}

function isNativeTextControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toUpperCase();
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

export function AiMenuBubbleButton({
  editor,
  shortcutEnabled = false,
  transport,
}: {
  editor: Editor;
  shortcutEnabled?: boolean;
  transport?: AiKeyTransport;
}): ReactNode {
  const isMac = isMacOS();
  const isEmbedded = useIsEmbedded();
  const resolvedTransport = transport ?? httpAiKeyTransport();
  const { status } = useAiStatus({ transport: resolvedTransport });
  const handoffAvailable = isMac && !isEmbedded;

  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [transform, setTransform] = useState<AiTransformState | null>(null);
  const activeActionRef = useRef<{ action: AiTransformAction; instruction?: string } | null>(null);

  // Preserve the existing ⇧⌘ I shortcut → Ask AI composer (handoff).
  useEffect(() => {
    if (!shortcutEnabled || !handoffAvailable) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!matchesKeyboardShortcut(event, 'edit-with-ai')) return;
      if (isNativeTextControl(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      emitOpenAskAiComposer();
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [shortcutEnabled, handoffAvailable]);

  function captureSelection(): { from: number; to: number; md: string } | null {
    const { from, to, empty } = editor.state.selection;
    if (empty) return null;
    const md = serializeWysiwygSelection(editor);
    if (!md.trim()) return null;
    return { from, to, md };
  }

  function startTransform(action: AiTransformAction, instructionText?: string): void {
    const sel = captureSelection();
    if (!sel) return;
    setOpen(false);
    activeActionRef.current = { action, instruction: instructionText };
    setTransform({
      from: sel.from,
      to: sel.to,
      original: sel.md,
      proposed: '',
      status: 'streaming',
      errorMessage: null,
      action,
      instruction: instructionText,
    });
    const provider: AiProviderId | undefined = pickDefaultProvider(status) ?? undefined;
    void resolvedTransport.streamTransform(
      {
        provider,
        action,
        instruction: instructionText,
        selection: sel.md,
      },
      {
        onDelta: (text) => {
          setTransform((prev) =>
            prev ? { ...prev, proposed: prev.proposed + text, status: 'streaming' } : prev,
          );
        },
        onComplete: () => {
          setTransform((prev) => (prev ? { ...prev, status: 'complete' } : prev));
        },
        onError: (message) => {
          setTransform((prev) =>
            prev ? { ...prev, status: 'error', errorMessage: message } : prev,
          );
        },
      },
    );
  }

  function retry(): void {
    const active = activeActionRef.current;
    if (!active) return;
    startTransform(active.action, active.instruction);
  }

  function closePreview(): void {
    setTransform(null);
    activeActionRef.current = null;
  }

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="ai-menu-bubble-button"
      className="gap-1 px-2 text-sm font-medium text-accent-foreground/80"
    >
      <Sparkles className="size-3.5" aria-hidden="true" />
      <span>AI</span>
    </Button>
  );

  return (
    <>
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-64 p-1"
          data-testid="ai-menu-popover"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <AiMenuContent
            onAction={(action) => startTransform(action)}
            onCustom={(text) => {
              if (!text.trim()) return;
              startTransform('custom', text.trim());
              setInstruction('');
            }}
            instruction={instruction}
            setInstruction={setInstruction}
            handoffAvailable={handoffAvailable}
            onSendToAgent={() => {
              setOpen(false);
              emitOpenAskAiComposer();
            }}
          />
        </PopoverContent>
      </Popover>
      {transform ? (
        <AiTransformPreview
          editor={editor}
          mdManager={getSharedMarkdownManager()}
          state={transform}
          onAccept={closePreview}
          onReject={closePreview}
          onRetry={retry}
        />
      ) : null}
    </>
  );
}

interface AiMenuContentProps {
  onAction: (action: AiTransformAction) => void;
  onCustom: (text: string) => void;
  instruction: string;
  setInstruction: (s: string) => void;
  handoffAvailable: boolean;
  onSendToAgent: () => void;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'improve', label: <Trans>Improve</Trans> },
  { id: 'clarify', label: <Trans>Clarify</Trans> },
  { id: 'concise', label: <Trans>Make concise</Trans> },
  { id: 'fix-grammar', label: <Trans>Fix grammar & spelling</Trans> },
  { id: 'longer', label: <Trans>Make longer</Trans> },
  { id: 'friendly-tone', label: <Trans>Friendly tone</Trans> },
  { id: 'professional-tone', label: <Trans>Professional tone</Trans> },
  { id: 'summarize', label: <Trans>Summarize</Trans> },
];

function AiMenuContent({
  onAction,
  onCustom,
  instruction,
  setInstruction,
  handoffAvailable,
  onSendToAgent,
}: AiMenuContentProps): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-col">
        {QUICK_ACTIONS.map((qa) => (
          <Button
            key={qa.id}
            variant="ghost"
            size="sm"
            className="justify-start font-normal"
            data-testid={`ai-menu-action-${qa.id}`}
            onClick={() => onAction(qa.id)}
          >
            {qa.label}
          </Button>
        ))}
      </div>
      <Separator className="my-1" />
      <form
        className="flex items-center gap-1.5 px-1 pb-1"
        onSubmit={(e) => {
          e.preventDefault();
          onCustom(instruction);
        }}
      >
        <Input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Custom instruction..."
          aria-label="Custom AI instruction"
          data-testid="ai-menu-instruction"
          className="h-8 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          disabled={instruction.trim().length === 0}
          data-testid="ai-menu-instruction-submit"
        >
          <Trans>Go</Trans>
        </Button>
      </form>
      {handoffAvailable ? (
        <>
          <Separator className="my-1" />
          <Button
            variant="ghost"
            size="sm"
            className="justify-start font-normal text-muted-foreground"
            data-testid="ai-menu-send-to-agent"
            onClick={onSendToAgent}
          >
            <Trans>Send to agent...</Trans>
          </Button>
        </>
      ) : null}
    </div>
  );
}
