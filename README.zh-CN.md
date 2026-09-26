# Private Share for Obsidian

[English](README.md)

Private Share 是一个轻量级 Obsidian 单页分享插件。

它的目标不是把整个 Vault 发布成网站，而是像 Notion / Anytype 的单页分享一样：只分享你指定的这一篇笔记，并生成一个较长、随机、难以猜测的链接。

## 适合什么场景

如果你只想把某一篇 Obsidian 笔记发给客户、同事、朋友或家人，而不希望对方看到你的其他笔记、文件夹结构、首页、搜索结果或整个知识库，那么这个插件就是为这种场景设计的。

典型分享链接类似：

`https://your-share-domain.example/s/随机长字符`

访问者只能看到这一个被分享的页面。

## 主要功能

- 分享当前 Markdown 笔记
- 已分享笔记可继续更新，公开链接保持不变
- 随时取消分享
- 自动上传笔记引用的附件
- 支持常见图片、PDF、Excel、Word、ZIP 等附件
- Obsidian 的普通 `[[内部链接]]` 不会自动暴露其他笔记
- 普通内部链接会转换为纯文字
- 支持桌面版 Obsidian
- 支持手机版 Obsidian
- 分享服务器地址和 API Token 只保存在本地插件配置中

## 使用方式

安装并配置好插件后，日常使用非常简单。

在电脑端：

1. 在 Obsidian 左侧文件列表中右键一篇 Markdown 笔记
2. 选择“分享此笔记”
3. 插件上传当前笔记和引用附件
4. 服务端生成随机长链接
5. 分享链接自动复制到剪贴板

在手机端：

1. 打开需要分享的笔记
2. 打开命令面板
3. 运行“分享当前笔记”
4. 获取并复制分享链接

如果这篇笔记已经分享过，可以选择：

- 更新当前分享
- 取消当前分享

更新时仍然使用原来的公开网址。

## 为什么不是整站发布

Private Share 与 Quartz、MkDocs、Hugo 等静态站点工具的思路不同。

它不会默认提供：

- 公开首页
- 笔记目录
- 全站搜索
- 所有已发布页面列表
- Vault 文件夹结构

它更强调“只分享指定页面”。

这对于临时给客户查看产品资料、技术说明、会议记录、报价说明、项目笔记等内容会更方便。

## 附件处理

插件会识别 Obsidian 中类似下面的附件引用：

`![[photo.jpg]]`

`![[report.pdf]]`

`![[data.xlsx]]`

分享时会把这些附件一起上传。

图片会直接显示在页面中，PDF、Excel、Word 等文件会以链接形式提供。

## 隐私设计

GitHub 仓库本身不包含任何个人配置。

下面这些内容都不会写入公开仓库：

- 你的域名
- 你的服务器地址
- Cloudflare Tunnel Token
- Private Share API Token
- Vault 本地路径
- 已分享页面记录
- 分享链接

这些信息保存在本地：

`.obsidian/plugins/private-share/data.json`

并且 `data.json` 已加入 `.gitignore`。

## 安装

### 使用 BRAT

可以通过 BRAT 安装本插件。

仓库：

`ditele1/private-share`

安装完成后进入：

`设置 -> Private Share`

填写：

- Share server URL
- API Token

### 手动安装

将下面三个文件放入：

`.obsidian/plugins/private-share/`

所需文件：

- `main.js`
- `manifest.json`
- `styles.css`

然后重新启动 Obsidian，并在第三方插件中启用 `Private Share`。

## 服务端接口

插件需要配合兼容的自建分享服务使用。

目前使用的接口包括：

- `POST /api/publish`
- `PUT /api/update/:id`
- `DELETE /api/unpublish/:id`

公开页面路径格式：

`/s/<random-id>`

## 安全说明

随机长链接主要用于降低被猜测和枚举的可能性，但它并不等同于强身份认证。

对于更敏感的内容，可以在服务端继续扩展：

- 访问密码
- 过期时间
- 一次性链接
- 登录验证
- IP 限制
- Cloudflare Access

## 后续计划

可以继续扩展：

- 分享密码
- 自动过期
- 分享管理页面
- 更好的移动端操作入口
- 更完整的 Obsidian Markdown 兼容
- 分享状态提示
- 一键复制已有分享链接

## License

MIT

## 媒体分发与兼容要求

0.5.7 的稳定短链与引用检查需要服务端 0.8.0、媒体 Worker 1.0.0。服务端必须明确配置媒体域名，签名密钥存入 Worker Secret。新上传只接受经验证的 `/m/<16位短码>`；注册失败时保留本地链接和已上传对象的重试记录。已有 `/f/` 签名链接继续兼容。

分享状态在启动、返回前台及可见状态下每 30 秒刷新，被动刷新不申请管理令牌。两台设备需使用同一服务端和相同的 Vault 内笔记相对路径。

删除远程附件前检查 Vault 正文与已发布内容，复制到其他笔记的链接也参与保护；核实失败或仍有其他归属记录时保留文件。离线设备尚未同步的修改无法被观察，后续需要服务端附件归属账本进一步强化保证。可用“重试待清理的远程附件”命令处理待删除记录。

回归检查：`node --check main.js`、`node --test tests/plugin.test.cjs`。
