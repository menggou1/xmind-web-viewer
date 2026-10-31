# Xmind Web Viewer

现代、开源、免费的 Xmind 学习导图阅读器。直接把 `.xmind` 放进仓库，GitHub Actions 负责解析、提取图片、构建及发布 GitHub Pages。阅读者无需安装软件、登录账号或下载原文件。

支持完整正文、多画布、图片大图、概要反向括号、严格从左到右的布局、全文搜索、分支折叠、节点分享、GitHub Light / Dark / 跟随系统及手机触控。原始 Xmind 是唯一内容来源；不需要手工转成 HTML。

## 本地运行

需要 Node.js 24 LTS、npm 和 Git（Node.js 最低版本 22.12）。

```powershell
git clone https://github.com/menggou1/xmind-web-viewer.git
cd xmind-web-viewer
npm ci
npm run dev
```

打开终端给出的 `http://127.0.0.1:5173/xmind-web-viewer/`。首次运行会自动扫描 `maps/`。本地修改 Xmind 后再次执行 `npm run content`（或重启开发命令）；前端源码修改由 Vite 自动刷新。

## 新增、更新与删除导图

1. 把原始 `.xmind` 放到 `maps/学科名称/`，可以继续创建子文件夹。
2. 执行 `npm run build`，检查控制台和生成的 `public/data/report.json`。
3. 提交并推送到 `main`。Actions 自动发布，无需手工维护文件列表。

删除 `maps/` 中的文件并重新构建，会从目录和发布内容同步移除。生成数据、图片与 `dist/` 不入 Git，原始 `.xmind` 必须入库。文件、目录中的中文、空格和常见特殊字符均可保留。

本次仅清理文件名的 `（完结）`、`(完结)`、`（整理完成）` 和末尾 `_副本`；食品微生物学前两章采用章节名称，第二章为“微生物主要类群及形态结构”，去除文件名中的 `（考研）`；第八至十章补齐数字序号。**没有改动 Xmind 压缩包中的任何字节，所有画布名、章节名、节点文字、标点、换行均保留原文。** 原文件名、新文件名及内容 SHA-256 记录在 [docs/file-renames.json](docs/file-renames.json)。`scripts/normalize-filenames.ts` 是可选的一次性命名工具，不参与日常构建。

## 阅读与分享

- 点击节点：打开全文、备注、标签和安全的原始超链接；点击节点右侧圆形按钮：展开或折叠。
- 搜索覆盖**全部画布和隐藏节点**。上下箭头或 Enter / Shift+Enter 切换结果，自动切换画布并展开祖先；清除搜索恢复当前画布搜索前的折叠与视野。
- 工具栏可全部展开、折叠到指定层级；更多菜单可调整间距或重新整理布局。节点面板支持展开或折叠全部后代。
- 拖动或单指平移，滚轮或双指缩放；底部按钮支持适应画布、定位根节点和缩放。
- 点击图片看原图清晰度，支持拖动、滚轮、按钮和双指缩放，Esc 或关闭按钮退出。不会把所有图片 Base64 塞进 HTML。
- 目录、阅读器和节点面板均提供复制链接。URL 使用 Hash 路由，例如 `#/map/英文数字ID?sheet=画布ID&node=节点ID`，刷新和直接访问不依赖服务器重写。

导图 ID 来自**首画布 ID 与根节点 ID**的 SHA-256；改文件名、目录或正常编辑正文不会改变链接。若在 Xmind 中重建这些 ID、改变首画布或删除导图，旧链接不能保证继续有效。复制具有相同首画布与根节点身份的文件会导致构建明确失败，避免目录 ID 冲突。数据文件名按生成内容散列，图片按原图字节散列，避免更新和同名图片造成缓存混淆。

## 构建、测试与报告

```powershell
npm run build         # 扫描、解析、提取、类型检查、生产构建
npm test              # 解析、真实文件完整性、概要与布局、安全边界
npm run test:e2e      # Windows 默认使用已安装的 Edge
npm run preview       # 预览 dist/；默认端口 4173
```

浏览器测试默认在 Windows Edge 上运行桌面与 Android Pixel 7 模拟视口；CI 安装并使用 Playwright Chromium。没有 Edge 时可执行：

```powershell
npx playwright install chromium
$env:CI = 'true'
npm run test:e2e
```

`public/data/report.json` 包含每个源文件的散列、节点/图片/画布数量、层数、概要 ID、覆盖的节点 ID 与原文、警告及解析耗时。文件无法解析时构建失败并报告文件名；图片缺失或某项外观不支持时会在报告及阅读说明中显示警告。解析失败不会先删除上一份生成数据。

验收范围及限制见 [docs/VALIDATION.md](docs/VALIDATION.md)。截图和失败跟踪位于本地 `test-results/` 或 Actions 的 `validation-*` artifact。

## GitHub Pages

