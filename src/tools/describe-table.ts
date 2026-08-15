// describe_table 工具：查看指定表的字段结构与表注释
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config';
import { toMarkdownTable } from '../format';
import { log } from '../logger';
import { PoolManager } from '../pool-manager';
import { errorResult, textResult } from './common';

/** 表名字符校验：禁止空白、分号、引号、反引号等可能破坏 SQL 的字符 */
const TABLE_NAME_PATTERN = /^[^\s;`'"\\]+$/;

/** 注册 describe_table 工具：SHOW FULL COLUMNS + information_schema 表注释 */
export function registerDescribeTableTool(
  server: McpServer,
  deps: { config: AppConfig; pools: PoolManager },
): void {
  server.registerTool(
    'describe_table',
    {
      title: '查看表结构',
      description: '查看指定表的字段结构（字段名、类型、Null、键、默认值、Extra、注释）与表注释。',
      inputSchema: {
        table: z.string().min(1).describe('表名'),
        connection: z.string().optional().describe('配置中的连接名；仅配置了一个连接时可省略'),
      },
      outputSchema: {
        table: z.string(),
        columns: z.array(z.record(z.string(), z.unknown())),
      },
    },
    async ({ table, connection }) => {
      const start = Date.now();
      let connName = '';
      try {
        connName = deps.pools.resolveConnection(connection);
      } catch (e) {
        return errorResult((e as Error).message);
      }
      if (!TABLE_NAME_PATTERN.test(table)) {
        log('warn', `tool=describe_table connection=${connName} rejected=表名含非法字符 table="${table}"`);
        return errorResult('表名包含非法字符，已拒绝');
      }
      try {
        // SQL 由本工具内部构造，表名已做字符白名单校验，无需过 sql-guard
        const columns = await deps.pools.query(connName, `SHOW FULL COLUMNS FROM \`${table}\``);
        const commentRows = await deps.pools.query(
          connName,
          'SELECT TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
          [table],
        );
        const comment = commentRows[0]?.TABLE_COMMENT as string | undefined;
        log('info', `tool=describe_table connection=${connName} table=${table} columns=${columns.length} cost=${Date.now() - start}ms`);
        let text = `## 表结构：${table}`;
        if (comment) text += `\n\n表注释：${comment}`;
        text += `\n\n${toMarkdownTable(columns)}`;
        return textResult(text, { table, columns });
      } catch (e) {
        log('error', `tool=describe_table connection=${connName} table=${table} error="${(e as Error).message}"`);
        return errorResult(PoolManager.describeError(e));
      }
    },
  );
}
