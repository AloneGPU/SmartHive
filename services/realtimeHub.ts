import type { Response } from 'express';

export type RealtimeEvent = {
  type: string;
  payload: any;
  ts: number;
};

type ClientInfo = {
  res: Response;
  connectedAt: number;
  lastActivity: number;
  ip: string;
};

class RealtimeHub {
  private clients = new Map<Response, ClientInfo>();
  private latestTelemetryByDevice = new Map<string, RealtimeEvent>();
  private maxClients = 100;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private clientTimeout = 120000; // 2分钟无活动则断开

  constructor() {
    this.startHeartbeat();
  }

  addClient(res: Response): boolean {
    // 检查连接数限制
    if (this.clients.size >= this.maxClients) {
      console.warn(`[RealtimeHub] 达到最大连接数限制: ${this.maxClients}`);
      res.status(503).json({ 
        error: 'Too many connections', 
        message: '服务器连接数已满，请稍后重试' 
      });
      return false;
    }

    const ip = (res.req?.ip || res.req?.socket.remoteAddress || 'unknown').toString();
    const now = Date.now();
    
    this.clients.set(res, {
      res,
      connectedAt: now,
      lastActivity: now,
      ip
    });

    console.log(`[RealtimeHub] 新连接建立: ${ip}, 当前连接数: ${this.clients.size}`);
    return true;
  }

  removeClient(res: Response) {
    const info = this.clients.get(res);
    if (info) {
      this.clients.delete(res);
      console.log(`[RealtimeHub] 连接断开: ${info.ip}, 持续时间: ${Math.round((Date.now() - info.connectedAt) / 1000)}s, 当前连接数: ${this.clients.size}`);
    }
  }

  broadcast(event: RealtimeEvent) {
    this.rememberTelemetry(event);
    const body = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    const deadClients: Response[] = [];

    for (const [res, info] of this.clients) {
      try {
        res.write(body);
        info.lastActivity = Date.now();
      } catch (error) {
        console.error(`[RealtimeHub] 发送消息失败: ${info.ip}`, error);
        deadClients.push(res);
      }
    }

    // 清理失败的连接
    deadClients.forEach(res => {
      try {
        res.end();
      } catch {}
      this.removeClient(res);
    });
  }

  latestTelemetry(deviceId?: string): RealtimeEvent | null {
    if (deviceId) {
      return this.latestTelemetryByDevice.get(deviceId) || null;
    }
    const events = Array.from(this.latestTelemetryByDevice.values())
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
    return events[0] || null;
  }

  private rememberTelemetry(event: RealtimeEvent) {
    if (event.type !== 'iot.telemetry') return;
    const deviceId = String(event.payload?.deviceId || '').trim();
    if (!deviceId) return;
    this.latestTelemetryByDevice.set(deviceId, event);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const deadClients: Response[] = [];

      for (const [res, info] of this.clients) {
        // 检查超时连接
        if (now - info.lastActivity > this.clientTimeout) {
          console.log(`[RealtimeHub] 连接超时: ${info.ip}`);
          deadClients.push(res);
          continue;
        }

        // 发送 SSE 注释行保活，并刷新活动时间（否则仅广播数据会更新 lastActivity，纯心跳会导致被误判超时断开）
        try {
          res.write(': heartbeat\n\n');
          res.write('event: ping\ndata: {}\n\n');
          info.lastActivity = Date.now();
        } catch (error) {
          console.error(`[RealtimeHub] 心跳发送失败: ${info.ip}`, error);
          deadClients.push(res);
        }
      }

      // 清理超时连接
      deadClients.forEach(res => {
        try {
          res.end();
        } catch {}
        this.removeClient(res);
      });
    }, 30000); // 每30秒发送心跳并检查超时
  }

  stats() {
    return {
      connectedClients: this.clients.size,
      maxClients: this.maxClients,
      clients: Array.from(this.clients.values()).map(info => ({
        ip: info.ip,
        connectedAt: info.connectedAt,
        lastActivity: info.lastActivity,
        duration: Math.round((Date.now() - info.connectedAt) / 1000)
      }))
    };
  }

  destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // 关闭所有连接
    for (const [res] of this.clients) {
      try {
        res.end();
      } catch {}
    }
    this.clients.clear();
  }
}

export const realtimeHub = new RealtimeHub();