1. 在 GitHub 创建 `xmind-web-viewer` 仓库并推送本项目（本仓库已配置远程）。
2. 打开 **Settings → Pages → Build and deployment → Source → GitHub Actions**。
3. 推送 `main`，或在 **Actions → Verify and deploy Pages → Run workflow** 手动触发。
4. Windows 与 Ubuntu 都需通过类型检查、生产构建、单元测试与 Chromium 桌面/手机测试，随后通过官方 Pages Actions 发布。
5. 查看 Actions 中 `deploy` 的环境链接获取站点地址。部署成功前不要把预期地址当成已上线地址。

`vite.config.ts` 默认 `base: '/xmind-web-viewer/'`。若改仓库名，在构建环境设置 `VITE_BASE_PATH=/新仓库名/`；部署到域名根目录时设置 `/`。内容、Worker 和图片均使用相同 base，不需要自定义域名、服务器、数据库或 API Key。

## 数据与布局

解析支持现代 `content.json` 与旧版 `content.xml`，现代 JSON 优先。概要按 [Xmind 官方模型](https://github.com/xmindltd/xmind-model/blob/master/schemas/summary.json) 的 `topicId`、`range` 和 `children.summary` 关联；`(a,b)` 的两端索引均包含，不会把概要当成普通子节点，也不会通过坐标推断范围。

采用 React + TypeScript + Vite、React Flow、Lucide、yauzl、fast-xml-parser 和 sharp。选择带流式限额的 yauzl 读取 ZIP；布局采用自定义 **概要约束树布局**，而非仅有普通树边约束的 ELK：

1. 使用与实际卡片相同的 DOM/CSS 测量文字、换行和图片尺寸。
2. 自下向上计算分支矩形，按原始兄弟顺序分配垂直空间。
3. 按概要的确切范围提前扩展垂直带，为每个概要及其后续分支分配独立右侧通道。
4. 所有普通节点和概要后代严格向右；多个、嵌套、交叠范围的概要不会因共享空间造成节点重叠。
5. 在 Web Worker 中执行布局；普通线由 React Flow 绘制，概要用随视口共同变换的 SVG 曲线路径绘制。

概要括号覆盖指定兄弟分支**当前可见的整个子树范围**。折叠其中某个分支时，其根节点仍被概括，跨度随可见后代缩短；折叠概要所属父节点时，同时隐藏其概要。概要自身也可以折叠、搜索，并继续向右展开子节点。大量概要会增加横向宽度，这是保证语义及避让准确的取舍。

超过 200 节点默认展开至第 2 级，同时尊重源文件原始折叠状态，随时可全部展开。目录只请求索引，打开时只请求当前导图；图片独立缓存并懒加载，隐藏后代不参与渲染，屏幕外节点由 React Flow 减少渲染。最近查看的 4 份导图保留内存缓存。

## 安全边界与兼容性

- 限制 ZIP 输入 128 MiB、展开声明总量 512 MiB、单条目 64 MiB、20,000 条目，单资源读取限制与声明长度均在流式读取时验证；异常压缩比、重复路径、路径穿越、符号链接、加密 ZIP 会报错。
- XML 禁止 DTD、实体声明及外部实体。节点最多 50,000 个、128 层、200 张画布。
- 所有标题和备注按 React 纯文本渲染，绝不执行内嵌 HTML。链接仅接受 `https:`、`http:`、`mailto:`。不自动请求文件里的外部图片或其他外部资源。
- 嵌入 PNG / JPEG / GIF / WebP / AVIF 以独立文件提供，TIFF 另生成 PNG 显示副本并保留原图；不支持的图片显示占位并报告。SVG 不执行、不内联，当前作为不支持格式处理。
- 自由主题及标注保留并以虚线关系展示；普通关系线保留语义。边界框、标记和部分扩展外观保留原始元数据并报告，暂不还原外观。
- 旧版 XML 兼容性目前由合成测试覆盖；现有真实样本全部为现代 JSON，不能据此宣称兼容所有历史 Xmind 版本。

## 项目结构

```text
.github/workflows/deploy.yml   跨平台验证与官方 Pages 部署
maps/                         原始 Xmind（内容唯一来源）
scripts/archive.ts            安全 ZIP 索引与受限流式读取
scripts/parse-xmind.ts         现代 JSON / 旧版 XML 解析
scripts/extract-assets.ts      图片关联、格式检查与提取
scripts/build-index.ts         自动目录、数据和兼容性报告
src/types/                    独立主题与概要模型
src/lib/                      概要约束布局、Worker、测量、路由与搜索
src/components/               画布、节点、图片查看器、主题
src/pages/                    导图库和阅读器
src/styles/                   GitHub Light / Dark 响应式样式
tests/                        解析、真实文件、布局、安全和浏览器测试
public/data/                  自动生成，不入 Git
dist/                         构建输出，不入 Git
```

采用[分文件授权](LICENSE)：思维导图及其派生 JSON、图片等内容仅适用 [浏览许可](LICENSE-DATA)，仅允许在线浏览，禁止复制、主动下载、传播、改编等；其他项目文件继续使用 [MIT License](LICENSE-MIT)。这些是授权限制，公开仓库和静态网站不能从技术上阻止他人获取数据。
