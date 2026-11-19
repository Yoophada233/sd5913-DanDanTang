import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer, preview } from 'vite';
import { TerrainMap } from '../src/terrain.ts';

const host = '127.0.0.1';
const root = fileURLToPath(new URL('..', import.meta.url));
const development = process.argv.includes('--dev');
const map = new TerrainMap();
const server = development
  ? await createServer({ root, server: { host, port: 0, strictPort: true } })
  : await preview({ root, preview: { host, port: 0, strictPort: true } });

try {
  if (development) await server.listen();

  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object', 'Vite did not bind a TCP port');
  const browser = await chromium.launch({ channel: 'msedge' });

  try {
    await runSmokeTest(browser, `http://${host}:${address.port}`);
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}

async function runSmokeTest(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  const board = page.locator('#board canvas');
  const { col, row } = map.spawn;
  const firstDig = { col, row: row - 1 };

  function coordinates(cell) {
    return `(${cell.col}, ${cell.row})`;
  }

  async function waitForText(selector, ...expected) {
    await page.waitForFunction(
      ({ selector, expected }) => {
        const text = document.querySelector(selector)?.textContent;
        return expected.every((value) => text?.includes(value));
      },
      { selector, expected },
    );
  }

  async function inspectCell(cell, terrain, click = false) {
    await board.scrollIntoViewIfNeeded();
    const box = await board.boundingBox();
    assert.ok(box, 'Game canvas must be visible');
    const x = box.x + ((cell.col + 0.5) / map.columns) * box.width;
    const y = box.y + ((cell.row + 0.5) / map.rows) * box.height;
    await page.mouse.move(x, y);
    await waitForText('#hover-cell', terrain, coordinates(cell));
    if (click) await page.mouse.click(x, y);
  }

  async function samplePixel(column, line) {
    return page.evaluate(async ({ column, line, columns, rows }) => {
      // The HUD updates before Phaser renders the next frame.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = document.querySelector('#board canvas');
      const x = Math.floor((column / columns) * canvas.width);
      const y = Math.floor((line / rows) * canvas.height);
      const context = canvas.getContext('2d');
      return Array.from(context.getImageData(x, y, 1, 1).data);
    }, { column, line, columns: map.columns, rows: map.rows });
  }

  async function holdKey(key, until) {
    await page.keyboard.down(key);
    try {
      await until();
    } finally {
      await page.keyboard.up(key);
    }
  }

  async function dig(cell) {
    await inspectCell(cell, '可挖地形', true);
    await waitForText('#dig-result', '挖掘成功');
    await waitForText('#hover-cell', '空地', coordinates(cell));
  }

  const response = await page.goto(url);
  assert.equal(response?.status(), 200, 'Game page must load');
  await board.waitFor();
  await waitForText('#player-cell', coordinates(map.spawn));

  const originalGridStatus = await page.locator('#grid-status').textContent();
  assert.match(originalGridStatus, /显示|隐藏/);
  const toggledGridStatus = originalGridStatus.includes('显示') ? '隐藏' : '显示';
  const gridColumn = col;
  const gridRow = row - 2.5;
  const originalGridPixel = await samplePixel(gridColumn, gridRow);
  assert.equal(originalGridPixel[3], 255, 'The map must be fully painted');
  if (process.env.P0A_SCREENSHOT) {
    await page.screenshot({ path: process.env.P0A_SCREENSHOT, fullPage: true });
  }
  await holdKey('KeyG', () => waitForText('#grid-status', toggledGridStatus));
  assert.notDeepEqual(await samplePixel(gridColumn, gridRow), originalGridPixel,
    'G must change the rendered grid line');
  await holdKey('KeyG', () => waitForText('#grid-status', originalGridStatus.trim()));
  assert.deepEqual(await samplePixel(gridColumn, gridRow), originalGridPixel,
    'G must restore the initial rendered grid line');

  await inspectCell({ col: col + 1, row: row - 1 }, '可挖地形', true);
  await waitForText('#dig-result', '上下左右相邻');
  await inspectCell({ col, row: row - 2 }, '可挖地形', true);
  await waitForText('#dig-result', '上下左右相邻');
  await inspectCell({ col: col - 1, row }, '不可破坏岩石', true);
  await waitForText('#dig-result', '岩石不可挖掘');
  await inspectCell({ col: col + 1, row }, '空地', true);
  await waitForText('#dig-result', '已经是空地');
  const emptyReference = await samplePixel(col + 1.78, row + 0.35);

  await holdKey('KeyA', () => page.waitForTimeout(800));
  assert.ok((await page.locator('#player-cell').textContent()).includes(coordinates(map.spawn)),
    'Rock must block movement');
  await holdKey('KeyD', () => waitForText('#player-cell', coordinates({ col: col + 1, row })));
  await holdKey('KeyS', () => waitForText('#player-cell', coordinates({ col: col + 1, row: row + 1 })));
  await holdKey('KeyR', () => waitForText('#player-cell', coordinates(map.spawn)));

  await holdKey('KeyW', () => page.waitForTimeout(800));
  assert.ok((await page.locator('#player-cell').textContent()).includes(coordinates(map.spawn)),
    'Ordinary terrain must block movement until dug');
  await inspectCell(firstDig, '可挖地形');
  const terrainColumn = firstDig.col + 0.78;
  const terrainRow = firstDig.row + 0.35;
  const originalTerrainPixel = await samplePixel(terrainColumn, terrainRow);
  await dig(firstDig);
  const dugPixel = await samplePixel(terrainColumn, terrainRow);
  assert.notDeepEqual(dugPixel, originalTerrainPixel, 'Digging must repaint the terrain');
  assert.ok(dugPixel.every((channel, index) => Math.abs(channel - emptyReference[index]) <= 3),
    'The dug tile must render with the empty-terrain color');
  await holdKey('KeyW', () => waitForText('#player-cell', coordinates(firstDig)));
  await holdKey('KeyR', () => waitForText('#player-cell', coordinates(map.spawn)));
  await inspectCell(firstDig, '可挖地形');
  assert.deepEqual(await samplePixel(terrainColumn, terrainRow), originalTerrainPixel,
    'Reset must restore the original terrain drawing');

  await page.setViewportSize({ width: 1040, height: 840 });
  const dugCells = [];
  let nextRow = row;
  do {
    nextRow -= 1;
    const nextCell = { col, row: nextRow };
    const terrain = map.getCell(nextCell)?.terrain;
    if (terrain === 'dirt') {
      await dig(nextCell);
      dugCells.push(nextCell);
    } else {
      assert.equal(terrain, 'empty', `Expected a diggable route at ${coordinates(nextCell)}`);
    }
    await holdKey('KeyW', () => waitForText('#player-cell', coordinates(nextCell)));
  } while (!map.isGoal({ col, row: nextRow }));

  await waitForText('#goal-status', 'P0-A 测试完成');
  await holdKey('KeyR', () => waitForText('#player-cell', coordinates(map.spawn)));
  assert.doesNotMatch(await page.locator('#goal-status').textContent(), /P0-A 测试完成/);
  for (const cell of dugCells) await inspectCell(cell, '可挖地形');

  assert.deepEqual(errors, [], 'Browser console and page must have no errors');
  console.log(`Edge smoke (${development ? 'dev' : 'production'}): passed; ${dugCells.length} digs on the route, reset verified, no browser errors.`);
}
