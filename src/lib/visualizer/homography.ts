export interface Point {
  x: number;
  y: number;
}

export type Quad = readonly [Point, Point, Point, Point];
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

export type QuadValidation = { ok: true } | { ok: false; reason: 'out-of-bounds' | 'crossed' | 'concave' | 'too-small' | 'degenerate-edge' };

const EPSILON = 1e-10;

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < -EPSILON && cdA * cdB < -EPSILON;
}

export function validateQuad(points: Quad): QuadValidation {
  if (points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  if (intersects(points[0], points[1], points[2], points[3]) || intersects(points[1], points[2], points[3], points[0])) {
    return { ok: false, reason: 'crossed' };
  }
  const hasCollapsedEdge = points.some((point, index) => {
    const next = points[(index + 1) % 4];
    return (point.x - next.x) ** 2 + (point.y - next.y) ** 2 < EPSILON;
  });
  if (hasCollapsedEdge) return { ok: false, reason: 'degenerate-edge' };
  const turns = points.map((point, index) => cross(point, points[(index + 1) % 4], points[(index + 2) % 4]));
  if (turns.some((value) => Math.abs(value) < EPSILON)) return { ok: false, reason: 'degenerate-edge' };
  const positive = turns.some((value) => value > EPSILON);
  const negative = turns.some((value) => value < -EPSILON);
  if (positive && negative) return { ok: false, reason: 'concave' };
  const area = Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % 4];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  if (area < 0.005) return { ok: false, reason: 'too-small' };
  return { ok: true };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row;
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-10) {
      throw new Error('Degenerate point set cannot define a floor plane.');
    }

    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    const pivot = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= pivot;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

export function computeHomography(source: Quad, target: Quad): Homography {
  const rows: number[][] = [];
  const values: number[] = [];

  for (let index = 0; index < 4; index += 1) {
    const { x, y } = source[index];
    const { x: u, y: v } = target[index];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }

  const solution = solveLinearSystem(rows, values);
  if (solution.length !== 8) throw new Error('Floor-plane solver returned an invalid matrix.');
  return [
    solution[0], solution[1], solution[2], solution[3],
    solution[4], solution[5], solution[6], solution[7], 1,
  ];
}

export function projectPoint(matrix: Homography, point: Point): Point {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const denominator = g * point.x + h * point.y + i;
  if (Math.abs(denominator) < 1e-10) throw new Error('Point projects outside the valid floor plane.');
  return {
    x: (a * point.x + b * point.y + c) / denominator,
    y: (d * point.x + e * point.y + f) / denominator,
  };
}

export function invertHomography(matrix: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const determinant = a * A + b * D + c * G;
  if (Math.abs(determinant) < EPSILON) throw new Error('Degenerate homography cannot be inverted.');
  return [A, B, C, D, E, F, G, H, I].map((value) => value / determinant) as unknown as Homography;
}
