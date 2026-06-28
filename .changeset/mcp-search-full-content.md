---
'@inkeep/open-knowledge': patch
---

Expose the BM25 full-content search engine to the MCP `search` tool via a new `engine` parameter. `engine: "index"` (default) keeps the existing cmd-K behavior; `engine: "full_content"` routes to the opt-in BM25 index over the full body of every non-binary file — including text extracted from PDF, Word, Excel, and PowerPoint — so agents can run a more exhaustive body-content search. When the engine is disabled or still building, the tool returns an actionable hint.
