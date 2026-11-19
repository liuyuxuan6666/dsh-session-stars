# Changelog

## 0.1.1 — 2026-11-19

- 会话行时间标签后的星改为**常驻可点击按钮**：标星后鼠标移开仍然显示，点它即可取消
  （行尾按钮排是悬停才出现的，标完就藏起来会让人以为没生效）。
- README / 详情页去掉截图，只留文字与表格说明。

## 0.1.0 — 2026-11-19

首个版本。

- 会话行尾星标按钮（`sidebar.workspaces.session.row.action`，order 150）。
- 已标星行的时间后常驻小星（`sidebar.session.row.trailing`）。
- 「…」菜单里的加星标 / 取消星标（`sidebar.workspaces.session.menu.item`）。
- 左侧栏「星标」入口与按工作区分组的列表页（`sidebar.panellist` + `main`）。
- Host 半：`$DSH_HOME/session-stars/stars.json` 原子读写，`GET /api/session-stars/state`、
  `POST /api/session-stars/op`，同源 + 自定义头校验。
- 打开列表时用 `sessionQuery` 刷新标题，用 `workspaceRegistry` 取工作区名；
  服务缺失时降级为存储里的快照，不报错。
