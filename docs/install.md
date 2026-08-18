# 安装

> 📖 本文档介绍 mysql-readonly-mcp-server 的三种安装与运行方式。配置项详见 [配置方式](./configuration.md)，项目介绍见 [README](../README.md)。

## 目录

- [方式 A:全局安装（推荐长期使用）](#方式-a-全局安装推荐长期使用)
- [方式 B:临时运行（适合测试或一次性使用）](#方式-b-临时运行适合测试或一次性使用)
- [方式 C:源码构建](#方式-c-源码构建)

---

## 方式 A: 全局安装（推荐长期使用）

通过 npm 全局安装本工具到系统路径，适用于大多数长期使用的场景。

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18 | 运行 MCP Server 本体 |
| npm | 随 Node.js 自带 | 用于全局安装 npm 包 |

### 安装步骤

#### 1. 全局安装

```powershell
npm install -g mysql-readonly-mcp-server
```

#### 2. MCP 客户端配置

在 MCP 客户端的 `mcpServers` 配置中直接使用已安装的命令（连接信息全部写在 `env`，详见 [环境变量方式](./configuration.md#方式一环境变量方式推荐)）：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "mysql-readonly-mcp-server",
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

> 💡 **优势**：启动更快，配置简洁，适合长期使用的生产环境。

> 💡 **关于运行的说明**：MCP Server 采用 **stdio 传输协议**，进程会阻塞等待 MCP 客户端输入，这是正常的设计行为——不由人工在终端直接运行，由 MCP 客户端按配置自动拉起。

---

## 方式 B: 临时运行（适合测试或一次性使用）

无需预先安装，每次运行时通过 npx 自动下载最新版本。

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18 | 运行 MCP Server 本体 |
| npm / npx | 随 Node.js 自带 | 用于临时运行 npm 包 |

### 安装步骤

#### 1. 临时运行命令

```powershell
npx -y mysql-readonly-mcp-server
```

#### 2. MCP 客户端配置

在 MCP 客户端的 `mcpServers` 配置中使用 `npx` 调用（连接信息全部写在 `env`）：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "npx",
      "args": [
        "-y",
        "mysql-readonly-mcp-server"
      ],
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

> 💡 **适用场景**：快速测试、临时调试、CI/CD 流程或无法进行全局安装的环境。

---

## 方式 C: 源码构建

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
