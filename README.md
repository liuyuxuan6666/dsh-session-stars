# dsh-session-stars

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![dsh](https://img.shields.io/badge/dsh-%3E%3D0.2.0--rc.2-4b6bfb.svg)](https://github.com/deepseek-ai/deepseek-harness)

给 **DeepSeek Harness** 的左侧会话列表加一个星标：把正在跟的任务、要回来的对话标一下，再从左上角的「星标」入口集中查看。

A star for every session row in the DeepSeek Harness sidebar, plus one panel that collects the starred sessions.

| 会话行（悬停） | 星标页 |
| --- | --- |
| ![会话行星标](docs/images/row-star.png) | ![星标页](docs/images/panel.png) |

左侧栏入口（「插件」下面）：

![侧栏入口](docs/images/sidebar-entry.png)

## 功能

- **会话行加星**：鼠标移到左侧任意会话行，行尾（「更多」「归档」「置顶」同一排）多出一个星标按钮，点一下标星、再点取消。
- **一眼看见**：标星的行在时间后面常驻一个小星，不用悬停也能看出哪些会话标过。
- **键盘/触屏可达**：会话行的「…」菜单里同样有一条「加星标 / 取消星标」，悬停按钮被隐藏的设备也能用。
- **星标入口**：左侧栏面板入口（「插件」同一列）新增「星标」，点开是一个按工作区分组的列表：标题、加星时间、工作区路径；会话已被删除的会标「会话不可用」。
- **状态由 Host 持有**：星标存在 `$DSH_HOME/session-stars/stars.json`，换浏览器、刷新、重开 DSH 都在。
- **标题自动跟随**：打开列表时会用会话日志里的最新标题刷新，改名后不会一直显示旧名字。

暂不包含（按需求刻意留白）：从列表跳回会话、标签分组、排序/搜索、跨设备同步。

## 安装

插件是一个 DSH bundle（Host 半 + Web Client 半），随 profile 一起加载。推荐用 Plugin Manager 安装本地目录或 npm 包：

```bash
# 本地目录（开发时）
#   Plugin Manager → 安装 bundle → file:/abs/path/to/dsh-session-stars
# 或者直接写进 profile 的 package.json：
#   "dsh-session-stars": "file:/abs/path/to/dsh-session-stars"
#   并把 "dsh-session-stars" 加进 dsh.profile.bundles
```

装好后在「插件」页确认 `会话星标 / Session stars` 已启用。Host 半会随 bundle 立即挂载（改 Host 代码需要热重载或重启）；**Client 半需要刷新页面一次**才会出现在侧栏。

## 使用

1. 鼠标移到左侧任意会话行 → 点行尾的星标。
2. 左侧栏点「星标」→ 看所有已标星的会话。
3. 不想标了：列表里点「取消星标」，或回到会话行再点一次星。

## 数据与接口

| 项目 | 值 |
| --- | --- |
| 存储文件 | `$DSH_HOME/session-stars/stars.json`（原子写入，损坏时留 `.corrupt-<时间戳>` 备份） |
| `GET /api/session-stars/state` | `{ version, updated, items: [{ sessionId, title, cwd, workspaceTitle, starredAt, alive }] }` |
| `POST /api/session-stars/op` | body `{ op: "star" \| "unstar" \| "toggle", sessionId, title? }` → 同上，另带 `starred` |

安全边界：

- 只接受同源请求（有 `Origin` 时其 host 必须等于请求的 `Host`）。
- 写操作必须带自定义头 `x-dsh-session-stars: 1` 且 `content-type: application/json`；跨站表单发不出这个头，跨站 `fetch` 会先触发预检，而本插件不给 CORS 头。
- 接口不读任何凭据，也不改会话内容，只读写自己的 `stars.json`。

## 插槽

| 插槽 | 作用 |
| --- | --- |
| `sidebar.workspaces.session.row.action` | 行尾星标按钮（`order: 150`，夹在「归档」和「置顶」之间） |
| `sidebar.session.row.trailing` | 已标星的小星标记（非交互） |
| `sidebar.workspaces.session.menu.item` | 「…」菜单里的同名条目（触屏/无悬停设备） |
| `sidebar.panellist` + `main` | 「星标」入口与整页列表（`main` 的 key 与入口 id 相同：`session-stars`） |

只使用公开 API（`ctx.slots.inject/register`、`ctx.webServer.register`、`ctx.get('sessionQuery' | 'workspaceRegistry')`），不读写别的插件的 DOM。

## 开发

```bash
npm run check   # node --check 三个入口
npm test        # node --test：lib/store.js 的纯函数规则
```

目录：

```
index.js        Host 半：store 读写 + 富化 + HTTP 路由
client.js       Client 半：三个行内插槽 + 入口 + 面板
lib/store.js    纯函数规则（可单测，无 I/O）
locale/         manager 页使用的 title/description
docs/DETAIL.md  插件详情页
```

## License

[MIT](./LICENSE)
