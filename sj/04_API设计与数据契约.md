# API设计与数据契约

## 1. API 总原则

- 全部返回 JSON，下载接口除外
- 除登录和状态接口外，其余接口默认要求已认证会话
- 所有文件路径参数必须是相对路径
- 所有危险操作由后端最终校验
- 统一错误码和错误消息格式

统一响应建议：

成功：

```json
{
  "ok": true,
  "data": {}
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "NAME_CONFLICT",
    "message": "存在同名文件，操作未执行"
  }
}
```

## 2. 数据模型建议

### 2.1 服务状态

```json
{
  "serverEnabled": true,
  "workspaceName": "示例目录",
  "authMode": "one_time_code",
  "hasCode": true,
  "addresses": [
    "http://192.168.1.23:38421"
  ],
  "devices": [
    {
      "id": "dev_xxx",
      "ip": "192.168.1.88",
      "label": "Mobile Safari on iPhone",
      "firstSeenAt": "2026-05-07T17:00:00+08:00",
      "lastSeenAt": "2026-05-07T17:08:12+08:00",
      "online": true
    }
  ],
  "sessionAuthed": false
}
```

### 2.2 文件项

```json
{
  "name": "readme.md",
  "relativePath": "docs/readme.md",
  "kind": "file",
  "size": 10240,
  "modifiedAt": "2026-05-07T16:42:00+08:00",
  "previewable": true
}
```

### 2.3 目录项

```json
{
  "name": "docs",
  "relativePath": "docs",
  "kind": "dir",
  "size": null,
  "modifiedAt": "2026-05-07T15:22:00+08:00",
  "previewable": false
}
```

## 3. GET /api/status

### 目的

获取服务状态、当前工作目录名称、地址列表和设备列表。

### 是否需要认证

不强制。

### 响应重点

- 不返回绝对路径
- 返回工作目录显示名即可
- 返回是否已设置连接码
- 返回当前地址和设备

## 4. POST /api/auth

### 请求体

```json
{
  "code": "824615"
}
```

### 成功响应

```json
{
  "ok": true,
  "data": {
    "expiresAt": "2026-05-07T23:59:59+08:00"
  }
}
```

### 失败错误码

- `INVALID_CODE`
- `CODE_EXPIRED`

### 附加要求

- 成功后设置 Cookie 会话
- Cookie 推荐 `HttpOnly`

## 5. GET /api/files?path=

### 目的

获取某个相对目录下的子目录和文件列表。

### 查询参数

- `path`：相对目录路径，根目录时可为空字符串

### 成功响应

```json
{
  "ok": true,
  "data": {
    "currentPath": "docs",
    "parentPath": "",
    "items": []
  }
}
```

### 失败错误码

- `PATH_FORBIDDEN`
- `NOT_FOUND`
- `NOT_A_DIRECTORY`

## 6. GET /api/search?q=

### 目的

在整个工作目录内按文件名搜索。

### 查询参数

- `q`：搜索关键词

### 搜索范围

- 文件
- 文件夹

### 搜索限制

- 首版只做名称匹配
- 不做全文索引
- 建议返回数量上限，例如 200 条

### 返回结构

```json
{
  "ok": true,
  "data": {
    "query": "read",
    "items": []
  }
}
```

## 7. GET /api/preview?path=

### 目的

根据文件类型返回预览结果。

### 返回类型建议

图片或 PDF：

```json
{
  "ok": true,
  "data": {
    "kind": "url",
    "previewUrl": "/api/download?path=docs/sample.pdf&inline=1",
    "contentType": "application/pdf"
  }
}
```

文本：

```json
{
  "ok": true,
  "data": {
    "kind": "text",
    "content": "hello",
    "truncated": false
  }
}
```

文本过大：

```json
{
  "ok": true,
  "data": {
    "kind": "too_large",
    "message": "文本文件超过 2MB，不支持直接预览"
  }
}
```

不支持：

```json
{
  "ok": true,
  "data": {
    "kind": "unsupported",
    "message": "该文件类型暂不支持手机预览，请下载或在电脑端打开。"
  }
}
```

### 失败错误码

- `PATH_FORBIDDEN`
- `NOT_FOUND`
- `NOT_A_FILE`

## 8. POST /api/upload

### 目的

上传单文件到指定相对目录。

### 请求方式

- `multipart/form-data`

### 表单字段

- `path`：目标目录相对路径
- `file`：上传文件

### 成功响应

```json
{
  "ok": true,
  "data": {
    "name": "sample.png",
    "relativePath": "images/sample.png"
  }
}
```

### 失败错误码

- `PATH_FORBIDDEN`
- `NOT_FOUND`
- `NOT_A_DIRECTORY`
- `NAME_CONFLICT`
- `FILE_TOO_LARGE`
- `INVALID_UPLOAD`

### 上传要求

- 同名不覆盖
- 单文件上传
- 200MB 上限
- 上传后不自动执行

## 9. GET /api/download?path=

### 目的

下载原始文件。

### 查询参数

- `path`：文件相对路径
- `inline`：可选，`1` 时允许浏览器原生内联预览

### 响应要求

- 返回文件流
- 设置 `Content-Type`
- 设置 `Content-Length`
- 默认使用 `attachment`

### 失败错误码

- `PATH_FORBIDDEN`
- `NOT_FOUND`
- `NOT_A_FILE`

## 10. POST /api/rename

### 请求体

```json
{
  "path": "docs/readme.md",
  "newName": "guide.md"
}
```

### 成功响应

```json
{
  "ok": true,
  "data": {
    "oldPath": "docs/readme.md",
    "newPath": "docs/guide.md",
    "name": "guide.md"
  }
}
```

### 失败错误码

- `PATH_FORBIDDEN`
- `NOT_FOUND`
- `INVALID_NAME`
- `NAME_CONFLICT`

### 名称校验规则

- 不允许为空
- 不允许包含 `/`
- 不允许包含 `\`
- 不允许包含 `..`
- 不允许是保留设备名
- 不允许包含系统非法字符

## 11. 建议补充接口

虽然你当前列出的接口已经够第一版，但从桌面端控制角度，建议额外准备桌面内部调用接口：

- `POST /internal/lan/start`
- `POST /internal/lan/stop`
- `POST /internal/lan/regenerate-code`

说明：

- 这些接口不需要对手机端开放
- 可作为 Tauri 内部状态管理入口

## 12. 错误码建议清单

- `UNAUTHORIZED`
- `INVALID_CODE`
- `CODE_EXPIRED`
- `PATH_FORBIDDEN`
- `NOT_FOUND`
- `NOT_A_FILE`
- `NOT_A_DIRECTORY`
- `INVALID_NAME`
- `NAME_CONFLICT`
- `FILE_TOO_LARGE`
- `INVALID_UPLOAD`
- `UNSUPPORTED_PREVIEW`
- `TEXT_PREVIEW_TOO_LARGE`
- `INTERNAL_ERROR`
