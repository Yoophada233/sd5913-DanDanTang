import type { DigResult, GridPosition, TerrainType } from "./terrain.ts";

const TERRAIN_NAMES: Record<TerrainType, string> = {
  empty: "空地",
  dirt: "可挖地形",
  rock: "不可破坏岩石",
};

const DIG_MESSAGES: Record<DigResult, string> = {
  dug: "挖掘成功",
  "out-of-bounds": "目标格超出地图边界",
  "invalid-origin": "玩家所在格不可通行",
  "out-of-reach": "只能挖掘上下左右相邻格",
  rock: "岩石不可挖掘",
  empty: "目标格已经是空地",
};

function coordinates({ col, row }: GridPosition): string {
  return `(${col}, ${row})`;
}

function statusField(id: string): HTMLElement {
  const field = document.getElementById(id);
  if (!field) throw new Error(`Missing debug field #${id}`);
  return field;
}

function writeStatus(field: HTMLElement, value: string): void {
  if (field.textContent !== value) field.textContent = value;
}

export class DebugHud {
  private readonly player = statusField("player-cell");
  private readonly hover = statusField("hover-cell");
  private readonly grid = statusField("grid-status");
  private readonly dig = statusField("dig-result");
  private readonly goal = statusField("goal-status");

  showPlayer(cell: GridPosition): void {
    writeStatus(this.player, coordinates(cell));
  }

  showHover(cell: GridPosition | null, terrain?: TerrainType): void {
    writeStatus(this.hover, cell && terrain ? `${TERRAIN_NAMES[terrain]} ${coordinates(cell)}` : "—");
  }

  showGrid(visible: boolean): void {
    writeStatus(this.grid, visible ? "显示" : "隐藏");
  }

  showDig(result?: DigResult, cell?: GridPosition): void {
    this.dig.dataset.outcome = result === "dug" ? "dug" : result ? "rejected" : "idle";
    const message = result && cell ? `${DIG_MESSAGES[result]} · ${coordinates(cell)}` : "等待挖掘";
    writeStatus(this.dig, message);
  }

  showGoal(reached: boolean): void {
    this.goal.dataset.reached = String(reached);
    writeStatus(this.goal, reached ? "P0-A 测试完成" : "挖通地形，抵达北端目标区");
  }
}
