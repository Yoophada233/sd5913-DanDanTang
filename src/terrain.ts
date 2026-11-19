import { TEST_MAP_LAYOUT } from "./test-map.ts";

export const MAP_COLUMNS = 24;
export const MAP_ROWS = 32;

export interface GridPosition {
  readonly col: number;
  readonly row: number;
}

export type TerrainType = "empty" | "dirt" | "rock";

export interface TerrainCell {
  readonly terrain: TerrainType;
  readonly terrainLevel: number;
  readonly buildingId: string | null;
}

export interface TerrainReader {
  readonly columns: number;
  readonly rows: number;
  readonly revision: number;
  isInside(position: GridPosition): boolean;
  getCell(position: GridPosition): TerrainCell | undefined;
  isWalkable(position: GridPosition): boolean;
  getWalkableNeighbors(position: GridPosition): GridPosition[];
}

export type DigResult =
  | "dug"
  | "out-of-bounds"
  | "invalid-origin"
  | "out-of-reach"
  | "rock"
  | "empty";

const EMPTY: TerrainCell = Object.freeze({ terrain: "empty", terrainLevel: 0, buildingId: null });
const DIRT: TerrainCell = Object.freeze({ terrain: "dirt", terrainLevel: 1, buildingId: null });
const ROCK: TerrainCell = Object.freeze({ terrain: "rock", terrainLevel: 1, buildingId: null });
const MARKER_CELLS = new Map<string, TerrainCell>([
  [".", EMPTY],
  ["G", EMPTY],
  ["S", EMPTY],
  ["+", DIRT],
  ["#", ROCK],
]);

const spawnRow = TEST_MAP_LAYOUT.findIndex((row) => row.includes("S"));
const SPAWN = Object.freeze({ col: TEST_MAP_LAYOUT[spawnRow]?.indexOf("S") ?? -1, row: spawnRow });
const INITIAL_TERRAIN = TEST_MAP_LAYOUT.map((row) => Array.from(row, (marker) => {
  const cell = MARKER_CELLS.get(marker);
  if (!cell) throw new Error(`Invalid test map marker: ${marker}`);
  return cell;
}));

export class TerrainMap implements TerrainReader {
  readonly columns = MAP_COLUMNS;
  readonly rows = MAP_ROWS;
  readonly spawn = SPAWN;

  #cells = INITIAL_TERRAIN.map((row) => row.slice());
  #revision = 0;

  get revision(): number {
    return this.#revision;
  }

  isInside({ col, row }: GridPosition): boolean {
    return Number.isInteger(col) && Number.isInteger(row)
      && col >= 0 && col < this.columns && row >= 0 && row < this.rows;
  }

  getCell({ col, row }: GridPosition): TerrainCell | undefined {
    return this.#cells[row]?.[col];
  }

  isWalkable(position: GridPosition): boolean {
    return this.getCell(position)?.terrain === "empty";
  }

  getWalkableNeighbors({ col, row }: GridPosition): GridPosition[] {
    if (!this.isInside({ col, row })) return [];

    return [
      { col, row: row - 1 },
      { col: col + 1, row },
      { col, row: row + 1 },
      { col: col - 1, row },
    ].filter((neighbor) => this.isWalkable(neighbor));
  }

  isGoal({ col, row }: GridPosition): boolean {
    return TEST_MAP_LAYOUT[row]?.[col] === "G";
  }

  tryDig(from: GridPosition, target: GridPosition): DigResult {
    const row = this.#cells[target.row];
    const cell = row?.[target.col];
    if (!row || !cell) return "out-of-bounds";
    if (!this.isWalkable(from)) return "invalid-origin";

    const distance = Math.abs(from.col - target.col) + Math.abs(from.row - target.row);
    if (distance !== 1) return "out-of-reach";
    if (cell.terrain === "rock") return "rock";
    if (cell.terrain === "empty") return "empty";

    row[target.col] = EMPTY;
    this.#revision += 1;
    return "dug";
  }

  reset(): void {
    this.#cells = INITIAL_TERRAIN.map((row) => row.slice());
    this.#revision += 1;
  }
}
