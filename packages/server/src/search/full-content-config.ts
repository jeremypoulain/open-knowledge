import { readConfigSafely, resolveConfigPath } from '@inkeep/open-knowledge-core/server';

/**
 * Read the project-local `search.fullContent.enabled` flag. Read lazily (each
 * call hits the on-disk project-local config) so toggling the setting in the UI
 * takes effect without a server restart.
 */
export function readFullContentSearchEnabled(
  projectDir: string,
  opts?: { configHomedirOverride?: string; onWarn?: (message: string) => void },
): boolean {
  const fullContent = readConfigSafely({
    absPath: resolveConfigPath('project-local', projectDir, opts?.configHomedirOverride),
    sideline: false,
    warn: opts?.onWarn ?? (() => {}),
  }).value.search?.fullContent;
  return fullContent?.enabled === true;
}
