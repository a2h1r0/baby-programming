/* Node.js built-ins only: no install step or browser/network dependency. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const coreMatch = html.match(/<script\b[^>]*\bid=["']game-core["'][^>]*>([\s\S]*?)<\/script\s*>/i);
assert.ok(coreMatch, 'index.html must expose the independently testable game-core script');
const coreContext = vm.createContext({});
vm.runInContext(coreMatch[1], coreContext, { timeout: 1000 });
const game = coreContext.BeeGame;
assert.ok(game, 'game-core must define BeeGame');

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function sameCell(left, right) { return left.x === right.x && left.y === right.y; }
function run(level, commands) {
  let position = game.start(level);
  for (const command of commands) {
    position = game.step(position, command, level);
    if (position.outside || position.blocked) break;
  }
  return position;
}

/* Independent state-space search checks solvability without trusting solution or step. */
function shortestSolution(level) {
  const queue = [{ ...plain(level.start), commands: [] }];
  const seen = new Set();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const key = [current.x, current.y, current.direction].join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    if (sameCell(current, level.goal)) return current.commands;
    if (current.commands.length >= game.maxCommands) continue;
    for (const command of level.allowTurns ? ['F', 'L', 'R'] : ['F']) {
      const next = { ...current, commands: current.commands.concat(command) };
      if (command === 'L') next.direction = (next.direction + 3) % 4;
      else if (command === 'R') next.direction = (next.direction + 1) % 4;
      else {
        next.x += [0, 1, 0, -1][next.direction];
        next.y += [-1, 0, 1, 0][next.direction];
      }
      if (next.x < 0 || next.y < 0 || next.x >= level.columns || next.y >= level.rows) continue;
      if (level.obstacles.some(rock => sameCell(rock, next))) continue;
      queue.push(next);
    }
  }
  return null;
}

test('hundreds of deterministic courses and distant levels remain valid and independently solvable', () => {
  assert.equal(game.maxCommands, 12);
  const numbers = Array.from({ length: 500 }, (_, index) => index + 1).concat([1000, 10001, 1000000]);
  for (const number of numbers) {
    const level = game.createLevel(number);
    assert.deepEqual(plain(game.createLevel(number)), plain(level), 'determinism at level ' + number);
    assert.equal(level.number, number);
    assert.equal(level.stage, Math.floor((number - 1) / 5) + 1);
    assert.equal(level.columns, 5);
    assert.equal(level.rows, 5);
    assert.equal(level.allowTurns, number >= 6);
    assert.equal(typeof level.showPath, 'boolean');
    assert.ok(Array.isArray(level.path));
    assert.ok(Array.isArray(level.obstacles));
    assert.ok(level.solution.length > 0 && level.solution.length <= game.maxCommands);
    assert.ok(level.solution.every(command => ['F', 'L', 'R'].includes(command)));
    assert.ok(sameCell(level.path[0], level.start));
    assert.ok(sameCell(level.path[level.path.length - 1], level.goal));
    assert.ok(!sameCell(level.start, level.goal));
    const pathCells = new Set();
    for (let index = 0; index < level.path.length; index += 1) {
      const cell = level.path[index];
      const key = cell.x + ',' + cell.y;
      assert.ok(cell.x >= 0 && cell.x < 5 && cell.y >= 0 && cell.y < 5);
      assert.ok(!pathCells.has(key), 'the teaching route must not cross itself');
      pathCells.add(key);
      if (index) {
        const previous = level.path[index - 1];
        assert.equal(Math.abs(previous.x - cell.x) + Math.abs(previous.y - cell.y), 1);
      }
    }
    const obstacleCells = new Set();
    for (const rock of level.obstacles) {
      const key = rock.x + ',' + rock.y;
      assert.ok(rock.x >= 0 && rock.x < 5 && rock.y >= 0 && rock.y < 5);
      assert.ok(!pathCells.has(key), 'rocks must leave the guaranteed route open');
      assert.ok(!obstacleCells.has(key));
      obstacleCells.add(key);
    }
    const position = run(level, level.solution);
    assert.equal(position.outside, false, 'level ' + number);
    assert.equal(position.blocked, false, 'level ' + number);
    assert.equal(game.outcome(position, level), 'success', 'level ' + number);
    const shortest = shortestSolution(level);
    assert.ok(shortest, 'independent search failed at level ' + number);
    assert.equal(shortest.length, level.solution.length,
      'an unintended shortcut must not skip the lesson at level ' + number);
  }
});

