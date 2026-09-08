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

本次将 records.js 按连续职责边界拆为八个文件，保持拼接字节与函数顺序完全一致，因此部署入口无需变更。既有项目设置缺陷仍单独待修。

验证：npm run test:static；构建器校验清单完整性、重复函数及生成入口一致性。

## 本轮后续实现

项目设置样式集中到 styles/project-settings.css；固定弹窗头尾、右侧连续布局、草稿保护及里程碑删除提示已实现。

收件箱使用独立 inbox 布尔字段。无字段的旧记录由原状态推导初始值；已存在的布尔值保留。状态及计划变更不隐式完成整理。任务详情提供“待整理”复选框，收件箱提供“整理完成”。

类型简化为任务/长期跟进，旧临时事项归入任务。handledOn 记录本次处理日期：当日从行动/等待执行区隐藏，保留任务状态、日期和分类，支持撤销；次日按原计划显示。恢复策略和云同步传输协议不变。
