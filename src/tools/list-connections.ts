// list_connections 工具：列出所有配置的 MySQL 命名连接并探测连通性
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config';
import { toMarkdownTable } from '../format';
import { log } from '../logger';
import type { PoolManager } from '../pool-manager';
import { textResult } from './common';

/** 注册 list_connections 工具：输出连接清单表格（名称、地址、连通状态） */
export function registerListConnectionsTool(
  server: McpServer,
  deps: { config: AppConfig; pools: PoolManager },
): void {
  server.registerTool(
    'list_connections',
    {
      title: '列出数据库连接',
      description:
        '列出配置的所有 MySQL 命名连接（连接名、地址、数据库）并探测连通性。多库场景下请先用本工具确认可用的 connection 名称。',
      inputSchema: {},
      outputSchema: {
        connections: z.array(z.record(z.string(), z.unknown())),
      },
    },
    async () => {
      const rows: Record<string, unknown>[] = [];
      for (const [name, c] of Object.entries(deps.config.connections)) {
        const ping = await deps.pools.ping(name);
        rows.push({
          '连接名': name,
          '地址': `${c.host}:${c.port}`,
          '数据库': c.database,
          '状态': ping.ok ? '可用' : `不可用：${ping.error}`,
        });
      }
      log('info', `tool=list_connections count=${rows.length}`);
      return textResult(toMarkdownTable(rows), { connections: rows });
    },
  );
}
