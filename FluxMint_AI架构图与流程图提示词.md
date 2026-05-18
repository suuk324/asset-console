# FluxMint AI 架构图与流程图提示词

## 1. 使用说明

这份文档用于喂给设计 AI、架构 AI 或流程图生成工具。

目标不是写代码，而是生成：

- 架构图
- 模块关系图
- 用户流程图
- 导入流程图
- 拖拽调用流程图
- 原生与前端边界图

建议你直接复制某一段提示词单独生成，不要一次把所有图混在一起。

---

## 2. 全局产品描述提示词

```md
请为一个名为 FluxMint 的本地设计资产管理软件生成产品架构图和交互流程图。

产品定位：
- 面向设计专业人士的本地资产工作台
- 主要管理图片、PDF、视频、3DM、BIP、KSP 等设计资产
- 核心价值不是替代 Windows 资源管理器，而是提供更适合“项目制设计资产管理”的工作流

产品目标：
- 按项目和目录管理真实本地文件
- 支持强预览
- 支持拖入整理
- 支持从软件内直接拖到 Rhino、Blender、Figma、KeyShot、Windows 桌面
- 支持真实文件移动、重命名、删除、回收站、操作历史、撤销

技术路线：
- 前端：React + TypeScript + CSS Modules + Zustand
- 桌面层：Tauri 2
- 原生引擎：Rust
- 平台重点：Windows 桌面文件工作流

请输出的图要符合以下气质：
- 专业桌面软件
- 结构克制
- 信息分层清晰
- 不是网页后台风格
- 使用简洁的技术架构表达
```

---

## 3. 技术架构图提示词

```md
请为 FluxMint 生成一张技术架构图，重点表达“原生文件引擎 + Web 工作台”的分层结构。

请将架构分成 4 层：

1. 表现层（Web Workspace）
- TopBar
- Sidebar
- Folder Tree
- Asset Grid / List
- Inspector
- Import Panel
- Rules Panel
- Settings Panel

2. 前端状态与适配层
- Zustand Store
- Selectors
- desktopBridge.ts
- assetTransfer.ts
- i18n / Theme

3. Tauri Bridge Layer
- invoke commands
- drag/drop bridge
- native preview bridge
- file watcher events

4. Native File Engine（Rust）
- project indexing
- folder scanning
- import / move / rename / delete
- recycle bin
- operation history / undo
- duplicate detection
- native preview extraction
- native file drag out
- file system watcher

请强调：
- 前端只负责 UI、交互编排、状态呈现
- 原生层负责真实文件操作和系统级能力
- 桥接层负责隔离 Web 语义与桌面语义

输出风格：
- 适合产品技术方案展示
- 框图清晰，箭头明确
- 每一层的职责简短标注
```

---

## 4. 技术边界图提示词

```md
请生成一张“FluxMint 技术边界图”，重点说明哪些能力属于前端，哪些能力必须由原生层负责。

请把系统分成 3 个区域：

A. Web UI 区域
- 页面布局
- 目录树展示
- 文件网格展示
- Inspector 展示
- 搜索、筛选、排序
- 空状态、错误提示、拖拽视觉反馈
- 中英文和深浅色模式

B. Bridge Adapter 区域
- desktopBridge.ts
- assetTransfer.ts
- Tauri commands
- native preview resolve
- native drag bridge
- watcher event subscription

C. Native Engine 区域
- real file move
- rename
- delete
- recycle bin
- restore
- project binding
- project unbinding
- drag file to desktop
- drag file to external design tools
- watcher
- duplicate detection
- native thumbnail extraction

请在图中明确表达：
- Web 不能伪造系统级文件行为
- Bridge 负责把前端动作翻译成桌面命令
- Native Engine 是单一事实源
```

---

## 5. 项目页工作台结构图提示词

```md
请为 FluxMint 生成一张“项目页工作台结构图”。

界面结构固定为：
- 顶部单行轻工具条
- 左侧目录树导航
- 中间文件主工作区
- 右侧 Inspector

请强调以下设计原则：
- 中间文件区是主舞台，视觉最强、占宽最大
- 左侧目录区负责导航，不是内容卡列表
- 右侧 Inspector 负责理解和调用当前文件，不是第三内容列
- 顶栏是工具条，不是内容 Hero

请标注主要交互：
- 点击目录切换当前文件夹
- 文件多选
- 文件内部拖动移动到目录树
- 文件拖到外部软件
- Inspector 预览和元数据查看
- 打开文件、显示位置、重命名、删除

输出风格：
- 专业桌面软件工作台结构图
- 适合 UI/UX 重构说明
```

---

## 6. 导入流程图提示词

