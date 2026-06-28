---
'@inkeep/open-knowledge': patch
---

Expand the AI `Suggest tags` toolbar action into `Suggest metadata`: a single request now proposes a title, description, and tags together. Title and description are shown as editable, opt-in replacements (off by default when the field already has a value, on when it is empty) while tags keep their merge-on-apply behavior. The `⌥⌘ T` / `Ctrl Alt T` shortcut still opens it.
