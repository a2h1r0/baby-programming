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

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function run(level, commands) {
  let position = game.start(level);
  for (const command of commands) {
    position = game.step(position, command, level);
    if (position.outside) break;
  }
  return position;
}

const challengeSolutions = [
  ['F'],
  ['F', 'R', 'F'],
  ['F', 'F', 'L', 'F'],
  ['F', 'F', 'R', 'F', 'L', 'F', 'F']
];

test('there are four graduated courses for each age mode on a 5 × 5 board', () => {
  assert.equal(game.levels.easy.length, 4);
  assert.equal(game.levels.challenge.length, 4);
  assert.equal(game.maxCommands, 12);
  for (const mode of ['easy', 'challenge']) {
    for (const level of game.levels[mode]) {
      assert.equal(level.columns, 5);
      assert.equal(level.rows, 5);
      assert.ok(Array.isArray(level.path));
      assert.ok(level.path.some(cell => cell.x === level.start.x && cell.y === level.start.y));
      assert.ok(level.path.some(cell => cell.x === level.goal.x && cell.y === level.goal.y));
      for (let index = 1; index < level.path.length; index += 1) {
        const previous = level.path[index - 1];
        const current = level.path[index];
        assert.equal(Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y), 1);
      }
    }
  }
});

test('easy courses require exactly one, two, three and four forward commands', () => {
  game.levels.easy.forEach((level, index) => {
    assert.deepEqual(plain(level.start), { x: 0, y: 2, direction: 1 });
    assert.deepEqual(plain(level.goal), { x: index + 1, y: 2 });
    const commands = Array(index + 1).fill('F');
    assert.equal(game.outcome(run(level, commands), level), 'success');
    assert.equal(game.outcome(run(level, commands.slice(1)), level), 'retry');
  });
});

test('challenge courses progress from straight to staged left/right turns', () => {
  const expectedStarts = [
    { x: 0, y: 3, direction: 1 },
    { x: 1, y: 1, direction: 1 },
    { x: 0, y: 3, direction: 1 },
    { x: 0, y: 1, direction: 1 }
  ];
  const expectedGoals = [
    { x: 1, y: 3 },
    { x: 2, y: 2 },
    { x: 2, y: 2 },
    { x: 4, y: 2 }
  ];
  game.levels.challenge.forEach((level, index) => {
    assert.deepEqual(plain(level.start), expectedStarts[index]);
    assert.deepEqual(plain(level.goal), expectedGoals[index]);
    const position = run(level, challengeSolutions[index]);
    assert.equal(position.outside, false);
    assert.equal(game.outcome(position, level), 'success');
    assert.equal(game.outcome(run(level, challengeSolutions[index].slice(0, -1)), level), 'retry');
  });
});

test('forward moves one square in each orientation', () => {
  const level = game.levels.challenge[0];
  const destinations = [
    { x: 2, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 2 }
  ];
  destinations.forEach((destination, direction) => {
    const input = { x: 2, y: 2, direction, outside: false };
    const output = game.step(input, 'F', level);
    assert.deepEqual(plain(output), { ...destination, direction, outside: false });
    assert.deepEqual(input, { x: 2, y: 2, direction, outside: false });
  });
});

test('left/right rotate by 90 degrees in place and wrap all four orientations', () => {
  const level = game.levels.challenge[0];
  for (let direction = 0; direction < 4; direction += 1) {
    const input = { x: 2, y: 2, direction, outside: false };
    assert.deepEqual(plain(game.step(input, 'L', level)), {
      x: 2, y: 2, direction: (direction + 3) % 4, outside: false
    });
    assert.deepEqual(plain(game.step(input, 'R', level)), {
      x: 2, y: 2, direction: (direction + 1) % 4, outside: false
    });
    assert.deepEqual(input, { x: 2, y: 2, direction, outside: false });
  }
  assert.deepEqual(plain(run(level, ['L', 'L', 'L', 'L'])), plain(game.start(level)));
  assert.deepEqual(plain(run(level, ['R', 'R', 'R', 'R'])), plain(game.start(level)));
  assert.deepEqual(plain(run(level, ['L', 'R'])), plain(game.start(level)));
});

test('start and step return independent positions without changing course definitions', () => {
  const level = game.levels.challenge[1];
  const snapshot = plain(level);
  const first = game.start(level);
  const second = game.start(level);
  assert.notEqual(first, second);
  assert.equal(first.outside, false);
  first.x = 4;
  assert.equal(second.x, 1);
  const input = { x: 1, y: 1, direction: 1, outside: false };
  const output = game.step(input, 'F', level);
  assert.notEqual(input, output);
  assert.deepEqual(input, { x: 1, y: 1, direction: 1, outside: false });
  assert.deepEqual(plain(level), snapshot);
});

test('crossing any board edge fails; moving outside the painted path is allowed', () => {
  const level = game.levels.challenge[0];
  const edges = [
    { x: 2, y: 0, direction: 0 },
    { x: 4, y: 2, direction: 1 },
    { x: 2, y: 4, direction: 2 },
    { x: 0, y: 2, direction: 3 }
  ];
  edges.forEach(edge => {
    const output = game.step(edge, 'F', level);
    assert.equal(output.outside, true);
    assert.equal(game.outcome(output, level), 'outside');
  });
  const offPath = run(level, ['L', 'F']);
  assert.equal(offPath.outside, false);
  assert.equal(game.outcome(offPath, level), 'retry');
});