```md
请为 FluxMint 生成一张“文件导入流程图”，表达真实本地文件导入逻辑。

导入入口包括：
- 拖入文件
- 选择文件导入

导入模式包括 3 种：
- 自动分配
- 手动分配
- 当前项目分配

流程节点请包含：
- 接收文件路径
- 识别文件类型
- 判断当前导入模式
- 匹配项目与目标目录
- 检查是否命中规则
- 检查是否存在冲突
- 显示导入建议 / 手动分配面板
- 用户确认目标位置
- 执行真实文件移动
- 写入索引
- 记录历史
- 触发界面刷新

异常分支请包含：
- 未命中规则
- 多规则冲突
- 目标目录不存在
- 同名冲突
- 跨盘移动失败
- 删除源文件失败

输出要求：
- 逻辑必须像桌面软件，不是演示型假流程
- 清楚区分系统建议和用户最终确认
```

---

## 7. 外部拖出流程图提示词

```md
请为 FluxMint 生成一张“从软件内拖出文件到外部应用”的流程图。

目标场景：
- 从 Inspector 拖到 Rhino
- 从 Inspector 拖到 Blender
- 从 Inspector 拖到 KeyShot
- 从 Inspector 拖到 Figma
- 从 Inspector 拖到 Windows 桌面

请明确区分两种技术路径：

1. 错误路径（应废弃）
- HTML5 drag
- DownloadURL
- browser-like payload
- 导致下载气泡或外部目标不识别

2. 正确路径（应采用）
- pointer drag start
- native bridge invoke
- Windows native file drag
- external app receives real file path

请在流程图里强调：
- 浏览器语义不能替代桌面文件语义
- 原生拖出才是系统级工作流
- 外部目标接收的是“真实文件”，不是下载链接
```

---

## 8. 文件一致性流程图提示词

```md
请为 FluxMint 生成一张“文件变更后索引与界面同步流程图”。

要覆盖的操作包括：
- 绑定项目文件夹
- 解绑项目文件夹
- 文件移动
- 文件重命名
- 文件删除
- 文件恢复
- 新建目录
- 删除目录
- 重命名目录

流程请表达：
- 用户发起操作
- 前端调用 bridge
- bridge 调用 native command
- Rust 执行真实磁盘操作
- Rust 更新 workspace index
- Rust 发送 workspace changed 事件或返回最新数据
- 前端 store 更新
- 页面重新渲染

请特别强调：
- 原生层是单一事实源
- 前端不应使用猜测式 patch 作为最终结果
- 界面状态必须和真实文件系统一致
```

---

## 9. 预览能力架构图提示词

```md
请为 FluxMint 生成一张“混合预览能力架构图”。

文件类型包括：
- 图片
- PDF
- 视频
- 3DM
- BIP
- KSP

请把预览能力分成两类：

A. 前端直接展示型
- 图片：直接显示
- PDF：内嵌阅读
- 视频：内嵌播放
- 3DM：前端渲染或轻交互展示

B. 原生提取再展示型
- BIP：优先读取系统或原生缩略图
- KSP：优先读取系统或原生缩略图
- 不支持实时渲染的格式：原生提取缩略图，前端展示卡片

请表达：
- 为什么某些格式必须依赖原生层
- 为什么前端只负责展示而不是解析专有格式
- 预览失败时如何回退到稳定格式卡片
```

---

## 10. UI/UX 信息层级图提示词

```md
请为 FluxMint 生成一张 UI/UX 信息层级图，表达这是一个专业桌面软件工作台，而不是网页后台。

请把界面层级分成：

- L0 页面背景
- L1 框架层：顶栏、左导航
- L2 工作层：目录区、文件区、规则编辑区、设置表单
- L3 焦点层：Inspector、导入面板、右键菜单、toast

请强调：
- 顶栏最轻
- 左侧次轻
- 中间文件区最强，是唯一主舞台
- 右侧 Inspector 是焦点检查器，但不应抢过文件区

输出风格：
- 专业
- 极简
- 中性
- 自动适配浅色 / 深色模式
```

---

## 11. 给支持 Mermaid 的 AI 的附加要求

如果目标 AI 支持 Mermaid，请附加这段要求：

```md
如果可以，请优先输出 Mermaid 图。

要求：
- 节点文案简洁
- 中英文混排时优先用中文
- 箭头方向清楚
- 不要生成过度复杂的大图，优先拆成多张小图
- 对于流程图，分出正常路径和异常路径
```

---

## 12. 最推荐先生成的 3 张图

如果你只打算先做 3 张图，建议顺序是：

1. 技术架构图
2. 导入流程图
3. 外部拖出流程图

原因：

- 这 3 张图最能解释 FluxMint 和普通文件管理器的差别
- 也最能暴露当前需要继续原生化的部分
