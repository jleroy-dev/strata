/** The keys under the hand: down from their keydown until their keyup, or until the window lets go. */
export class Keys {
  private readonly down = new Set<string>();

  press(code: string): void {
    this.down.add(code);
  }

  release(code: string): void {
    this.down.delete(code);
  }

  clear(): void {
    this.down.clear();
  }

  get held(): ReadonlySet<string> {
    return this.down;
  }
}
