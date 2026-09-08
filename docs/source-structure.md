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
