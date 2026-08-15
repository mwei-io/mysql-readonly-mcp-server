// list_tables 工具：列出当前数据库的表清单（名称、注释、估算行数），支持模糊过滤
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config';
import { toMarkdownTable } from '../format';
import { log } from '../logger';
import { PoolManager } from '../pool-manager';
import { errorResult, textResult } from './common';

/** 名称模糊匹配：无 % 和 _ 时按大小写不敏感子串匹配；否则按 LIKE 通配符匹配 */
export function matchPattern(name: string, pattern?: string): boolean {
  if (!pattern) return true;
  if (pattern.includes('%') || pattern.includes('_')) {
    const re = new RegExp(
      '^' +
        pattern
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/%/g, '.*')
          .replace(/_/g, '.') +
        '$',
      'i',
    );
    return re.test(name);
  }
  return name.toLowerCase().includes(pattern.toLowerCase());
}

/** 注册 list_tables 工具：SHOW TABLE STATUS + 名称过滤 */
export function registerListTablesTool(
  server: McpServer,
  deps: { config: AppConfig; pools: PoolManager },
): void {
  server.registerTool(
    'list_tables',
    {
      title: '列出表清单',
      description: '列出指定连接数据库中的表（表名、注释、估算行数），可按名称模糊过滤（支持 % 和 _ 通配符，或普通子串）。',
      inputSchema: {
        connection: z.string().optional().describe('配置中的连接名；仅配置了一个连接时可省略'),
        pattern: z.string().optional().describe('表名过滤模式（LIKE 风格：% 任意多字符，_ 单字符；无通配符时为子串匹配）'),
      },
      outputSchema: {
        tables: z.array(z.record(z.string(), z.unknown())),
      },
    },
    async ({ connection, pattern }) => {
      const start = Date.now();
      let connName = '';
      try {
        connName = deps.pools.resolveConnection(connection);
      } catch (e) {
        return errorResult((e as Error).message);
      }
      try {
        // SQL 由本工具内部构造，无用户输入拼接，无需过 sql-guard
        const status = await deps.pools.query(connName, 'SHOW TABLE STATUS');
        const tables = status
          .filter((r) => matchPattern(String(r.Name), pattern))
          .map((r) => ({ '表名': r.Name, '注释': r.Comment ?? '', '估算行数': r.Rows ?? 0 }))
        log('info', `tool=list_tables connection=${connName} pattern=${pattern ?? '*'} tables=${tables.length} cost=${Date.now() - start}ms`);
        return textResult(toMarkdownTable(tables), { tables });
      } catch (e) {
        log('error', `tool=list_tables connection=${connName} error="${(e as Error).message}"`);
        return errorResult(PoolManager.describeError(e));
      }
    },
  );
}
