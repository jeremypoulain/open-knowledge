import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codeLanguageForExtension } from '@inkeep/open-knowledge-core';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { loadCodeMirrorLanguageForExtension } from './text-viewer-languages';
import { useViewerText, type ViewerTextSource } from './use-viewer-text';
import { ViewerErrorPane, ViewerLoadingPane } from './ViewerStatusPane';

const darkTheme = basicDarkInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--muted)',
  },
});

const lightTheme = basicLightInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--muted)',
  },
});

type TextViewerProps = ViewerTextSource & {
  anchor?: string;
  fileName: string;
  extension: string;
};

function parseLineAnchor(anchor: string | undefined): number | null {
  if (!anchor) return null;
  const line = new URLSearchParams(anchor).get('line');
  if (!line) return null;
  const n = Number.parseInt(line, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function scrollToLine(view: EditorView, lineNumber: number): void {
  if (typeof Window !== 'function') return;
  const line = view.state.doc.line(Math.max(1, Math.min(lineNumber, view.state.doc.lines)));
  view.dispatch({
    selection: EditorSelection.cursor(line.from),
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  });
}

export function TextViewer({ fileName, extension, anchor, ...source }: TextViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { resolvedTheme } = useTheme();
  const fetchState = useViewerText(source);
  const loadedContent = fetchState.status === 'loaded' ? fetchState.content : null;
  const anchorLine = parseLineAnchor(anchor);

  useEffect(() => {
    if (!containerRef.current) return;
    if (loadedContent === null) return;

    const normalized = extension.toLowerCase();
    const canonical = codeLanguageForExtension(normalized);
    const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;
    let aborted = false;
    let view: EditorView | null = null;
    void loadCodeMirrorLanguageForExtension(normalized, canonical).then((language) => {
      if (aborted) return;
      if (!containerRef.current) return;
      const extensions = [
        basicSetup,
        ...(language ? [language] : []),
        EditorView.editable.of(true),
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
        theme,
      ];
      view = new EditorView({
        state: EditorState.create({ doc: loadedContent, extensions }),
        parent: containerRef.current,
      });
      viewRef.current = view;
      if (anchorLine !== null) scrollToLine(view, anchorLine);
    });

    return () => {
      aborted = true;
      view?.destroy();
      viewRef.current = null;
    };
  }, [loadedContent, extension, resolvedTheme, anchorLine]);

  useEffect(() => {
    if (anchorLine === null || viewRef.current === null) return;
    scrollToLine(viewRef.current, anchorLine);
  }, [anchorLine]);

  const extraAttrs = { 'data-text-viewer-extension': extension };
  if (fetchState.status === 'loading') {
    return (
      <ViewerLoadingPane fileName={fileName} dataAttr="data-text-viewer" extraAttrs={extraAttrs} />
    );
  }

  if (fetchState.status === 'error') {
    return (
      <ViewerErrorPane
        fileName={fileName}
        dataAttr="data-text-viewer"
        extraAttrs={extraAttrs}
        message={fetchState.message}
        openHref={source.src}
      />
    );
  }

  return (
    <main
      className="flex h-full min-h-0 flex-col bg-background"
      aria-label={fileName}
      data-text-viewer=""
      data-text-viewer-state="loaded"
      data-text-viewer-extension={extension}
      data-text-viewer-line={anchorLine ?? undefined}
    >
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto" />
    </main>
  );
}
