const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

function fixture() {
 const text = fs.readFileSync('src/pages/projects.js', 'utf8');
 const code = text.slice(text.indexOf('function weekComparison('), text.indexOf('function renderProjectContent('));
 const snapshot = { id: 't', title: '当周事项', project: 'p', status: '等待', nextAction: '等待样品', week: true };
 const week = { taskIds: ['t'], taskSnapshots: [snapshot], projectSnapshots: [{ id: 'p', name: '当周项目' }], actions: { t: { result: '当周实际结果' } } };
 const context = vm.createContext({
  state: { weeks: { '2026-10-19': week } }, selectedWeekKey: '2026-10-19', Set, Object,
  esc: value => String(value ?? ''), helpDisclosure: () => '',
  taskById: () => ({ ...snapshot, title: '后来改名', status: '已完成', nextAction: '后来动作' }),
  projectById: () => ({ id: 'p', name: '后来项目' })
 });
 vm.runInContext(code, context);
 return { context, week };
}

test('historical review keeps saved titles, project, status and results after current tasks change or disappear', () => {
 const { context, week } = fixture();
 const before = context.weekComparison(week, 'past');
 context.taskById = () => null;
 context.projectById = () => null;
 assert.equal(context.weekComparison(week, 'past'), before);
 for (const text of ['当周事项', '当周项目', '等待', '当周实际结果', 'readonly', 'data-view-task-history="t"']) assert(before.includes(text));
 for (const text of ['后来改名', '后来项目', '已完成', '后来动作']) assert(!before.includes(text));
});

test('current review reflects live task state while preserving this week result and compact optional next step', () => {
 const { context, week } = fixture();
 const html = context.weekComparison(week, 'current');
 for (const text of ['后来改名', '后来项目', '已完成', '当周实际结果', '查看下一步', 'week-outcomes is-empty']) assert(html.includes(text));
 assert(!html.includes('readonly'));
 assert.match(html, /<thead><tr><th>本周事项<\/th><th>状态<\/th><th>实际结果<\/th><\/tr><\/thead>/);
 context.taskById = () => ({ ...week.taskSnapshots[0], nextAction: '' });
 assert(!context.weekComparison(week, 'current').includes('查看下一步'));
});
