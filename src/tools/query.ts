// query 工具：执行只读 SQL（SELECT/SHOW/DESCRIBE/EXPLAIN）并返回 Markdown 表格结果
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config';
import { renderQueryResult } from '../format';
import { applyLimit } from '../limit';
import { log, truncateSql } from '../logger';
import { PoolManager } from '../pool-manager';
import { checkReadOnly } from '../sql-guard';
import { errorResult, textResult } from './common';

/** 注册 query 工具：白名单校验 → LIMIT 处理 → 执行 → Markdown 渲染 */
export function registerQueryTool(
  server: McpServer,
  deps: { config: AppConfig; pools: PoolManager },
): void {
  server.registerTool(
    'query',
    {
      title: '执行只读 SQL 查询',
      description:
        '在指定 MySQL 连接上执行只读 SQL（SELECT / SHOW / DESCRIBE / EXPLAIN），返回 Markdown 表格。写操作（INSERT/UPDATE/DELETE/DDL）会被拒绝。未带 LIMIT 的 SELECT 会自动附加默认行数限制。',
      inputSchema: {
        sql: z.string().min(1).describe('只读 SQL 语句（仅支持单条）'),
        connection: z.string().optional().describe('配置中的连接名；仅配置了一个连接时可省略'),
        limit: z.number().int().min(1).optional().describe('期望返回的最大行数（不超过配置的 maxLimit）'),
      },
      outputSchema: {
        rowCount: z.number(),
        rows: z.array(z.record(z.string(), z.unknown())),
      },
    },
    async ({ sql, connection, limit }) => {
      const start = Date.now();
      let connName = '';
      try {
        connName = deps.pools.resolveConnection(connection);
      } catch (e) {
        log('warn', `tool=query rejected=${(e as Error).message}`);
        return errorResult((e as Error).message);
      }
      // 第一道防线：SQL 白名单校验
      const guard = checkReadOnly(sql);
      if (!guard.allowed) {
        log('warn', `tool=query connection=${connName} rejected=${guard.reason} sql="${truncateSql(sql)}"`);
        return errorResult(guard.reason ?? 'SQL 被拒绝');
      }
      // 行数限制：无 LIMIT 附加默认值，超限钳制
      const lr = applyLimit(guard.normalized!, guard.ast, {
        defaultLimit: deps.config.defaultLimit,
        maxLimit: deps.config.maxLimit,
        requested: limit,
      });
      try {
        const rows = await deps.pools.query(connName, lr.sql);
        log(
          'info',
          `tool=query connection=${connName} sql="${truncateSql(lr.sql)}" rows=${rows.length} cost=${Date.now() - start}ms`,
        );
        const notices: string[] = [];
        if (lr.notice) notices.push(lr.notice);
        if (lr.effectiveLimit !== undefined && rows.length >= lr.effectiveLimit) {
          notices.push(`已截断至 ${rows.length} 行，建议添加 WHERE 条件或缩小 LIMIT`);
        }
        return textResult(renderQueryResult(rows, notices), { rowCount: rows.length, rows });
      } catch (e) {
        log('error', `tool=query connection=${connName} error="${(e as Error).message}" sql="${truncateSql(lr.sql)}"`);
        return errorResult(PoolManager.describeError(e));
      }
    },
  );
}
