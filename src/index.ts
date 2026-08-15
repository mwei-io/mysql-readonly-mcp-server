// 入口：加载配置、初始化日志、注册四个工具并以 stdio 传输启动 MCP Server
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, resolveConfigPath } from './config';
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

/** 主流程：解析配置路径 → 加载校验配置 → 初始化日志 → 注册工具 → 连接 stdio 传输 */
async function main(): Promise<void> {
  const configPath = resolveConfigPath(process.argv.slice(2), process.env);
  if (!configPath) {
    fatal('未指定配置文件。用法：mysql-readonly-mcp --config <path/to/config.json>，或设置环境变量 MYSQL_MCP_CONFIG');
  }
  let config;
  try {
    config = loadConfig(configPath);
  } catch (e) {
    fatal(`配置加载失败：${(e as Error).message}`);
  }
  initLogger(config.log);
  log('info', `mysql-readonly-mcp 启动，配置文件：${configPath}，连接数：${Object.keys(config.connections).length}`);

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
