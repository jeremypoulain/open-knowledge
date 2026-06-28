import { describe, expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

mock.module('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

mock.module('@/components/ui/select', () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children?: ReactNode; value: string }) => {
    if (value === '') throw new Error('SelectItem value must not be empty');
    return <div data-value={value}>{children}</div>;
  },
  SelectTrigger: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: ReactNode }) => <>{placeholder}</>,
}));

mock.module('@/hooks/use-ai-status', () => ({
  useAiStatus: () => ({
    status: {
      defaultProvider: null,
      providers: {
        anthropic: { present: false, hint: null, source: null, model: null, baseUrl: null },
        openai: { present: false, hint: null, source: null, model: null, baseUrl: null },
        gemini: { present: false, hint: null, source: null, model: null, baseUrl: null },
        groq: { present: false, hint: null, source: null, model: null, baseUrl: null },
        openrouter: { present: false, hint: null, source: null, model: null, baseUrl: null },
        mistral: { present: false, hint: null, source: null, model: null, baseUrl: null },
        'ollama-local': { present: true, hint: null, source: null, model: null, baseUrl: null },
        'ollama-cloud': { present: false, hint: null, source: null, model: null, baseUrl: null },
        ollama: { present: false, hint: null, source: null, model: null, baseUrl: null },
        'nvidia-nim': { present: false, hint: null, source: null, model: null, baseUrl: null },
        zai: { present: false, hint: null, source: null, model: null, baseUrl: null },
        'opencode-zen': { present: false, hint: null, source: null, model: null, baseUrl: null },
        'opencode-go': { present: false, hint: null, source: null, model: null, baseUrl: null },
        opencode: { present: false, hint: null, source: null, model: null, baseUrl: null },
      },
    },
    refresh: () => {},
  }),
}));

mock.module('./use-config-form', () => ({
  useConfigForm: () => ({
    form: {
      watch: (name: string) => {
        if (name === 'ai.defaultProvider') return null;
        if (name.endsWith('.model')) return '';
        if (name.endsWith('.baseUrl')) return '';
        return undefined;
      },
      setValue: () => {},
    },
    commitField: () => true,
    commitFieldValue: () => true,
  }),
}));

describe('AiProvidersSection', () => {
  test('renders the default-provider picker without using an empty Select item value', async () => {
    const { AiProvidersSection } = await import('./AiProvidersSection');

    const html = renderToStaticMarkup(<AiProvidersSection binding={{} as never} />);

    expect(html).toContain('settings-ai');
    expect(html).toContain('Default provider');
    expect(html).toContain('None');
    expect(html).toContain('gpt-4o-mini');
    expect(html).toContain('Google Gemini');
    expect(html).toContain('Groq');
    expect(html).toContain('OpenRouter');
    expect(html).toContain('Ollama Local');
    expect(html).toContain('Ollama Cloud');
    expect(html).toContain('OpenCode Zen');
    expect(html).toContain('OpenCode Go');
    expect(html).toContain('Default:');
    expect(html).toContain('Refresh list');
  });
});