test('five-level stages introduce forward movement, turns, then obstacles', () => {
  for (let number = 1; number <= 15; number += 1) {
    const level = game.createLevel(number);
    if (number <= 5) {
      assert.ok(level.solution.every(command => command === 'F'));
      assert.equal(level.obstacles.length, 0);
      assert.equal(level.showPath, true);
    } else {
      assert.ok(level.solution.some(command => command !== 'F'), 'turn lesson needs a turn');
      assert.ok(shortestSolution(level).some(command => command !== 'F'), 'a straight shortcut must not skip the turn lesson');
      assert.equal(level.obstacles.length > 0, number >= 11);
    }
  }
  assert.equal(game.createLevel(25).showPath, true);
  assert.equal(game.createLevel(26).showPath, false);
  assert.equal(game.createLevel(26).partialPath, true);
  assert.equal(game.createLevel(30).partialPath, true);
  assert.equal(game.createLevel(31).showPath, false);
  assert.equal(game.createLevel(31).partialPath, false);
  const level = game.createLevel(31);
  const snapshot = plain(level);
  level.path[0].x = -10;
  level.solution.length = 0;
  level.obstacles.length = 0;
  assert.deepEqual(plain(game.createLevel(31)), snapshot, 'courses must not share mutable arrays');
});

test('forward moves in each orientation; turns rotate in place and wrap', () => {
  const level = { ...plain(game.createLevel(6)), obstacles: [] };
  const destinations = [{ x: 2, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 2 }];
  destinations.forEach((destination, direction) => {
    const input = { x: 2, y: 2, direction, outside: false, blocked: false };
    assert.deepEqual(plain(game.step(input, 'F', level)), { ...destination, direction, outside: false, blocked: false });
    assert.deepEqual(plain(game.step(input, 'L', level)), { ...input, direction: (direction + 3) % 4 });
    assert.deepEqual(plain(game.step(input, 'R', level)), { ...input, direction: (direction + 1) % 4 });
    assert.deepEqual(input, { x: 2, y: 2, direction, outside: false, blocked: false });
  });
  assert.deepEqual(plain(run(level, ['L', 'L', 'L', 'L'])), plain(game.start(level)));
  assert.deepEqual(plain(run(level, ['R', 'R', 'R', 'R'])), plain(game.start(level)));
});

test('start and step return independent positions without changing course definitions', () => {
  const level = game.createLevel(11), snapshot = plain(level);
  const first = game.start(level), second = game.start(level);
  assert.notEqual(first, second);
  assert.equal(first.outside, false);
  assert.equal(first.blocked, false);
  first.x = -1;
  assert.notEqual(first.x, second.x);
  assert.notEqual(game.step(second, 'L', level), second);
  assert.deepEqual(plain(second), plain(game.start(level)));
  assert.deepEqual(plain(level), snapshot);
});

