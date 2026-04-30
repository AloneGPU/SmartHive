type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogCategory = 'database' | 'mqtt' | 'sse' | 'api' | 'auth' | 'system' | 'vision';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
  requestId?: string;
}

class Logger {
  private isProduction = process.env.NODE_ENV === 'production';
  private logLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.logLevel];
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase().padEnd(5)}]`,
      `[${entry.category.padEnd(8)}]`,
      entry.message
    ];

    if (entry.duration !== undefined) {
      parts.push(`(${entry.duration}ms)`);
    }

    if (entry.requestId) {
      parts.push(`[req:${entry.requestId}]`);
    }

    let output = parts.join(' ');

    if (entry.data && Object.keys(entry.data).length > 0) {
      output += ` | ${JSON.stringify(entry.data)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack && !this.isProduction) {
        output += `\n  ${entry.error.stack.split('\n').slice(1, 4).join('\n  ')}`;
      }
    }

    return output;
  }

  private log(entry: LogEntry) {
    if (!this.shouldLog(entry.level)) return;

    const formatted = this.formatMessage(entry);

    switch (entry.level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'debug':
        console.debug(formatted);
        break;
      default:
        console.log(formatted);
    }

    // 在生产环境中，可以将日志写入文件或发送到日志服务
    // 这里暂时只输出到控制台
  }

  debug(category: LogCategory, message: string, data?: Record<string, any>) {
    this.log({
      timestamp: this.formatTimestamp(),
      level: 'debug',
      category,
      message,
      data
    });
  }

  info(category: LogCategory, message: string, data?: Record<string, any>) {
    this.log({
      timestamp: this.formatTimestamp(),
      level: 'info',
      category,
      message,
      data
    });
  }

  warn(category: LogCategory, message: string, data?: Record<string, any>) {
    this.log({
      timestamp: this.formatTimestamp(),
      level: 'warn',
      category,
      message,
      data
    });
  }

  error(category: LogCategory, message: string, error?: Error, data?: Record<string, any>) {
    this.log({
      timestamp: this.formatTimestamp(),
      level: 'error',
      category,
      message,
      data,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }

  time(category: LogCategory, message: string, startTime: number, data?: Record<string, any>) {
    const duration = Date.now() - startTime;
    this.log({
      timestamp: this.formatTimestamp(),
      level: 'info',
      category,
      message,
      data,
      duration
    });
  }

  api(method: string, path: string, statusCode: number, duration: number, data?: Record<string, any>) {
    this.log({
      timestamp: this.formatTimestamp(),
      level: statusCode >= 400 ? 'error' : 'info',
      category: 'api',
      message: `${method} ${path} ${statusCode}`,
      data,
      duration
    });
  }

  auth(action: string, success: boolean, ip?: string, data?: Record<string, any>) {
    this.log({
      timestamp: this.formatTimestamp(),
      level: success ? 'info' : 'warn',
      category: 'auth',
      message: `Auth ${action}: ${success ? 'success' : 'failed'}`,
      data: { ip, ...data }
    });
  }
}

export const logger = new Logger();
