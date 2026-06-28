---
'@inkeep/open-knowledge': patch
---

Fix `Index all file contents` in Settings so enabling the toggle visibly settles, shows whether `bm25-turbo` is available, and surfaces index metadata like status, indexed segment count, and last rebuild time. The full-content search backend now also falls back to `~/.cargo/bin/bm25-turbo` when the binary was installed with Cargo but that directory is missing from `PATH`, correctly requests JSON output from `bm25-turbo search`, and shows a warning instead of spinning forever when the local search server is temporarily unreachable.
