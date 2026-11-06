const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

function fixture(collapsed = '') {
 const listeners = new Map(), style = new Map();
 const handle = { id: 'todayResizer', closest: () => null, classList: { add() {}, remove() {} }, setPointerCapture() {} };
 const grid = { getBoundingClientRect: () => ({ left: 0, width: 1000 }), style: { setProperty: (key, value) => style.set(key, value) } };
 const context = vm.createContext({
  document: { addEventListener: (type, callback) => { const list = listeners.get(type) || []; list.push(callback); listeners.set(type, list); } },
  window: { addEventListener() {} },
  $: selector => selector === '#todayExecution' ? grid : null,
  uiLayout: { todayLeft: .6, todayCollapsed: collapsed },
  currentPage: 'today', checklistResizeState: null,
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  previewTodayCollapse: value => context.preview = value,
  syncTodayPanels: () => { context.synced = true; },
  scheduleTodayScrollability() {}, resizePlanningTextareas() {}, saveUiLayout() {}
 });
 vm.runInContext(fs.readFileSync('src/ui/drag-resize.js', 'utf8'), context);
 const down = listeners.get('pointerdown').find(callback => String(callback).includes('event.target.id==="todayResizer"'));
 const move = listeners.get('pointermove').find(callback => String(callback).includes('resize.pending'));
 down({ target: handle, clientX: collapsed ? 0 : 600, pointerId: 1, preventDefault() {} });
 return { context, style, move: x => move({ clientX: x }) };
}

test('crossing a collapse threshold previews without hiding, then commits on release and retains the saved width', () => {
 const { context, move, style } = fixture();
 move(80);
 assert.equal(context.preview, 'left');
 assert.equal(context.uiLayout.todayCollapsed, '');
 context.finishResize({ type: 'pointerup' });
 assert.equal(context.uiLayout.todayCollapsed, 'left');
 assert.equal(context.uiLayout.todayLeft, .6);
 assert.equal(style.get('--today-left'), '60.00%');
 assert.equal(context.preview, '');
});

test('moving back from the threshold or cancelling does not collapse a pane', () => {
 const { context, move } = fixture();
 move(80); move(500);
 assert.equal(context.preview, '');
 context.finishResize({ type: 'pointerup' });
 assert.equal(context.uiLayout.todayCollapsed, '');
 assert.equal(context.uiLayout.todayLeft, .5);
 const cancelled = fixture(); cancelled.move(930);
 cancelled.context.finishResize({ type: 'pointercancel' });
 assert.equal(cancelled.context.uiLayout.todayCollapsed, '');
 assert.equal(cancelled.context.uiLayout.todayLeft, .6);
});

test('dragging a folded divider restores the pane only after release', () => {
 const { context, move } = fixture('left');
 move(400);
 assert.equal(context.preview, 'restore-left');
 assert.equal(context.uiLayout.todayCollapsed, 'left');
 context.finishResize({ type: 'pointerup' });
 assert.equal(context.uiLayout.todayCollapsed, '');
 assert.equal(context.uiLayout.todayLeft, .4);
});
