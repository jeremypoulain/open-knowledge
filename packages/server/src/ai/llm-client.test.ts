import { describe, expect, test } from 'bun:test';
import { getAiProvider } from '@inkeep/open-knowledge-core';
import { completeChat, listAvailableModels, streamChat } from './llm-client.ts';

/** Builds a fake fetch that returns the given chunks as the streaming body. */
function fakeFetch(chunks: Uint8Array[]): typeof fetch {
  return (async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;
}

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function jsonFetch(body: unknown, capture?: (url: string) => void): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    capture?.(url);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('streamChat adapters', () => {
  test('openai-compat parses SSE choices deltas', async () => {
    const body = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ].map(enc);
    const provider = getAiProvider('openai');
    const out: string[] = [];
    for await (const d of streamChat(
      {
        provider,
        model: 'gpt-4o-mini',
        baseUrl: provider.defaultBaseUrl,
        apiKey: 'k',
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        fetchImpl: fakeFetch(body),
      },
      { surface: 'transform' },
    )) {
      out.push(d);
    }
    expect(out.join('')).toBe('Hello world');
  });

  test('anthropic parses content_block_delta events', async () => {
    const body = [
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].map(enc);
    const provider = getAiProvider('anthropic');
    const text = await completeChat(
      {
        provider,
        model: provider.defaultModel,
        baseUrl: provider.defaultBaseUrl,
        apiKey: 'k',
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        fetchImpl: fakeFetch(body),
      },
      { surface: 'suggest-tags' },
    );
    expect(text).toBe('Hi there');
  });

  test('ollama-native parses NDJSON message.content deltas', async () => {
    const body = [
      enc('{"message":{"content":"Hello"},"done":false}\n'),
      enc('{"message":{"content":" world"},"done":false}\n'),
      enc('{"message":{"content":""},"done":true}\n'),
    ];
    const provider = getAiProvider('ollama-local');
    const out: string[] = [];
    for await (const d of streamChat(
      {
        provider,
        model: 'llama3.2',
        baseUrl: provider.defaultBaseUrl,
        apiKey: null,
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        fetchImpl: fakeFetch(body),
      },
      { surface: 'transform' },
    )) {
      out.push(d);
    }
    expect(out.join('')).toBe('Hello world');
  });
});

describe('listAvailableModels', () => {
  test('openai-compat uses /models and returns model ids', async () => {
    const provider = getAiProvider('openai');
    let endpoint = '';

    const models = await listAvailableModels({
      provider,
      baseUrl: provider.defaultBaseUrl,
      apiKey: 'k',
      fetchImpl: jsonFetch({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1-mini' }] }, (url) => {
        endpoint = url;
      }),
    });

    expect(endpoint).toBe('https://api.openai.com/v1/models');
    expect(models).toEqual(['gpt-4.1-mini', 'gpt-4o-mini']);
  });

  test('anthropic uses /v1/models and returns ids', async () => {
    const provider = getAiProvider('anthropic');

    const models = await listAvailableModels({
      provider,
      baseUrl: provider.defaultBaseUrl,
      apiKey: 'k',
      fetchImpl: jsonFetch({ data: [{ id: 'claude-sonnet-4-5-20250929' }] }),
    });

    expect(models).toEqual(['claude-sonnet-4-5-20250929']);
  });

  test('ollama-native uses /tags and returns model names', async () => {
    const provider = getAiProvider('ollama-local');

    const models = await listAvailableModels({
      provider,
      baseUrl: provider.defaultBaseUrl,
      apiKey: null,
      fetchImpl: jsonFetch({
        models: [{ name: 'llama3.2:latest' }, { name: 'qwen3:8b' }, { name: 'llama3.2:latest' }],
      }),
    });

    expect(models).toEqual(['llama3.2:latest', 'qwen3:8b']);
  });
});
