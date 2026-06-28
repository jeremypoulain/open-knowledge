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

export const METADATA_SUGGESTION_SYSTEM_PROMPT = `You are a metadata assistant for a knowledge base.
Suggest frontmatter metadata for the given document: a title, a description, and tags.
Rules:
- Return a single JSON object, nothing else. No prose, no code fence.
- Shape: {"title": string, "description": string, "tags": string[]}.
- "title": a concise, specific human title for the document. One line, no trailing punctuation, no surrounding quotes. Aim for under 80 characters.
- "description": one or two sentences summarizing what the document is about. Plain text, no markdown, no emoji or em dash.
- "tags": 3 to 8 lowercase tags, no leading "#"; letters, digits, dashes, underscores, or slashes only; each must start with a letter or digit. Prefer reusing tags from the existing vocabulary when they fit.
- Base every field on what the document is actually about. Match the document's language.`;

export const FILENAME_SUGGESTION_SYSTEM_PROMPT = `You are a file-naming assistant for a knowledge base.
Suggest a concise, descriptive file name (without extension) for the given document.
Rules:
- Return a single JSON object, nothing else. No prose, no code fence.
- Shape: {"filename": string}.
- "filename" is the base name only: no directory, no file extension, no surrounding quotes.
- Use lowercase kebab-case: words separated by single hyphens; letters, digits, and hyphens only; must start and end with a letter or digit.
- Keep it short and specific — prefer 2 to 5 words, under 60 characters.
- Base the name on what the document is actually about. Transliterate non-Latin scripts to ASCII.`;
