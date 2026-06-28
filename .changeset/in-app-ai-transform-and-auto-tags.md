'@inkeep/open-knowledge': patch
---

Add in-app AI text editing and auto-tagging, backed by a multi-provider model settings surface.

- Select text in a markdown document and open the new ✨ AI bubble menu to run quick actions (Improve, Make concise, Fix grammar, change tone, …) or a free-form instruction. The result streams into an **accept/reject diff preview** anchored to your selection — Accept rewrites the range (undo still works), Reject discards, Retry regenerates. The menu also keeps the existing "Send to agent" handoff.
- A new **Settings → AI** page (User group) stores per-provider API keys in `~/.ok/secrets.yml` (owner-only, shared across projects, never synced) for Anthropic, OpenAI, Gemini, Groq, OpenRouter, Mistral, Ollama, NVIDIA NIM, Z.ai, and OpenCode, with a default provider + per-provider `model` / `baseUrl`.
- Press `⌥⌘ T` / `Ctrl Alt T` (or the toolbar button) to **Suggest tags**: the model proposes document tags, you toggle which to keep, and the accepted set is merged into the frontmatter `tags:` array (existing tags preserved).
