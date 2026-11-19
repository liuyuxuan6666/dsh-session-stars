<div align="center">

<img src="docs/images/hero.png" alt="Starred sessions in the DeepSeek Harness sidebar" width="100%" />

<h1>会话星标 · Session Stars</h1>

<p><b>给 DeepSeek Harness 的会话列表加一颗星：把正在跟的任务标住，左上角点一下全部看到。</b></p>

<p>
  <a href="https://github.com/liuyuxuan6666/dsh-session-stars/releases"><img alt="release" src="https://img.shields.io/github/v/release/liuyuxuan6666/dsh-session-stars?color=2f6fe0&label=release"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-2f6fe0"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img alt="dsh" src="https://img.shields.io/badge/dsh-%E2%89%A50.2.0--rc.2-2f6fe0"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-2f6fe0">
  <img alt="tests" src="https://img.shields.io/badge/tests-8%20passing-3fb950">
</p>

<p>
  <a href="#快速开始">快速开始</a> ·
  <a href="#为什么是星标">为什么是星标</a> ·
  <a href="#功能">功能</a> ·
  <a href="#数据与接口">数据与接口</a> ·
  <a href="#设计取舍">设计取舍</a> ·
  <a href="#english">English</a>
</p>

</div>

---

## 快速开始

```text
Plugin Manager → 安装 bundle → file:/abs/path/to/dsh-session-stars
```

装好后刷新一次页面，左侧栏「插件」下面会多一个 **星标**；鼠标移到任意会话行，行尾「更多 / 归档 / 置顶」这一排会多一颗星。

不用记快捷键，也不用改配置——**星标是这台机器上的一个 JSON 文件**，刷新、重开都不丢。

## 为什么是星标

会话多了以后，侧栏只有两种手段，都不太顺手：

| 手段 | 它做了什么 | 为什么不够 |
| --- | --- | --- |
| 侧栏排序 / 时间 | 按工作区、时间排 | 跟的几条任务会散落在不同工作区，隔天就沉下去 |
| 归档 | 把会话**移出**列表 | 是一次"处理完"的动作，不是"标记" |
| 置顶 | 压住工作区顶部几条 | 名额有限，而且只作用于单个工作区 |
| **星标** | 在**你自己的清单**里记一笔 | 不动会话、不改排序、不限数量，取消零成本 |

星标是"临时标记"那个缺位：用它标住"这周要回来的三条会话"，和归档、置顶互不干扰。

## 功能

<table>
<tr>
<td width="42%"><img src="docs/images/row-star.png" alt="Hover strip" width="100%" /></td>
<td>

**① 行内星标**<br/>
悬停会话行，`…` `归档` `置顶` 之间多一颗星。空心=未标，实心品牌色=已标。24×24、透明底，跟旁边两个按钮同一套视觉。

**② 常驻小星**<br/>
已标星的行在时间后面挂一颗小星——不用悬停也能看出哪些标过。

</td>
</tr>
<tr>
<td width="42%"><img src="docs/images/sidebar-entry.png" alt="Sidebar entry" width="100%" /></td>
<td>

**③ 左上角入口**<br/>
侧栏面板入口新增「星标」，位置在「插件」和「全局搜索」之间，图标、字号、行高都跟邻居一致。

**④ 触屏可达**<br/>
会话的「…」菜单里也有一条「加星标 / 取消星标」——悬停按钮在无悬停设备上会被隐藏，菜单是那条路。

</td>
</tr>
<tr>
<td width="42%"><img src="docs/images/panel.png" alt="Starred panel" width="100%" /></td>
<td>

**⑤ 星标页**<br/>
按工作区分组：会话标题、加星时间、工作区路径；会话已被清掉的标一枚「会话不可用」，不假装它还在。行尾一键取消星标。

</td>
</tr>
</table>

## 使用

1. 鼠标移到左侧任意会话行 → 点行尾的 **星标**
2. 左侧栏点 **星标** → 看所有已标星的会话
3. 不想标了：列表里点「取消星标」，或回到会话行再点一次

点星后立即生效（乐观更新）；请求失败会回滚，并在星标页顶部说明原因。

## 安装

插件是一个 DSH bundle（Host 半 + Web Client 半），随 profile 一起加载。

**本地目录**（开发时）：Plugin Manager 安装 `file:/abs/path/to/dsh-session-stars`，或直接写进 profile 的 `package.json`：

```json
{
  "dependencies": { "dsh-session-stars": "file:/abs/path/to/dsh-session-stars" },
  "dsh": { "profile": { "bundles": ["dsh-session-stars"] } }
}
```

装好后在「插件」页确认 **会话星标 / Session stars** 已启用：

- **Host 半**随 bundle 立即挂载（改了 Host 代码需要热重载或重启）
- **Client 半**需要刷新页面一次才会出现在侧栏

## 数据与接口

