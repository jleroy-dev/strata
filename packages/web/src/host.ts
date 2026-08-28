/** The one bridge back to the editor; the VS Code panel replaces this with a message. */
export function openInEditor(root: string, id: string): void {
  window.location.href = `vscode://file${root}/${id}`;
}
