// Reproducible synthetic-state comparison; timings are observations, not CI thresholds.
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const text = fs.readFileSync(require('node:path').join(__dirname, '../src/core/store.js'), 'utf8');
const state = { version: 8, tasks: Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`,
  title: `合成事项 ${i}`, notes: '<p>测试记录</p>'.repeat(20), nextAction: '确认下一步', relatedTaskIds: [] })),
  projects: [], memos: [], decisions: [], weeks: {}, trash: [], snapshots: [], favorites: [],
  quickNote: {}, order: {}, meta: {} };
for (let i = 0; i < 8; i++) state.weeks[`week${i}`] = { taskSnapshots: state.tasks.slice(0, 80) };
const c = vm.createContext({ state, JSON });
for (const name of ['stateCore','serializeState','snapshotCore']) {
  const line = text.split('\n').find(line => line.startsWith(`function ${name}(`));
  vm.runInContext(line, c);
}
const oldWrite = () => JSON.stringify(c.snapshotCore());
assert.equal(oldWrite(), c.serializeState());
const measure = fn => {
  for (let i = 0; i < 10; i++) fn();
  const samples = [];
  for (let i = 0; i < 50; i++) { const start = performance.now(); fn(); samples.push(performance.now() - start); }
  samples.sort((a,b) => a-b); return Number(samples[25].toFixed(3));
};
console.log(JSON.stringify({ fixture: '500 tasks, 8 historical weeks; 50 samples',
  bytes: Buffer.byteLength(c.serializeState()), previousMedianMs: measure(oldWrite),
  currentMedianMs: measure(() => c.serializeState()) }, null, 2));
