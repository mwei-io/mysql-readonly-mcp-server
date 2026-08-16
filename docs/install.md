# 安装

> 📖 本文档介绍 mysql-readonly-mcp-server 的两种安装与运行方式。配置项详见 [配置方式](./configuration.md)，项目介绍见 [README](../README.md)。

## 目录

- [方式 A：npx 直接运行（推荐）](#方式-anpx-直接运行推荐)
- [方式 B：源码构建](#方式-b源码构建)

---

## 方式 A：npx 直接运行（推荐）

无需克隆代码、无需手动安装依赖，适合绝大多数用户。

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18 | 运行 MCP Server 本体 |
| npm / npx | 随 Node.js 自带 | 用于拉取并运行 npm 包 |

### 一键启动命令

```bash
npx -y mysql-readonly-mcp-server
```

> 💡 该命令以 **stdio 传输协议** 启动 Server，进程会阻塞等待 MCP 客户端输入，这是正常的设计行为——它通常不由人工在终端直接运行，而是由 MCP 客户端（如 Qoder、ChatGPT、Claude Desktop）按配置自动拉起。


### 完整示例

在 MCP 客户端的 `mcpServers` 配置中直接使用 npx（连接信息全部写在 `env`，详见 [环境变量方式](./configuration.md#方式一环境变量方式推荐)）：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp-server"],
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "db"
      }
    }
  }
}
```

---

## 方式 B：源码构建

适合需要二次开发、调试源码或使用未发布版本的场景。

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18 | 部分构建依赖建议 >= 20 |
| npm | 随 Node.js 自带 | 安装依赖与执行构建脚本 |
| Git | 任意较新版本 | 克隆仓库 |

### 完整步骤

```powershell
# 1. 克隆仓库并进入项目目录
git clone https://github.com/mwei/mysql-readonly-mcp-server.git
cd mysql-readonly-mcp-server

# 2. 安装依赖（含构建工具 tsup / typescript）
npm install

# 3. 编译构建（生成 dist/ 目录，入口为 dist/index.js）
npm run build
```

### 本地测试

构建完成后，可先在终端做一次冒烟验证（进程启动后会阻塞等待 stdio 输入，无报错即代表配置与启动正常，`Ctrl+C` 退出）：

```powershell
node dist/index.js --host 127.0.0.1 --user readonly_user --password your_password --database db
```

随后在 MCP 客户端中用 `node` + `dist/index.js` 绝对路径接入：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "node",
      "args": [
        "C:/path/to/mysql-readonly-mcp-server/dist/index.js",
        "--host", "127.0.0.1",
        "--user", "readonly_user",
        "--password", "your_password",
        "--database", "db"
      ]
    }
  }
}
```

> 💡 源码构建版本同样支持全部三种配置方式（环境变量 / 命令行参数 / 配置文件），详见 [配置方式](./configuration.md)。

---

📚 **下一篇**：[配置方式](./configuration.md) · **返回**：[README](../README.md)
