# FluxMint 开发任务清单

## 1. 使用方式

这份清单按 `P0 / P1 / P2` 排序。

- `P0`：不做完，产品不可信
- `P1`：做完后，产品开始形成差异化
- `P2`：做完后，产品开始接近成品化

建议执行顺序固定为：

1. 先做 `P0 基础正确性`
2. 再做 `P1 核心差异化`
3. 最后做 `P2 成品化与效率增强`

---

## 2. P0 基础正确性

目标：

- 项目之间绝对隔离
- 子文件夹只显示自己的内容
- 文件移动、重命名、删除、解绑后，索引和 UI 实时一致
- 软件内拖动移动文件稳定可用
- 所有关键文件操作失败时都可解释

### P0-1 项目隔离与索引一致性

任务：

- 复查 `workspace-index.json` 的项目、目录、文件归属关系
- 确保所有资产查询都以 `projectId + folderId/relativePath` 为过滤条件
- 确保任意项目刷新时，不会把其他项目文件带进来
- 绑定多个根目录后，逐个验证文件树和文件列表完全隔离

涉及模块：

- `src-tauri/src/library.rs`
- `src/store/selectors.ts`
- `src/store/useAssetConsoleStore.ts`
- `src/pages/ProjectWorkspacePage.tsx`

验收：

- A 项目内绝对看不到 B 项目文件
- 同名子目录不会互相串数据

### P0-2 子文件夹内容过滤修正

任务：

- 固定“当前目录仅显示当前目录直系文件”的查询逻辑
- 检查是否误用了“项目全量文件”或“包含子目录”的旧逻辑
- 增加目录切换回归测试

涉及模块：

- `src/store/selectors.ts`
- `src/pages/ProjectWorkspacePage.tsx`
- `src-tauri/src/library.rs`

验收：

- 切到任意子目录，只显示该子目录内容
- 不再出现“所有子目录都显示全量内容”

### P0-3 软件内拖动移动文件恢复并稳定

任务：

- 区分“内部移动”与“外部拖出”两条拖拽链路
- 内部移动继续使用应用内拖拽类型，不被外部拖拽逻辑污染
- 文件拖到左侧目录节点时，目标高亮、放下反馈、移动结果都一致

涉及模块：

- `src/pages/ProjectWorkspacePage.tsx`
- `src/components/workspace/FolderTree.tsx`
- `src/utils/assetTransfer.ts`
- `src-tauri/src/library.rs`

验收：

- 单文件、多文件都能稳定拖到其他目录
- 移动后 UI、索引、磁盘位置一致

### P0-4 文件系统变更后的实时同步

任务：

- 所有这些动作后都强制走同一套刷新链路：
  - 绑定项目
  - 解绑项目
  - 重命名文件
  - 删除文件
  - 移动文件
  - 新建目录
  - 重命名目录
  - 删除目录
- 统一原生层返回最新快照或最新局部结果
- 前端不要再用“猜测式 patch”

涉及模块：

- `src-tauri/src/library.rs`
- `src/adapters/desktopBridge.ts`
- `src/store/useAssetConsoleStore.ts`

验收：

- 所有操作完成后无需手动刷新
- 页面状态和真实磁盘保持一致

### P0-5 错误反馈标准化

任务：

- 替换模糊错误文案
- 明确区分：
  - 文件不存在
  - 路径冲突
  - 权限不足
  - 目标目录不可写
  - 原生拖拽启动失败
  - 外部软件未接收

涉及模块：

- `src-tauri/src/library.rs`
- `src/store/useAssetConsoleStore.ts`
- `src/components/common/*`

验收：

- 不再出现和真实问题无关的报错，例如“网络问题”

---

## 3. P1 核心差异化

目标：

- 它开始不像资源管理器，而像设计资产工具
- 预览更强
- 外部调用更顺
- 导入整理更流畅

### P1-1 外部拖出工作流

任务：

- 固化 Inspector 的原生拖出
- 评估是否让文件区卡片也支持同一套原生拖出
- 验证目标软件：
  - Rhino
  - Blender
  - Figma
  - KeyShot
  - Windows 桌面

涉及模块：

- `src/components/preview/AssetDetailDrawer.tsx`
- `src/pages/ProjectWorkspacePage.tsx`
- `src/adapters/desktopBridge.ts`
- `src-tauri/src/library.rs`

验收：

- 文件可从 FluxMint 直接拖到桌面和外部软件
- 不再走浏览器下载语义

### P1-2 混合预览链路增强

任务：

