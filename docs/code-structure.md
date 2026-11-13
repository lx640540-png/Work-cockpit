# 代码维护边界

## 源码与发布

修改 `src/` 中的源码，再运行 `npm run build`。根目录 `index.html` 是自动生成并提交到 Git 的发布文件，不直接编辑。`npm run check:build` 会阻止源码与发布文件不一致的版本通过持续集成（CI）。

构建只使用 Node 内置库，不引入框架或依赖，也不改变现有静态部署、URL、第三方运行库及存储格式。`src/manifest.json` 明确拼接顺序；`startup` 中的独立脚本会在外部库之前执行，用于启动反馈与恢复。脚本仍在原有共享作用域中运行，以保留初始化顺序和函数提升行为。这一阶段是职责拆分，尚不是完全隔离的 ES Modules；后续可以围绕明确接口逐步隔离，避免全面重写。

## 修改位置

| 目录 / 文件 | 负责内容 |
|---|---|
| `core/runtime.js` | 基础工具、日期、配置和 UI 布局偏好 |
| `core/model.js` | 数据默认值、旧版本兼容与规范化 |
| `core/store.js` | 应用状态、统一提交、序列化、撤销及恢复快照 |
| `core/cloud.js` | 云同步、冲突、会话隔离与附件传输 |
| `domain/tasks.js` | 任务状态、今日安排、重复事项、排序与跨卡片规则 |
| `domain/week.js` | 周切换、当周捕获和历史周边界 |
| `domain/projects.js`、`domain/memos.js`、`domain/data-transfer.js`、`domain/recovery.js` | 项目、备忘录、导入导出和恢复操作 |
| `pages/` | 今天、本周、事项、项目、备忘录、数据及搜索页面呈现 |
| `ui/task-list.js` | 共用任务条、列表分组和排序组件 |
| `ui/task-detail.js` | 任务详情、草稿、历史查看及自动保存 |
| `ui/rich-editor.js` | 富文本清理、Quill 和兼容编辑行为 |
| `ui/shell.js` | 导航、主题、渲染、对话框及文本框高度 |
| `ui/events.js` | 现有委托事件入口，调用业务规则和保存接口 |
| `ui/drag-resize.js` | 拖动、滚动与分栏尺寸交互 |
| `ui/choices.js` | 属性选择与悬停菜单 |
| `core/boot-loader.js`、`styles/boot-loader.css` | 外部库之前的独立加载层、长时间启动恢复提示和动效 |
| `boot.js` | 启动、跨日和网络恢复监听；成功与失败均结束加载层 |

## 状态与保存规则

- 普通任务操作调用 `updateTask` / `commit`；状态与跨卡片变更复用 `domain/tasks.js`，页面不另写一套规则。
- `commit` 和详情自动保存共用 `persistStateChanges`，按规范化、到期激活、当周捕获、本地保存、请求渲染的顺序执行。
- 连续行内输入继续使用 `recordDirectEdit` + 原有防抖保存，不改成每次键入都重绘页面。
- `serializeState` 只用于立即生成 JSON；`snapshotCore` 返回独立副本，供撤销、恢复和正在上传的请求使用。不要让上传请求或历史记录持有可变的当前状态引用。
- 历史周、存储版本、冲突选择和恢复策略保持原有含义。

## 样式归属

`styles/base.css` 保留现有主题、页面基础和编辑器样式。已移除任务条旧五列布局、今日旧列定位、失效编辑按钮及旧项目总览表格样式。

当前任务布局按职责放在 `task-rows.css`、`planning-inputs.css`、`task-table.css`、`week-review.css`、`project-overview.css`、`responsive.css`。构建顺序保留原有级联关系。修改布局应进入对应文件，不在生成文件末尾添加覆盖补丁；跨卡片响应规则集中于 `responsive.css`。

## 验证与回退

```sh
npm run build
npm run test:static
npm run test:browser
npm run benchmark
```

测试使用合成数据和隔离的云传输模拟，不连接个人业务数据。静态检查验证生成文件一致性；可靠性测试覆盖会话切换、上传并发、离线和冲突；浏览器回归覆盖标题入口、自动保存、排序、长文本、历史周及窄屏。

性能基准是局部序列化耗时，不等同于整页提速承诺。当前优化减少序列化前不必要的深拷贝，以及批量文本框测量的强制布局次数。撤销与上传副本仍保留。

回退时回退整个对应提交，连同 `src/` 和生成的 `index.html` 一起恢复，不单独回退其中一份。本轮没有业务数据迁移。

## 2026-11-13：分割线与 CSS 重复声明整改

- 文档分割线的选中、标题编辑、删除、导出集中到 `ui/rich-divider.js`，样式仅在 `styles/rich-divider.css` 维护；不再从任务详情样式覆盖整个站点的分割线。
- 删除命令核对所属编辑器与选区；聚焦普通输入框后清除旧选中。标题编辑保留 Quill 格式，处理中文组字及事件解绑。
- 富文本复制输出带内联边框的实际 HR；标准 HR 粘贴可转换回文档分割线。
- `npm run audit:css` 检查同一选择器、同一 at-rule 环境中完全相同的重复声明。只清理相同取值，保留不同取值与媒体规则；这不是全部历史 CSS 治理完成。
- 正式版不包含阶段验收与周排期试用，不改变正式业务数据结构。新增回归见 `qa-divider.js` 与 `qa-divider-browser.js`。
