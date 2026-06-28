---
'@inkeep/open-knowledge': patch
---

Turn the editor's AI sparkles button into a small menu offering **Suggest metadata** (the existing flow) and a new **Suggest filename** action. Suggest filename asks the model for a concise kebab-case name, shows it in an editable field, and on apply renames the document through the normal rename pipeline so wiki-links and the active tab follow. The `⌥⌘ T` / `Ctrl Alt T` shortcut still opens the metadata panel directly.
