# 源码职责

通过 src/manifest.json 按明确顺序拼接为 index.html；当前仍采用共享运行时，不是 ES Modules。不要手工修改生成入口。

- core：运行时、数据规范化、持久化、云同步。
- domain/tasks.js、domain/week.js：任务转换与周计划规则。
- ui/project-settings.js：项目设置草稿与表单。
- domain/projects.js：项目归档与删除。
- ui/decision-detail.js：关键决策编辑与保存。
- domain/task-delete.js：任务删除及关联清理。
- ui/quick-note.js：速记完成与转换。
- domain/memos.js：备忘录操作。
- domain/data-transfer.js：导入与导出。
- domain/recovery.js：回收站及版本恢复。
- pages：各页面渲染；ui：通用交互；styles：样式。

本次将 records.js 按连续职责边界拆为八个文件，保持拼接字节与函数顺序完全一致，因此部署入口无需变更。项目设置后续修复见下文。

验证：npm run test:static；构建器校验清单完整性、重复函数及生成入口一致性。

## 本轮后续实现

项目设置样式集中到 styles/project-settings.css；固定弹窗头尾、右侧连续布局、草稿保护及里程碑删除提示已实现。

PR #42 已按最新要求取消独立待整理分类；inbox 兼容字段由状态是否为“待处理”推导，界面不再提供整理开关。

类型简化为任务/长期跟进，旧临时事项归入任务。handledOn 记录本次处理日期：当日从行动/等待执行区隐藏，保留任务状态、日期和分类，支持撤销；次日按原计划显示。恢复策略和云同步传输协议不变。

## 日期、完整搜索与推进记录

- domain/task-dates.js 统一计划、跟进、截止日期的判断和修改；ui/task-dates.js 负责行内日期菜单。等待事项调整跟进日，其余事项调整计划日；未来计划或清除计划移出今天，保留本周、任务状态和本日处理标记。截止日不随改期改变。
- 今天页和所有事项的今日催办共用 isFollowupDue，排除本日已处理项；全部等待保留它们。项目总览分别显示计划已过、跟进逾期与截止逾期。
- pages/search.js 统一相关性排序与总数；预览、分类查看全部和加载更多使用同一结果集。改变关键词重置分类和加载量，打开结果后返回保留位置。
- domain/progress-log.js 规范化 progressLog；ui/progress-log.js 显示记录并通过统一任务更新入口追加。progressDraft 单独自动保存，点击记录后清空草稿。历史周从当时任务快照读取，不补写当前记录。重复生成的新任务不继承记录或草稿。
- 新建任务的 nextAction 留空（普通新建、项目内新建、备忘录转换、关联任务、重复生成），编辑已有任务仍保留已有内容；相关输入框没有占位提示语。
- 布局归属 today.css、task-dates.css、search.css、progress-log.css；任务行自适应仍在 planning-resize.css。

验证新增浏览器流程：快速改期与历史保护、催办计数、搜索完整结果与返回位置、推进草稿及周记录、多个新建入口的空下一步。全部使用合成数据。
