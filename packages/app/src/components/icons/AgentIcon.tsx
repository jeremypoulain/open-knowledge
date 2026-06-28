import { type LucideProps, Sparkles } from 'lucide-react';
import type { SVGProps } from 'react';
import { ClaudeIcon } from './claude';
import { ClineIcon } from './cline';
import { CopilotIcon } from './copilot';
import { CursorIcon } from './cursor';
import { DbrxIcon } from './dbrx';
import { GeminiIcon } from './gemini';
import { GrokIcon } from './grok';
import { MinimaxIcon } from './minimax';
import { MistralIcon } from './mistral';
import { NvidiaIcon } from './nvidia';
import { OllamaIcon } from './ollama';
import { OpenAIIcon } from './openai';
import { OpenRouterIcon } from './openrouter';
import { PerplexityIcon } from './perplexity';
import { WindsurfIcon } from './windsurf';
import { ZaiIcon } from './zai';

export function AgentIcon({ icon, ...props }: { icon?: string } & SVGProps<SVGSVGElement>) {
  if (icon === 'claude') return <ClaudeIcon {...props} />;
  if (icon === 'cursor') return <CursorIcon {...props} />;
  if (icon === 'windsurf') return <WindsurfIcon {...props} />;
  if (icon === 'openai') return <OpenAIIcon {...props} />;
  if (icon === 'cline') return <ClineIcon {...props} />;
  if (icon === 'github') return <CopilotIcon {...props} />;
  if (icon === 'dbrx') return <DbrxIcon {...props} />;
  if (icon === 'gemini') return <GeminiIcon {...props} />;
  if (icon === 'grok') return <GrokIcon {...props} />;
  if (icon === 'minimax') return <MinimaxIcon {...props} />;
  if (icon === 'mistral') return <MistralIcon {...props} />;
  if (icon === 'nvidia') return <NvidiaIcon {...props} />;
  if (icon === 'ollama') return <OllamaIcon {...props} />;
  if (icon === 'openrouter') return <OpenRouterIcon {...props} />;
  if (icon === 'perplexity') return <PerplexityIcon {...props} />;
  if (icon === 'zai') return <ZaiIcon {...props} />;
  return <Sparkles strokeWidth={1.5} {...(props as LucideProps)} />;
}
