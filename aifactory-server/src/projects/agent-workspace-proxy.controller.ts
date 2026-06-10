import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AgentWorkspaceClient } from './agent-workspace.client';

@Controller('agent-workspace')
export class AgentWorkspaceProxyController {
  constructor(private readonly agentWorkspaceClient: AgentWorkspaceClient) {}

  @All('*')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const suffix = this.workspacePath(req.originalUrl || req.url);
    if (!suffix.startsWith('/v1/') && suffix !== '/health') {
      return res.status(404).json({ message: 'Agent workspace proxy path not found' });
    }

    const headers: Record<string, string> = {};
    const authorization = req.header('authorization');
    if (authorization) headers.authorization = authorization;
    const contentType = req.header('content-type');
    if (contentType?.includes('application/json')) headers['content-type'] = 'application/json';
    const accept = req.header('accept');
    if (accept) headers.accept = accept;

    const method = req.method.toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method) && req.body !== undefined;
    const upstream = await fetch(`${this.agentWorkspaceClient.getConfiguredBaseUrl()}${suffix}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(30000),
    });

    res.status(upstream.status);
    const upstreamContentType = upstream.headers.get('content-type');
    if (upstreamContentType) res.setHeader('content-type', upstreamContentType);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  }

  private workspacePath(url: string) {
    const marker = '/agent-workspace';
    const index = url.indexOf(marker);
    return index >= 0 ? url.slice(index + marker.length) || '/' : '/';
  }
}
