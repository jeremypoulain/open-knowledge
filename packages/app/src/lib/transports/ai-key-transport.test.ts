import { describe, expect, test } from 'bun:test';
import { httpAiKeyTransport } from './ai-key-transport.ts';

/** Monkey-patches global fetch for one call returning the given NDJSON body. */
function withFetch(body: string, status = 200): void {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  const res = new Response(stream, { status });
  (globalThis as { fetch: unknown }).fetch = (async () => res) as unknown as typeof fetch;
}

function withJson(body: unknown, status = 200): void {
  const res = new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  (globalThis as { fetch: unknown }).fetch = (async () => res) as unknown as typeof fetch;
}

describe('httpAiKeyTransport.streamTransform', () => {
  test('emits deltas then complete', async () => {
    const ndjson = [
      '{"type":"delta","text":"Hel"}',
      '{"type":"delta","text":"lo"}',
      '{"type":"complete"}',
    ].join('\n');
    withFetch(ndjson);
    const deltas: string[] = [];
    let completed = false;
    await httpAiKeyTransport().streamTransform(
      { action: 'concise', selection: 'Hello world' },
      {
        onDelta: (t) => deltas.push(t),
        onComplete: () => {
          completed = true;
        },
        onError: () => {},
      },
    );
    expect(deltas.join('')).toBe('Hello');
    expect(completed).toBe(true);
  });

  test('surfaces a mid-stream error event', async () => {
    withFetch('{"type":"error","message":"No key set."}');
    let errored: string | null = null;
    await httpAiKeyTransport().streamTransform(
      { action: 'improve', selection: 'x' },
      {
        onDelta: () => {},
        onComplete: () => {},
        onError: (m) => {
          errored = m;
        },
      },
    );
    expect(errored).toBe('No key set.');
  });
});

describe('httpAiKeyTransport.listModels', () => {
  test('returns models from the local AI models route', async () => {
    withJson({ provider: 'openai', models: ['gpt-4o-mini', 'gpt-4.1-mini'] });

    const result = await httpAiKeyTransport().listModels('openai');

    expect(result).toEqual({ ok: true, models: ['gpt-4o-mini', 'gpt-4.1-mini'] });
  });

  test('surfaces problem details when model lookup fails', async () => {
    withJson({ title: 'No API key set for Google Gemini.' }, 400);

    const result = await httpAiKeyTransport().listModels('gemini');

    expect(result).toEqual({ ok: false, error: 'No API key set for Google Gemini.' });
  });
});
