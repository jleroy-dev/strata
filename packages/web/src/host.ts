import { pathOf, repoOf, type BlockId, type Mount } from '@strata/core';

/** Where a block lives on this machine, or nothing when its repo is not mounted. */
export function fileOf(mounts: readonly Mount[], id: BlockId): string | undefined {
  const root = mounts.find((m) => m.id === repoOf(id))?.root;
  return root === undefined ? undefined : `${root}/${pathOf(id)}`;
}

/** The one bridge back to the editor; the VS Code panel replaces this with a message. */
export function openInEditor(file: string): void {
  window.location.href = `vscode://file${file}`;
}
