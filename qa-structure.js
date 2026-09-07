const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const manifest = require('./src/manifest.json');
const js = manifest.scripts.map(name => fs.readFileSync('src/' + name, 'utf8')).join('');
function source(name) {
  const start = js.indexOf(`function ${name}(`);
  assert(start >= 0, `missing ${name}`);
  for (let end = js.indexOf('}', start); end >= 0; end = js.indexOf('}', end + 1)) {
    const text = js.slice(start, end + 1);
    try { new vm.Script(`(${text})`); return text; } catch {}
  }
  throw new Error(`Cannot parse ${name}`);
}
test('serialization retains every persisted field; snapshots stay detached', () => {
  const state = { tasks: [{ id: 'a', notes: '<p>原始备注</p>', relatedTaskIds: ['b'] }],
    projects: [], memos: [], decisions: [], weeks: { old: { taskSnapshots: [{ title: '历史' }] } },
    trash: [], snapshots: [], favorites: [], quickNote: {}, order: {}, meta: { updatedAt: 'original' } };
  const c = vm.createContext({ state, JSON });
  ['stateCore', 'serializeState', 'snapshotCore'].forEach(name => vm.runInContext(source(name), c));
  const snapshot = c.snapshotCore();
  assert.deepEqual(JSON.parse(c.serializeState()), { version: 8, ...state });
  state.tasks[0].notes = 'modified'; state.weeks.old.taskSnapshots[0].title = 'modified';
  assert.equal(snapshot.tasks[0].notes, '<p>原始备注</p>');
  assert.equal(snapshot.weeks.old.taskSnapshots[0].title, '历史');
});
test('task commands and detail saves share normalization, capture, persistence and render order', () => {
  const calls = [], c = vm.createContext({ state: { tasks: [] },
    normalizeState: value => { calls.push('normalize'); return value; },
    activateScheduledTasks: () => calls.push('activate'), captureCurrentWeek: () => calls.push('capture'),
    saveLocal: immediate => calls.push(['save', immediate]), requestRender: () => calls.push('render') });
  vm.runInContext(source('persistStateChanges'), c); c.persistStateChanges({ immediate: true });
  assert.deepEqual(calls, ['normalize', 'activate', 'capture', ['save', true], 'render']);
  assert.match(source('commit'), /persistStateChanges\(options\)/);
  assert.match(source('persistTaskDraft'), /persistStateChanges\(\{immediate:true\}\)/);
});
test('planning height measurement batches layout reads and matches individual sizing', () => {
  const operations = [], elements = [48, 90, 180].map((height, i) => ({
    style: { set height(value) { operations.push(['write', i, value]); },
      set overflowY(value) { assert.equal(value, 'hidden'); } },
    get scrollHeight() { operations.push(['read', i]); return height; }
  }));
  const c = vm.createContext({ PLANNING_TEXTAREA_SELECTOR: 'textarea', Array, Math });
  vm.runInContext(source('resizePlanningTextareas'), c);
  c.resizePlanningTextareas({ querySelectorAll: () => elements });
  assert.deepEqual(operations.map(x => x[0]), ['write','write','write','read','read','read','write','write','write']);
  assert.deepEqual(operations.slice(-3).map(x => x[2]), ['50px','92px','182px']);
});