test('all edges fail; rocks block forward movement while nearby rotation stays possible', () => {
  const level = { ...plain(game.createLevel(11)), obstacles: [{ x: 2, y: 2 }] };
  const edges = [{ x: 2, y: 0, direction: 0 }, { x: 4, y: 2, direction: 1 },
    { x: 2, y: 4, direction: 2 }, { x: 0, y: 2, direction: 3 }];
  edges.forEach(edge => {
    const output = game.step({ ...edge, outside: false, blocked: false }, 'F', level);
    assert.equal(output.outside, true);
    assert.equal(game.outcome(output, level), 'outside');
  });
  for (const input of [{ x: 2, y: 3, direction: 0 }, { x: 1, y: 2, direction: 1 },
    { x: 2, y: 1, direction: 2 }, { x: 3, y: 2, direction: 3 }]) {
    const position = { ...input, outside: false, blocked: false };
    const output = game.step(position, 'F', level);
    assert.equal(output.blocked, true);
    assert.equal(output.outside, false);
    assert.equal(game.outcome(output, level), 'blocked');
    assert.equal(game.step(position, 'L', level).blocked, false);
    assert.equal(game.step(position, 'R', level).blocked, false);
    assert.deepEqual(position, { ...input, outside: false, blocked: false });
  }
});

test('success uses the final square; command order and overshooting change the result', () => {
  const level = { ...plain(game.createLevel(1)), start: { x: 0, y: 2, direction: 1 }, goal: { x: 1, y: 2 }, obstacles: [] };
  assert.equal(game.outcome(run(level, ['F']), level), 'success');
  assert.equal(game.outcome(run(level, ['F', 'F']), level), 'retry');
  const turning = { ...level, goal: { x: 1, y: 3 } };
  assert.equal(game.outcome(run(turning, ['F', 'R', 'F']), turning), 'success');
  assert.equal(game.outcome(run(turning, ['R', 'F', 'F']), turning), 'retry');
});