星标存在 `$DSH_HOME/session-stars/stars.json`：

```json
{
  "version": 1,
  "updated": "2026-11-19T06:28:03.555Z",
  "items": [
    {
      "sessionId": "session-dd6399c4-…",
      "title": "DSH 主程序升级兼容性检查",
      "cwd": "C:/Users/…/default-workspace",
      "starredAt": "2026-11-19T06:28:03.555Z"
    }
  ]
}
```

| 接口 | 说明 |
| --- | --- |
| `GET /api/session-stars/state` | `{ version, updated, items: [{ sessionId, title, cwd, workspaceTitle, starredAt, alive }] }` |
| `POST /api/session-stars/op` | `{ op: "star" \| "unstar" \| "toggle", sessionId, title? }` → 同上，另带 `starred` |

打开列表时会用 `sessionQuery` 刷新标题（改名后显示新名字）、检查会话是否还在，用 `workspaceRegistry` 取工作区名；这两个服务缺失时退回存储里的快照，**降级不报错**。

**安全边界**

- 同源：有 `Origin` 时其 host 必须等于请求的 `Host`
- 写请求必须带自定义头 `x-dsh-session-stars: 1` 且 `content-type: application/json`——跨站表单发不出这个头，跨站 `fetch` 会先触发预检，而本插件不给 CORS 头
- 不读任何凭据，不改会话内容，只读写自己的 `stars.json`

## 设计取舍

**为什么数据在 Host 而不是 localStorage**
星标是"用户的清单"，不是某个标签页的视图状态。放 Host 才能在换浏览器、开第二个窗口时保持一致；客户端只持有一份内存缓存，永远不写自己的副本。

**为什么路由是 `handler` 而不是 `resource`**
DSH 的 `resource` 路由只接 GET/HEAD——POST 会在到达处理函数之前被 405 挡掉。要写，就得用 `handler` 自己拿 `IncomingMessage` / `ServerResponse`。

**为什么只列不跳**
按需求刻意留白：这个页面是"看一眼清单"，不是第二个侧栏。回跳、标签分组、排序、搜索都还没做。

**为什么用插件自带的纯函数层**
`lib/store.js` 不碰 I/O、不自带时钟，规则（时长、上限、去重、排序）都能单测——Host 只负责读写文件和调度。

## 插槽

| 插槽 | 作用 |
| --- | --- |
| `sidebar.workspaces.session.row.action` | 行尾星标按钮（`order: 150`，夹在「归档」100 与「置顶」200 之间） |
| `sidebar.session.row.trailing` | 已标星的小星标记（非交互） |
| `sidebar.workspaces.session.menu.item` | 「…」菜单里的同名条目（`order: 380`） |
| `sidebar.panellist` + `main` | 「星标」入口与整页列表（`main` 的 key 与入口 id 相同：`session-stars`） |

只使用公开 API（`ctx.slots.inject/register`、`ctx.webServer.register`、`ctx.get('sessionQuery' | 'workspaceRegistry')`），不读写别的插件的 DOM，也不替换应用根节点。

## 开发

```bash
git clone git@github.com:liuyuxuan6666/dsh-session-stars.git
cd dsh-session-stars

npm run check   # node --check 三个入口
npm test        # node --test：lib/store.js 的纯函数规则
```

```
index.js        Host 半：store 读写 + 富化 + HTTP 路由
client.js       Client 半：三个行内插槽 + 入口 + 面板
lib/store.js    纯函数规则（可单测，无 I/O）
locale/         Plugin Manager 页使用的 title / description
docs/DETAIL.md  插件详情页
```

CI 在 Node 20 / 22 上跑语法检查、单测和 `npm pack --dry-run`。

## Roadmap

- [ ] 星标页支持回跳会话
- [ ] 标签 / 分组 / 手动排序
- [ ] 可选：把「全部会话」也列在这里，就地标星
- [ ] 跨设备同步（需要 Host 侧导出）

## License

[MIT](./LICENSE) © 2026 lyx6666

---

## English

**Session Stars** adds a star to every session row in the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) sidebar and collects the starred sessions in one panel.

- Hover a session row → press the star next to *archive* / *pin*; starred rows keep a small star after their timestamp.
- The same toggle is in the row's `…` menu, so touch and hoverless devices work too.
- The **Starred** entry in the left sidebar opens a list grouped by workspace: title, starred time, workspace path, and an *unavailable* badge when the session no longer exists.
- Stars live in `$DSH_HOME/session-stars/stars.json` (atomic writes, corrupt files parked aside). The panel refreshes titles and existence from the live session query and degrades to the stored snapshot when those services are absent.
- Star state is Host-owned on purpose: another tab or browser sees the same list, and one write path cannot diverge.

Install as a DSH bundle (`file:` or npm), enable it in Plugin Manager, then reload the page once for the client half. MIT licensed.