- 图片：稳定缩略图 + 大图预览
- PDF：稳定内嵌阅读
- 视频：稳定播放 + 错误回退
- 3DM：稳定 in-app 预览
- BIP/KSP：优先原生缩略图提取
- 不可实时渲染的格式：统一回退卡片，但信息明确

涉及模块：

- `src/components/preview/*`
- `src/utils/assetPresentation.ts`
- `src-tauri/src/library.rs`

验收：

- 主要设计资产在 Inspector 内都“可看、可识别、可调用”

### P1-3 导入整理三模式打磨

任务：

- 自动分配
- 手动分配
- 当前项目分配

每种模式都补齐：

- 目标目录确认
- 冲突处理
- 失败回退
- 成功反馈

涉及模块：

- `src/store/useAssetConsoleStore.ts`
- `src/components/import/*`
- `src-tauri/src/library.rs`

验收：

- 三种模式都能稳定完成真实文件移动
- 用户始终知道文件最终会去哪里

### P1-4 文件监控与自动刷新

任务：

- 打通 watcher 和前端刷新链路
- 支持外部新增、删除、改名后的自动同步
- 明确哪些事件做增量刷新，哪些事件做整项目重扫

涉及模块：

- `src-tauri/src/library.rs`
- `src/adapters/desktopBridge.ts`
- `src/store/useAssetConsoleStore.ts`

验收：

- 在资源管理器或外部软件里改文件，FluxMint 会自动回正

---

## 4. P2 成品化与效率增强

目标：

- 用户愿意每天打开
- 高频动作更快
- 视觉和交互更像专业桌面软件

### P2-1 导入冲突处理

任务：

- 同名冲突面板
- `跳过 / 保留两份 / 替换`
- 显示差异信息：大小、时间、路径

### P2-2 重复文件检测

任务：

- 基于指纹检测完全重复
- 基于文件名规则检测高相似项
- 在项目页与总览页展示重复提醒

### P2-3 最近目录 / 收藏目录

任务：

- 最近目标目录快速入口
- 收藏目录快速入口
- 导入和移动操作共享这套入口

### P2-4 批量操作

任务：

- 批量移动
- 批量删除
- 批量重命名
- 批量加标签

### P2-5 操作历史 / 撤销

任务：

- 统一操作流记录
- 支持导入、移动、重命名、删除的撤销
- 清晰标记哪些操作可逆

### P2-6 回收站 / 安全删除

任务：

- 项目级回收站视图
- 恢复入口
- 清空入口
- 删除确认文案和恢复提示统一

### P2-7 强搜索和筛选

任务：

- 按文件名搜索
- 按标签搜索
- 按项目搜索
- 按格式搜索
- 按修改时间筛选
- 按是否重复筛选

### P2-8 UI/UX 成品化

任务：

- 顶栏进一步压缩成真正工具条
- 目录树层级更清楚
- 文件区成为唯一主舞台
- Inspector 更聚焦
- 深浅色 / 中英文 / 空状态 / 错误提示统一

涉及模块：

- `src/components/layout/*`
- `src/components/workspace/*`
- `src/components/preview/*`
- `src/pages/*`
- `src/styles/global.css`

---

## 5. 建议任务拆分方式

建议按 4 个并行工作包推进：

### 工作包 A：原生文件引擎

范围：

- 索引一致性
- 文件移动
- 删除 / 回收站
- watcher
- 原生拖出

### 工作包 B：桥接层

范围：

- `desktopBridge.ts`
- 拖拽桥接
- 错误映射
- 原生命令封装

### 工作包 C：项目页主工作区

范围：

- 目录树
- 文件区
- 内部拖动移动
- 外部拖出入口
- Inspector 联动

### 工作包 D：导入与效率功能

范围：

- 导入三模式
- 冲突处理
- 最近目录 / 收藏目录
- 重复检测
- 历史 / 撤销

---

## 6. 里程碑建议

### 里程碑 M1：可信

完成标准：

- P0 全部完成

产品状态：

- 能稳定用，不会轻易失真

### 里程碑 M2：有差异化

完成标准：

- P1 全部完成

产品状态：

- 开始明显区别于 Windows 资源管理器

### 里程碑 M3：愿意日用

完成标准：

- P2 的高频效率动作和 UI/UX 成品化完成

产品状态：

- 用户愿意长期把它作为设计资产工作台使用

---

## 7. 当前最推荐的下一步

如果只选一项继续做，优先级应是：

1. `P0-3 软件内拖动移动文件恢复并稳定`
2. `P0-4 文件系统变更后的实时同步`
3. `P1-1 外部拖出工作流完整验证`

原因很直接：

- 这是最常用的高频动作
- 这一层不稳，后面所有高级能力都会显得不可信
