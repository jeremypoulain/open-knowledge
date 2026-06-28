import type { AiTransformAction } from '@inkeep/open-knowledge-core';

/** Maps a transform `action` id to a system prompt. The model is asked to
 *  return only the rewritten text in markdown — no preamble, no fences. */
export function systemPromptForAction(action: AiTransformAction, instruction?: string): string {
  const base =
    'You are an expert writing assistant inside a knowledge base. Rewrite the user-provided text. ' +
    'Return ONLY the rewritten text in Markdown, preserving the original meaning and any links, ' +
    'wiki-links, or inline code. Do not add a preamble, headings, or wrap the answer in a code fence. ' +
    'Match the original language unless asked otherwise.';
  switch (action) {
    case 'clarify':
      return `${base}\n\nGoal: make the text clearer and easier to understand, keeping it the same length.`;
    case 'improve':
      return `${base}\n\nGoal: improve the text — fix awkward phrasing and tighten the wording while keeping all meaning.`;
    case 'concise':
      return `${base}\n\nGoal: make the text more concise. Remove redundancy; keep it noticeably shorter.`;
    case 'fix-grammar':
      return `${base}\n\nGoal: fix grammar, spelling, and punctuation. Do not change the wording otherwise.`;
    case 'longer':
      return `${base}\n\nGoal: expand the text with helpful detail, examples, or elaboration while staying on topic.`;
    case 'friendly-tone':
      return `${base}\n\nGoal: rewrite in a warm, friendly, conversational tone.`;
    case 'professional-tone':
      return `${base}\n\nGoal: rewrite in a clear, professional, neutral tone.`;
    case 'summarize':
      return `${base}\n\nGoal: summarize the text into a few tight sentences or a short bullet list.`;
    case 'custom':
      return `${base}\n\nThe user gave this instruction — follow it precisely:\n${(instruction ?? '').trim() || 'Improve the text.'}`;
    default:
      return base;
  }
}

export const TAG_SUGGESTION_SYSTEM_PROMPT = `You are a tagging assistant for a knowledge base.
Suggest concise document-level tags for the given document.
Rules:
- Return a JSON array of strings, nothing else. No prose, no code fence.
- Prefer reusing tags from the existing vocabulary when they fit.
- 3 to 8 tags. Lowercase, no leading "#".
- Each tag: letters, digits, dashes, underscores, or slashes only; must start with a letter or digit.
- Tags must reflect what the document is actually about.`;
