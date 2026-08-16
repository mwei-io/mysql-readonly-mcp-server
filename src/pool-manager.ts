// 多库连接池管理：按连接名懒加载 mysql2 连接池，支持同一 IP 下多个数据库并发查询
import mysql from 'mysql2/promise';
import type { AppConfig } from './config';

export class PoolManager {
  /** 已创建的连接池缓存（连接名 → 池） */
  private pools = new Map<string, mysql.Pool>();

  constructor(private readonly config: AppConfig) {}

  /** 解析目标连接名：仅一个连接时可省略；非法名抛出含可用列表的中文错误 */
  resolveConnection(name?: string): string {
    const names = Object.keys(this.config.connections);
    if (!name) {
      if (names.length === 1) return names[0];
      throw new Error(`存在多个连接，必须指定 connection 参数。可用连接：${names.join(', ')}`);
    }
    if (!this.config.connections[name]) {
      throw new Error(`连接 "${name}" 不存在。可用连接：${names.join(', ')}`);
    }
    return name;
  }

  /** 获取指定连接的连接池（首次调用时懒创建，connectionLimit=2） */
  getPool(name: string): mysql.Pool {
    let pool = this.pools.get(name);
    if (!pool) {
      const c = this.config.connections[name];
      pool = mysql.createPool({
        host: c.host,
        port: c.port,
        user: c.user,
        password: c.password,
        database: c.database,
        connectionLimit: 2,
        connectTimeout: 10000,
        enableKeepAlive: true,
        // 只读安全底线：协议层禁止多语句执行，防止分号拼接堆叠写操作
        multipleStatements: false,
      });
      this.pools.set(name, pool);
    }
    return pool;
  }

  /** 在指定连接上执行 SQL 并返回行数组（可选参数化占位符） */
  async query(name: string, sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    const [rows] = await this.getPool(name).query(sql, params);
    return (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
  }

  /** 探测指定连接的连通性，返回结果与中文错误说明 */
  async ping(name: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.query(name, 'SELECT 1');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: PoolManager.describeError(e) };
    }
  }

  /** 将底层连接错误转换为可操作的中文提示 */
  static describeError(e: unknown): string {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'ECONNREFUSED') return '连接被拒绝：请检查 host 与端口是否正确、MySQL 服务是否已启动';
    if (err?.code === 'ER_ACCESS_DENIED_ERROR') return '认证失败：请检查用户名/密码，以及该账号是否允许从当前主机连接';
    if (err?.code === 'ETIMEDOUT' || err?.code === 'PROTOCOL_CONNECTION_LOST') return '连接超时或中断：请检查网络连通性与防火墙设置';
    if (err?.code === 'ER_BAD_DB_ERROR') return '数据库不存在：请检查配置中的 database 名称';
    return `查询失败：${err?.message ?? String(e)}`;
  }

  /** 关闭全部连接池（进程退出时调用） */
  async closeAll(): Promise<void> {
    for (const pool of this.pools.values()) await pool.end();
    this.pools.clear();
  }
}