test('same commands in different order produce different results', () => {
  const level = game.levels.challenge[1];
  const correct = run(level, ['F', 'R', 'F']);
  const reordered = run(level, ['R', 'F', 'F']);
  assert.notDeepEqual(plain(correct), plain(reordered));
  assert.equal(game.outcome(correct, level), 'success');
  assert.equal(game.outcome(reordered, level), 'retry');
});

test('success depends on the final position, including overshooting the goal', () => {
  const level = game.levels.easy[0];
  assert.equal(game.outcome(run(level, ['F']), level), 'success');
  assert.equal(game.outcome(run(level, ['F', 'F']), level), 'retry');
  const farthest = game.levels.easy[3];
  assert.equal(game.outcome(run(farthest, ['F', 'F', 'F', 'F', 'F']), farthest), 'outside');
});

test('the deliverable is a single HTML file with no external assets or network/storage APIs', () => {
  const allowedSvgNamespaceRemoved = html.replace(/https?:\/\/www\.w3\.org\/2000\/svg/g, 'SVG_NAMESPACE');
  assert.doesNotMatch(allowedSvgNamespaceRemoved, /https?:\/\//i, 'external URLs require an offline dependency review');
  assert.doesNotMatch(html, /\b(?:src|srcset)\s*=/i, 'all visuals and scripts must be inline');
  assert.doesNotMatch(html, /<link\b[^>]*rel\s*=\s*["']?stylesheet/i);
  assert.doesNotMatch(html, /@import\b/i);
  for (const reference of html.matchAll(/\bhref\s*=\s*["']([^"']*)["']/gi)) {
    assert.match(reference[1], /^#/, 'links may reference only content in this HTML file');
  }
  for (const reference of html.matchAll(/\burl\s*\(\s*([^)]+)\)/gi)) {
    assert.match(reference[1].replace(/["'\s]/g, ''), /^#/, 'CSS/SVG URLs must reference inline definitions');
  }
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
  assert.doesNotMatch(html, /\b(?:localStorage|sessionStorage|indexedDB)\b|document\s*\.\s*cookie/);
  assert.doesNotMatch(html, /<script\b[^>]*type\s*=\s*["']module["']/i);
});

test('inline scripts pass a conservative ES5 syntax screen (not a parser or legacy-browser guarantee)', () => {
  const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi), match => match[1]).join('\n');
  assert.doesNotMatch(scripts, /\b(?:const|let|class)\s+[A-Za-z_$]/);
  assert.doesNotMatch(scripts, /=>|`|\?\.|\?\?|\.\.\./);
  assert.doesNotMatch(scripts, /\b(?:import|export)\s|\basync\s+function|\bawait\s+/);
  assert.doesNotMatch(scripts, /\bfor\s*\([^)]*\bof\b/);
  assert.doesNotMatch(scripts, /\b(?:Map|Set|Promise)\s*\(/);
  assert.doesNotMatch(scripts, /\.\s*(?:includes|find|findIndex|startsWith|endsWith|assign)\s*\(/);
});

/* Minimal DOM and controlled timers exercise the shipped UI, without duplicating its state. */
function makeApp() {
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
    element.hidden = /(?:^|\s)hidden(?:\s|=|$)/i.test(tag[2]);
    element.disabled = /(?:^|\s)disabled(?:\s|=|$)/i.test(tag[2]);
    elements.set(id[1], element);
  }
  const document = {
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
  return {
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
}

test('UI opens easy mode with forward only, adds/removes commands and enforces the 12-command limit', () => {
  const app = makeApp();
  assert.equal(app.element('game').hidden, true);
  assert.equal(app.element('welcome').hidden, false);
  app.click('choose-easy');
  assert.equal(app.element('game').hidden, false);
  assert.equal(app.element('welcome').hidden, true);
  assert.equal(app.element('left').hidden, true);
  assert.equal(app.element('right').hidden, true);
  assert.equal(app.element('go').disabled, true);
  app.click('left'); app.click('right');
  assert.equal(app.element('command-count').textContent, '0 / 12');
  app.add(Array(13).fill('F'));
  assert.equal(app.element('command-count').textContent, '12 / 12');
  assert.equal(app.commandButtons().length, 12);
  assert.equal(app.element('forward').disabled, true);
  app.click('undo');
  assert.equal(app.element('command-count').textContent, '11 / 12');
  assert.equal(app.element('forward').disabled, false);
  const button = app.commandButtons()[4];
  const nestedSvg = { parentNode: button };
  app.click('program', nestedSvg);
  assert.equal(app.element('command-count').textContent, '10 / 12');
  app.click('restart');
  assert.equal(app.element('command-count').textContent, '0 / 12');
  assert.equal(app.element('go').disabled, true);
  assert.equal(app.element('bee').style.left, '0%');
  assert.equal(app.element('bee').style.top, '40%');
});

test('UI executes all four easy courses, locks editing while running, and advances/restarts after success', () => {
  const app = makeApp();
  app.click('choose-easy');
  for (let distance = 1; distance <= 4; distance += 1) {
    assert.equal(app.element('level-text').textContent, distance + ' / 4');
    app.add(Array(distance).fill('F'));
    app.click('go');
    assert.equal(app.element('bee').style.left, '0%');
    for (const id of ['forward', 'left', 'right', 'go', 'undo', 'restart', 'back']) {
      assert.equal(app.element(id).disabled, true);
    }
    app.click('undo'); app.click('forward'); app.click('restart'); app.click('back');
    assert.equal(app.element('command-count').textContent, distance + ' / 12');
    assert.equal(app.tick(), 100);
    assert.equal(app.element('bee').style.left, '20%');
    assert.match(app.commandButtons()[0].className, /active/);
    assert.equal(app.commandButtons()[0].getAttribute('aria-current'), 'step');
    assert.equal(app.commandButtons()[0].disabled, true);
    app.finish();
    assert.equal(app.element('bee').style.left, (distance * 20) + '%');
    assert.equal(app.element('result').hidden, false);
    assert.match(app.element('bee').className, /happy/);
    assert.equal(app.focused(), app.element('next'));
    assert.ok(app.commandButtons().every(button => /finished/.test(button.className)));
    assert.equal(app.pendingTimers(), 0);
    app.click('next');
    assert.equal(app.element('result').hidden, true);
    assert.equal(app.element('command-count').textContent, '0 / 12');
  }
  assert.equal(app.element('level-text').textContent, '1 / 4');
});

test('UI executes all challenge courses and rotates in place with the active command highlighted', () => {
  const app = makeApp();
  app.click('choose-challenge');
  assert.equal(app.element('left').hidden, false);
  assert.equal(app.element('right').hidden, false);
  for (let index = 0; index < challengeSolutions.length; index += 1) {
    app.add(challengeSolutions[index]);
    app.click('go');
    for (let commandIndex = 0; commandIndex < challengeSolutions[index].length; commandIndex += 1) {
      const before = { left: app.element('bee').style.left, top: app.element('bee').style.top };
      app.tick();
      assert.match(app.commandButtons()[commandIndex].className, /active/);
      assert.equal(app.commandButtons()[commandIndex].getAttribute('aria-current'), 'step');
      if (challengeSolutions[index][commandIndex] !== 'F') {
        assert.equal(app.element('bee').style.left, before.left);
        assert.equal(app.element('bee').style.top, before.top);
        assert.match(app.element('bee-direction').style.transform, /^rotate\(-?\d+deg\)$/);
      }
    }
    app.finish();
    const goal = game.levels.challenge[index].goal;
    assert.equal(app.element('bee').style.left, (goal.x * 20) + '%');
    assert.equal(app.element('bee').style.top, (goal.y * 20) + '%');
    assert.equal(app.element('result').hidden, false);
    app.click('next');
  }
  assert.equal(app.element('level-text').textContent, '1 / 4');
});

test('UI evaluates the final square, gives gentle retry feedback and resets position before another run', () => {
  const app = makeApp();
  app.click('choose-easy');
  app.add(['F', 'F']); app.click('go');
  app.tick();
  assert.equal(app.element('bee').style.left, '20%');
  assert.equal(app.element('result').hidden, true, 'passing the goal must not finish the run');
  app.finish();
  assert.equal(app.element('bee').style.left, '40%');
  assert.equal(app.element('result').hidden, true);
  assert.match(app.element('status').className, /retry/);
  assert.equal(app.element('forward').disabled, false);
  app.click('undo');
  assert.equal(app.element('bee').style.left, '0%');
  assert.equal(app.element('command-count').textContent, '1 / 12');
  app.click('go'); app.finish();
  assert.equal(app.element('result').hidden, false);
  app.click('same');
  assert.equal(app.element('level-text').textContent, '1 / 4');
  assert.equal(app.element('command-count').textContent, '0 / 12');
  assert.equal(app.element('bee').style.left, '0%');
});

test('UI stops at an edge without drawing outside the board and supports retry and switching modes', () => {
  const app = makeApp();
  app.click('choose-easy'); app.add(Array(6).fill('F')); app.click('go'); app.finish();
  assert.equal(app.element('bee').style.left, '80%');
  assert.equal(app.element('result').hidden, true);
  assert.match(app.element('status').className, /retry/);
  assert.equal(app.pendingTimers(), 0);
  app.click('go');
  assert.equal(app.element('bee').style.left, '0%');
  app.finish();
  app.click('restart');
  assert.equal(app.element('command-count').textContent, '0 / 12');
  app.click('back');
  assert.equal(app.element('game').hidden, true);
  assert.equal(app.element('welcome').hidden, false);
  app.click('choose-challenge');
  assert.equal(app.element('level-text').textContent, '1 / 4');
  assert.equal(app.element('bee').style.top, '60%');
  assert.equal(app.element('left').hidden, false);
  assert.equal(app.element('command-count').textContent, '0 / 12');
});