test('the deliverable remains a single offline HTML file', () => {
  const allowedSvgNamespaceRemoved = html.replace(/https?:\/\/www\.w3\.org\/2000\/svg/g, 'SVG_NAMESPACE');
  assert.doesNotMatch(allowedSvgNamespaceRemoved, /https?:\/\//i);
  assert.doesNotMatch(html, /\b(?:src|srcset)\s*=/i);
  assert.doesNotMatch(html, /<link\b[^>]*rel\s*=\s*["']?stylesheet/i);
  assert.doesNotMatch(html, /@import\b/i);
  for (const reference of html.matchAll(/\bhref\s*=\s*["']([^"']*)["']/gi)) assert.match(reference[1], /^#/);
  for (const reference of html.matchAll(/\burl\s*\(\s*([^)]+)\)/gi)) assert.match(reference[1].replace(/["'\s]/g, ''), /^#/);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
  assert.doesNotMatch(html, /\b(?:localStorage|sessionStorage|indexedDB)\b|document\s*\.\s*cookie/);
  assert.doesNotMatch(html, /<script\b[^>]*type\s*=\s*["']module["']/i);
});

test('inline scripts retain conservative ES5 syntax for older classroom browsers', () => {
  const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi), match => match[1]).join('\n');
  assert.doesNotMatch(scripts, /\b(?:const|let|class)\s+[A-Za-z_$]/);
  assert.doesNotMatch(scripts, /=>|\x60|\?\.|\?\?|\.\.\./);
  assert.doesNotMatch(scripts, /\b(?:import|export)\s|\basync\s+function|\bawait\s+/);
  assert.doesNotMatch(scripts, /\bfor\s*\([^)]*\bof\b/);
  assert.doesNotMatch(scripts, /\b(?:Map|Set|Promise)\s*\(/);
  assert.doesNotMatch(scripts, /\.\s*(?:includes|find|findIndex|startsWith|endsWith|assign)\s*\(/);
});

/* Minimal DOM and controlled timers exercise the shipped UI, without duplicating its state. */
function makeApp({ startGame = true } = {}) {
  const elements = new Map();
  let focused = null;
  class Element {
    constructor(tagName, id) {
      this.tagName = tagName.toUpperCase();
      this.id = id || '';
      this.children = [];
      this.parentNode = null;
      this.attributes = {};
      this.listeners = {};
      this.style = {};
      this.hidden = false;
      this.disabled = false;
      this.className = '';
      this.textContent = '';
      this.offsetWidth = 64;
      this._html = '';
    }
    set innerHTML(value) {
      this._html = value;
      this.children.forEach(child => { child.parentNode = null; });
      this.children = [];
    }
    get innerHTML() { return this._html; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
    addEventListener(type, callback) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(callback);
    }
    click(target = this) {
      if (this.disabled) return;
      for (const callback of this.listeners.click || []) callback({ target });
    }
    focus() { focused = this; }
  }
  for (const tag of html.matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/gi)) {
    const id = tag[2].match(/\bid\s*=\s*["']([^"']+)["']/i);
    if (!id) continue;
    const element = new Element(tag[1], id[1]);
    for (const attribute of tag[2].matchAll(/([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      element.setAttribute(attribute[1], attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    element.className = element.getAttribute('class') || '';
    element.textContent = html.slice(tag.index + tag[0].length).match(/^[^<]*/)[0].trim();
    element.hidden = /(?:^|\s)hidden(?:\s|=|$)/i.test(tag[2]);
    element.disabled = /(?:^|\s)disabled(?:\s|=|$)/i.test(tag[2]);
    elements.set(id[1], element);
  }
  const document = {
    body: new Element('body'),
    getElementById(id) {
      assert.ok(elements.has(id), 'the UI referenced an absent element: ' + id);
      return elements.get(id);
    },
    createElement(tagName) { return new Element(tagName); }
  };
  let timerId = 0;
  let timers = [];
  const window = {
    setTimeout(callback, delay) {
      timerId += 1;
      timers.push({ id: timerId, callback, delay });
      return timerId;
    },
    clearTimeout(id) { timers = timers.filter(timer => timer.id !== id); }
  };
  const context = vm.createContext({ document, window });
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    vm.runInContext(script[1], context, { timeout: 1000 });
  }
  const app = {
    element(id) { return document.getElementById(id); },
    click(id, target) { document.getElementById(id).click(target); },
    commandButtons() { return document.getElementById('program').children.flatMap(item => item.children); },
    add(commands) {
      const ids = { F: 'forward', L: 'left', R: 'right' };
      for (const command of commands) this.click(ids[command]);
    },
    tick() {
      assert.ok(timers.length, 'expected a pending animation timer');
      const timer = timers.shift();
      timer.callback();
      return timer.delay;
    },
    finish() {
      let count = 0;
      while (timers.length) {
        assert.ok(count < 100, 'animation should finish, not loop indefinitely');
        this.tick(); count += 1;
      }
    },
    pendingTimers() { return timers.length; },
    focused() { return focused; }
  };
  if (startGame) app.click('start');
  return app;
}

function levelNumber(app) { return Number(app.element('level-text').textContent.match(/\d+/)[0]); }
function assertSuccessDialog(app) {
  assert.equal(app.element('intro').hidden, true);
  assert.equal(app.element('result').hidden, false);
  assert.equal(app.element('result').className, 'result');
  assert.equal(app.element('result-title').textContent, 'できたね！');
  assert.equal(app.element('next').hidden, false);
  assert.equal(app.element('retry').hidden, true);
  assert.equal(app.focused(), app.element('next'));
}
function assertFailureDialog(app, reason) {
  assert.equal(app.element('intro').hidden, true);
  assert.equal(app.element('result').hidden, false);
  assert.match(app.element('result').className, /\bretry\b/);
  assert.equal(app.element('result-title').textContent, 'おっと！');
  assert.equal(app.element('result').getAttribute('role'), 'dialog');
  assert.equal(app.element('result').getAttribute('aria-modal'), 'true');
  assert.equal(app.element('next').hidden, true);
  assert.equal(app.element('retry').hidden, false);
  assert.equal(app.element('retry').textContent, 'もういっかい ↻');
  assert.equal(app.element('retry').getAttribute('aria-label'), 'おなじレベルでもういっかい');
  assert.equal(app.focused(), app.element('retry'));
  assert.match(app.element('status').className, /retry/);
  assert.match(app.element('status').textContent, reason);
  for (const id of ['forward', 'left', 'right', 'go', 'undo', 'restart']) {
    assert.equal(app.element(id).disabled, true, id + ' must stay locked until retry');
  }
  assert.ok(app.commandButtons().every(button => button.disabled));
  assert.equal(app.pendingTimers(), 0);
}
function winLevel(app, number) {
  app.add(game.createLevel(number).solution);
  app.click('go'); app.finish();
  assertSuccessDialog(app);
  assert.equal(app.pendingTimers(), 0);
}

test('UI explains the game to parents on every visit and requires starting before play', () => {
  const app = makeApp({ startGame: false });
  assert.equal(app.element('intro').hidden, false);
  assert.equal(app.element('intro').getAttribute('role'), 'dialog');
  assert.equal(app.element('intro').getAttribute('aria-modal'), 'true');
  assert.equal(app.element('game').getAttribute('aria-hidden'), 'true');
  assert.equal(app.focused(), app.element('intro-title'));
  assert.equal(app.element('start').disabled, false);
  for (const id of ['forward', 'left', 'right', 'go', 'undo', 'restart']) {
    assert.equal(app.element(id).disabled, true);
    app.click(id);
  }
  assert.equal(app.commandButtons().length, 0);
  assert.equal(app.pendingTimers(), 0);
  app.click('start');
  assert.equal(app.element('intro').hidden, true);
  assert.equal(app.element('game').getAttribute('aria-hidden'), 'false');
  assert.equal(app.focused(), app.element('forward'));
  assert.equal(app.element('forward').disabled, false);
  assert.equal(app.element('go').disabled, true);
  app.add(['F']);
  app.click('start');
  assert.equal(app.commandButtons().length, 1, 'starting again must not reset play');
  app.click('go'); app.finish(); app.click('next');
  assert.equal(app.element('intro').hidden, true, 'advancing must not show the introduction again');
  assert.equal(makeApp({ startGame: false }).element('intro').hidden, false, 'a fresh visit must show the introduction');
});

test('UI starts at level 1, hides turns, edits commands, and enforces 12-command capacity', () => {
  const app = makeApp();
  assert.equal(app.element('game').hidden, false);
  assert.equal(levelNumber(app), 1);
  assert.doesNotMatch(html, /\bid\s*=\s*["']back["']/i, 'the game must not show a back button');
  assert.equal(app.element('left').hidden, true);
  assert.equal(app.element('right').hidden, true);
  assert.equal(app.element('go').disabled, true);
  assert.equal(app.element('result').hidden, true);
  assert.equal(app.element('next').hidden, false);
  assert.equal(app.element('retry').hidden, true);
  assert.doesNotMatch(html, /\bid\s*=\s*["']same["']/i, 'success dialog must only offer the next level');
  app.click('left'); app.click('right');
  assert.equal(app.commandButtons().length, 0);
  app.add(Array(13).fill('F'));
  assert.equal(app.element('command-count').textContent, '12 / 12');
  assert.equal(app.commandButtons().length, 12);
  assert.equal(app.element('forward').disabled, true);
  app.click('undo');
  assert.equal(app.commandButtons().length, 11);
  assert.equal(app.element('forward').disabled, false);
  const button = app.commandButtons()[4];
  app.click('program', { parentNode: button });
  assert.equal(app.commandButtons().length, 10);
  app.click('restart');
  assert.equal(app.commandButtons().length, 0);
  assert.equal(app.element('go').disabled, true);
  assert.equal(levelNumber(app), 1);
});

test('UI progresses beyond every five-level boundary to level 31 without wrapping', () => {
  const app = makeApp();
  for (let number = 1; number <= 31; number += 1) {
    assert.equal(levelNumber(app), number);
    assert.equal(app.element('left').hidden, number <= 5);
    assert.equal(app.element('right').hidden, number <= 5);
    app.add(game.createLevel(number).solution);
    app.click('go');
    for (const id of ['forward', 'left', 'right', 'go', 'undo', 'restart']) assert.equal(app.element(id).disabled, true);
    const count = app.commandButtons().length;
    app.click('undo'); app.click('forward'); app.click('restart');
    assert.equal(app.commandButtons().length, count);
    app.finish();
    const goal = game.createLevel(number).goal;
    assert.equal(app.element('bee').style.left, (goal.x * 20) + '%');
    assert.equal(app.element('bee').style.top, (goal.y * 20) + '%');
    assertSuccessDialog(app);
    assert.match(app.element('bee').className, /happy/);
    assert.equal(app.focused(), app.element('next'));
    assert.ok(app.commandButtons().every(button => /finished/.test(button.className)));
    assert.doesNotMatch(app.element('next').textContent, /はじめから/);
    app.click('next');
    assert.equal(app.element('result').hidden, true);
    assert.equal(app.commandButtons().length, 0);
  }
  assert.equal(levelNumber(app), 32);
});

test('UI highlights each command and turns in place; restart preserves the current level', () => {
  const app = makeApp();
  for (let number = 1; number < 6; number += 1) { winLevel(app, number); app.click('next'); }
  const level = game.createLevel(6);
  app.add(level.solution); app.click('go');
  for (let index = 0; index < level.solution.length; index += 1) {
    const before = { left: app.element('bee').style.left, top: app.element('bee').style.top };
    app.tick();
    assert.match(app.commandButtons()[index].className, /active/);
    assert.equal(app.commandButtons()[index].getAttribute('aria-current'), 'step');
    if (level.solution[index] !== 'F') {
      assert.equal(app.element('bee').style.left, before.left);
      assert.equal(app.element('bee').style.top, before.top);
      assert.match(app.element('bee-direction').style.transform, /^rotate\(-?\d+deg\)$/);
    }
  }
  app.finish(); app.click('next');
  assert.equal(levelNumber(app), 7);
  assert.equal(app.commandButtons().length, 0);
  app.add(['F']); app.click('restart');
  assert.equal(levelNumber(app), 7);
  assert.equal(app.commandButtons().length, 0);
  assert.equal(app.element('left').hidden, false);
});

test('UI opens a failure dialog at edges and clears the program for a fresh retry on the same board', () => {
  const app = makeApp();
  const start = game.createLevel(1).start;
  const board = app.element('cells').innerHTML;
  app.add(Array(6).fill('F')); app.click('go'); app.finish();
  assertFailureDialog(app, /^もういっかい ためしてみよう$/);
  assert.equal(app.commandButtons().length, 6);
  const commands = app.commandButtons().map(button => button.getAttribute('aria-label'));
  const x = parseFloat(app.element('bee').style.left), y = parseFloat(app.element('bee').style.top);
  assert.ok(x >= 0 && x <= 80 && y >= 0 && y <= 80, 'bee must stay inside the drawn board');
  for (const id of ['forward', 'undo', 'go', 'restart', 'next']) app.click(id);
  app.click('program', { parentNode: app.commandButtons()[0] });
  assert.equal(levelNumber(app), 1);
  assert.deepEqual(app.commandButtons().map(button => button.getAttribute('aria-label')), commands);
  assert.equal(app.element('result').hidden, false);
  assert.equal(app.pendingTimers(), 0);

  app.click('retry');
  assert.equal(app.element('result').hidden, true);
  assert.equal(levelNumber(app), 1);
  assert.equal(app.element('cells').innerHTML, board);
  assert.equal(app.commandButtons().length, 0);
  assert.equal(app.element('command-count').textContent, '0 / 12');
  assert.equal(app.element('bee').style.left, (start.x * 20) + '%');
  assert.equal(app.element('bee').style.top, (start.y * 20) + '%');
  assert.equal(app.element('status').textContent, 'やじるしを おしてね');
  assert.doesNotMatch(app.element('status').className, /retry/);
  assert.equal(app.focused(), app.element('forward'));
  for (const id of ['forward', 'restart']) assert.equal(app.element(id).disabled, false);
  for (const id of ['go', 'undo']) assert.equal(app.element(id).disabled, true);
  app.click('go');
  assert.equal(app.pendingTimers(), 0, 'an empty retry cannot start a run');
  winLevel(app, 1);
  app.click('next');
  assert.equal(levelNumber(app), 2);
  assert.equal(app.element('result').hidden, true);
  assert.equal(app.element('result').className, 'result');
  assert.equal(app.element('result-title').textContent, 'できたね！');
  assert.equal(app.element('next').hidden, false);
  assert.equal(app.element('retry').hidden, true);
  assert.equal(app.commandButtons().length, 0);
  assert.equal(app.element('forward').disabled, false);
});

for (const scenario of [
  { name: 'stopping before the flower', level: 2, commands: ['F'] },
  { name: 'moving beyond the flower', level: 1, commands: ['F', 'F'] }
]) {
  test('UI offers a fresh retry after ' + scenario.name + ' and can solve after re-entering commands', () => {
    const app = makeApp();
    for (let number = 1; number < scenario.level; number += 1) { winLevel(app, number); app.click('next'); }
    app.add(scenario.commands); app.click('go'); app.finish();
    assertFailureDialog(app, /あと すこし/);
    assert.equal(app.commandButtons().length, scenario.commands.length);
    app.click('retry');
    assert.equal(levelNumber(app), scenario.level);
    assert.equal(app.element('result').hidden, true);
    assert.equal(app.commandButtons().length, 0);
    winLevel(app, scenario.level);
    app.click('next');
    assert.equal(levelNumber(app), scenario.level + 1);
    assert.equal(app.element('result').hidden, true);
    assert.equal(app.commandButtons().length, 0);
    assert.equal(app.element('retry').hidden, true);
    assert.equal(app.element('next').hidden, false);
  });
}

test('UI stops beside a rock and can solve with a new program after retry', () => {
  const app = makeApp();
  for (let number = 1; number < 11; number += 1) { winLevel(app, number); app.click('next'); }
  const level = game.createLevel(11);
  const board = app.element('cells').innerHTML;
  let collision = null;
  for (const rock of level.obstacles) {
    for (let direction = 0; direction < 4 && !collision; direction += 1) {
      const neighbor = { x: rock.x - [0, 1, 0, -1][direction], y: rock.y - [-1, 0, 1, 0][direction] };
      if (neighbor.x < 0 || neighbor.x > 4 || neighbor.y < 0 || neighbor.y > 4) continue;
      if (level.obstacles.some(other => sameCell(other, neighbor))) continue;
      const commands = shortestSolution({ ...plain(level), goal: neighbor });
      if (!commands) continue;
      const position = run(level, commands);
      const turns = (direction - position.direction + 4) % 4;
      commands.push(...(turns === 3 ? ['L'] : Array(turns).fill('R')), 'F');
      if (commands.length <= game.maxCommands) collision = { commands, neighbor };
    }
    if (collision) break;
  }
  assert.ok(collision, 'the first rock lesson must allow the collision behavior to be exercised');
  app.add(collision.commands); app.click('go'); app.finish();
  assertFailureDialog(app, /いわ/);
  assert.equal(app.commandButtons().length, collision.commands.length);
  assert.equal(app.element('bee').style.left, (collision.neighbor.x * 20) + '%');
  assert.equal(app.element('bee').style.top, (collision.neighbor.y * 20) + '%');
  assert.equal(app.pendingTimers(), 0);
  app.click('retry');
  assert.equal(levelNumber(app), 11);
  assert.equal(app.commandButtons().length, 0);
  assert.equal(app.element('result').hidden, true);
  assert.equal(app.element('cells').innerHTML, board);
  assert.equal(app.element('bee').style.left, (level.start.x * 20) + '%');
  assert.equal(app.element('bee').style.top, (level.start.y * 20) + '%');
  winLevel(app, 11);
});
