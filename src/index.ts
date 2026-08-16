// 入口：加载配置、初始化日志、注册四个工具并以 stdio 传输启动 MCP Server
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, resolveConfigPath, parseMcpArgs, generateConfigFromMcpArgs, hasConnectionArgs, hasEnvConfig, loadConfigFromEnv, applyGlobalArgOverrides, type AppConfig } from './config';
import { initLogger, log } from './logger';
import { PoolManager } from './pool-manager';
import { registerDescribeTableTool } from './tools/describe-table';
import { registerListConnectionsTool } from './tools/list-connections';
import { registerListTablesTool } from './tools/list-tables';
import { registerQueryTool } from './tools/query';

/** 启动失败时的统一退出处理（stdout 只走协议消息，错误一律写 stderr） */
function fatal(message: string): never {
  process.stderr.write(`[mysql-readonly-mcp] ${message}\n`);
  process.exit(1);
}

/** 
 * 主流程：支持三种方式启动（优先级从高到低）：
 * 1. 命令行参数方式：单库 --host/--user/--database；同服务器多库重复 --database；异构多库重复 --conn JSON
 * 2. 环境变量方式（推荐）：MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE（逗号分隔多库）
 * 3. 配置文件方式：--config path/to/config.json 或 MYSQL_MCP_CONFIG 环境变量
 */
async function main(): Promise<void> {
  // 首先解析命令行参数
  let mcpArgs;
  try {
    mcpArgs = parseMcpArgs(process.argv.slice(2));
  } catch (e) {
    fatal(`参数解析失败：${(e as Error).message}`);
  }
  let config: AppConfig;
  let source: string;

  if (hasConnectionArgs(mcpArgs)) {
    // 方式 1：使用命令行参数直接配置（支持单库/多库，优先级最高）
    try {
      config = generateConfigFromMcpArgs(mcpArgs, process.env);
    } catch (e) {
      fatal(`命令行参数配置失败：${(e as Error).message}`);
    }
    source = '命令行参数';
  } else if (hasEnvConfig(process.env)) {
    // 方式 2：环境变量方式（MYSQL_HOST/MYSQL_DATABASE 等，支持逗号分隔多库）；
    // 命令行全局参数（--max-limit / --log-*）可叠加覆盖
    try {
      config = applyGlobalArgOverrides(loadConfigFromEnv(process.env), mcpArgs);
    } catch (e) {
      fatal(`环境变量配置失败：${(e as Error).message}`);
    }
    source = '环境变量';
  } else {
    // 方式 3：使用配置文件
    const configPath = resolveConfigPath(process.argv.slice(2), process.env);
    if (!configPath) {
      fatal('用法错误！\n请选择以下方式之一：\n方式 1（环境变量，推荐）：设置 MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE（逗号分隔可多库）\n方式 2（命令行参数）：node index.js --host <host> --user <user> --password <pwd> --database <db>，或重复 --database / --conn <JSON>\n方式 3（配置文件）：node index.js --config <path/to/config.json>');
    }
    try {
      // 命令行全局参数（--max-limit / --log-*）可叠加覆盖配置文件
      config = applyGlobalArgOverrides(loadConfig(configPath, process.env), mcpArgs);
    } catch (e) {
      fatal(`配置加载失败：${(e as Error).message}`);
    }
    source = `配置文件：${configPath}`;
  }
  initLogger(config.log);
  log('info', `mysql-readonly-mcp 启动，配置来源：${source}，连接数：${Object.keys(config.connections).length}`);

  const pools = new PoolManager(config);
  const deps = { config, pools };
  const server = new McpServer({ name: 'mysql-readonly-mcp', version: '1.0.0' });
  registerListConnectionsTool(server, deps);
  registerQueryTool(server, deps);
  registerDescribeTableTool(server, deps);
  registerListTablesTool(server, deps);

  // 优雅退出：收到信号时关闭所有连接池
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      log('info', `收到 ${signal}，关闭连接池并退出`);
      await pools.closeAll();
      process.exit(0);
    });
  }

  await server.connect(new StdioServerTransport());
  log('info', 'stdio 传输已就绪');
}

main().catch((e) => fatal(`启动失败：${(e as Error).message}`));
