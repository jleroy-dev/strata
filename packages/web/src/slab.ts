/**
 * The faces of a plate: a grid of cells at the top, the same grid at the bottom, and four walls
 * joining their rims. Vertices are laid out as the top grid then the bottom grid, both row major.
 */
export function slabVertexCount(nx: number, nz: number): number {
  return 2 * (nx + 1) * (nz + 1);
}

export function slabIndices(nx: number, nz: number): number[] {
  const topBase = 0;
  const bottomBase = (nx + 1) * (nz + 1);
  const at = (base: number, i: number, j: number): number => base + j * (nx + 1) + i;
  const out: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      out.push(at(topBase, i, j), at(topBase, i, j + 1), at(topBase, i + 1, j));
      out.push(at(topBase, i + 1, j), at(topBase, i, j + 1), at(topBase, i + 1, j + 1));
      out.push(at(bottomBase, i, j), at(bottomBase, i + 1, j), at(bottomBase, i, j + 1));
      out.push(at(bottomBase, i + 1, j), at(bottomBase, i + 1, j + 1), at(bottomBase, i, j + 1));
    }
  }
  const wall = (a: number, b: number, c: number, d: number): void => {
    out.push(a, c, b, b, c, d);
  };
  for (let i = 0; i < nx; i++) {
    wall(at(topBase, i, 0), at(bottomBase, i, 0), at(topBase, i + 1, 0), at(bottomBase, i + 1, 0));
    wall(
      at(topBase, i + 1, nz),
      at(bottomBase, i + 1, nz),
      at(topBase, i, nz),
      at(bottomBase, i, nz),
    );
  }
  for (let j = 0; j < nz; j++) {
    wall(at(topBase, 0, j + 1), at(bottomBase, 0, j + 1), at(topBase, 0, j), at(bottomBase, 0, j));
    wall(
      at(topBase, nx, j),
      at(bottomBase, nx, j),
      at(topBase, nx, j + 1),
      at(bottomBase, nx, j + 1),
    );
  }
  return out;
}
