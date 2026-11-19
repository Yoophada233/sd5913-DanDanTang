import assert from "node:assert/strict";
import test from "node:test";
import { TerrainMap } from "../src/terrain.ts";
import { TEST_MAP_LAYOUT } from "../src/test-map.ts";

const north = { col: 11, row: 27 };
const west = { col: 10, row: 28 };
const east = { col: 12, row: 28 };
const south = { col: 11, row: 29 };

function snapshot(map) {
  return Array.from({ length: map.rows }, (_, row) => Array.from(
    { length: map.columns }, (_, col) => map.getCell({ col, row }),
  ));
}

function canReachGoal(map) {
  const pending = [map.spawn];
  const visited = new Set([`${map.spawn.col},${map.spawn.row}`]);

  for (const position of pending) {
    if (map.isGoal(position)) return true;
    for (const neighbor of map.getWalkableNeighbors(position)) {
      const key = `${neighbor.col},${neighbor.row}`;
      if (visited.has(key)) continue;
      visited.add(key);
      pending.push(neighbor);
    }
  }
  return false;
}

test("the fixed map is a 24×32 grid with all three terrain types", () => {
  const map = new TerrainMap();
  const rows = snapshot(map);
  assert.equal(map.columns, 24);
  assert.equal(map.rows, 32);
  assert.equal(TEST_MAP_LAYOUT.length, 32);
  for (const row of TEST_MAP_LAYOUT) assert.equal(row.length, 24);

  const cells = rows.flat();
  assert.deepEqual(new Set(cells.map((cell) => cell.terrain)), new Set(["rock", "empty", "dirt"]));
  for (const cell of cells) {
    assert.equal(cell.buildingId, null);
    assert.equal(cell.terrainLevel, cell.terrain === "empty" ? 0 : 1);
    assert.ok(Object.isFrozen(cell));
  }
  assert.deepEqual(map.spawn, { col: 11, row: 28 });
  assert.ok(map.isWalkable(map.spawn));
  assert.ok(map.isGoal({ col: 11, row: 4 }));
  assert.ok(map.isWalkable({ col: 11, row: 4 }));
});

test("grid lookups reject out-of-bounds and noninteger coordinates", () => {
  const map = new TerrainMap();
  for (const position of [
    { col: -1, row: 28 }, { col: 24, row: 28 },
    { col: 11, row: -1 }, { col: 11, row: 32 },
    { col: 11.5, row: 28 }, { col: 11, row: 28.5 },
    { col: NaN, row: 28 }, { col: 11, row: Infinity },
  ]) {
    assert.equal(map.isInside(position), false);
    assert.equal(map.getCell(position), undefined);
    assert.equal(map.isWalkable(position), false);
    assert.equal(map.isGoal(position), false);
    assert.deepEqual(map.getWalkableNeighbors(position), []);
  }
  assert.equal(map.getCell({ col: 0, row: 0 }).terrain, "rock");
  assert.equal(map.isInside({ col: 23, row: 31 }), true);
});

test("a legal dig immediately changes the cell and its walkable-neighbor relationship", () => {
  const map = new TerrainMap();
  const formerCell = map.getCell(north);
  assert.equal(formerCell.terrain, "dirt");
  assert.equal(map.isWalkable(north), false);
  assert.deepEqual(map.getWalkableNeighbors(map.spawn), [east, south]);
  assert.equal(map.revision, 0);

  assert.equal(map.tryDig(map.spawn, north), "dug");
  assert.deepEqual(map.getCell(north), { terrain: "empty", terrainLevel: 0, buildingId: null });
  assert.equal(formerCell.terrain, "dirt");
  assert.equal(map.isWalkable(north), true);
  assert.deepEqual(map.getWalkableNeighbors(map.spawn), [north, east, south]);
  assert.equal(map.revision, 1);
  assert.equal(map.tryDig(map.spawn, north), "empty");
  assert.equal(map.revision, 1);
});

test("invalid dig operations report their reason without mutating the map", () => {
  const map = new TerrainMap();
  const initial = snapshot(map);
  assert.equal(map.tryDig(map.spawn, map.spawn), "out-of-reach");
  assert.equal(map.tryDig(map.spawn, { col: 12, row: 27 }), "out-of-reach");
  assert.equal(map.tryDig(map.spawn, { col: 11, row: 26 }), "out-of-reach");
  assert.equal(map.tryDig(map.spawn, { col: 24, row: 28 }), "out-of-bounds");
  assert.equal(map.tryDig(map.spawn, { col: 11, row: 27.5 }), "out-of-bounds");
  assert.equal(map.tryDig(west, map.spawn), "invalid-origin");
  assert.equal(map.tryDig(map.spawn, west), "rock");
  assert.equal(map.tryDig(map.spawn, east), "empty");
  assert.equal(map.revision, 0);
  assert.deepEqual(snapshot(map), initial);
});

test("a walkable north route appears through sequential digs and resets repeatably", () => {
  const map = new TerrainMap();
  const initial = snapshot(map);
  assert.equal(canReachGoal(map), false);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const initialRevision = map.revision;
    let current = map.spawn;
    let digs = 0;
    for (let row = current.row - 1; row >= 4; row -= 1) {
      const next = { col: current.col, row };
      if (!map.isWalkable(next)) {
        assert.equal(map.tryDig(current, next), "dug");
        digs += 1;
      }
      assert.ok(map.isWalkable(next));
      current = next;
    }
    assert.equal(digs, 12);
    assert.equal(map.revision, initialRevision + digs);
    assert.ok(map.isGoal(current));
    assert.equal(canReachGoal(map), true);

    map.reset();
    assert.equal(map.revision, initialRevision + digs + 1);
    assert.deepEqual(snapshot(map), initial);
    assert.equal(canReachGoal(map), false);
  }
});

test("digging one instance leaves other instances at the original layout", () => {
  const digMap = new TerrainMap();
  const originalMap = new TerrainMap();
  assert.equal(digMap.tryDig(digMap.spawn, north), "dug");
  assert.equal(originalMap.isWalkable(north), false);
  assert.equal(originalMap.revision, 0);
});
