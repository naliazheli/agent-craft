import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type WorkspaceRequestOptions = {
  method?: string;
  body?: Record<string, any>;
  headers?: Record<string, string>;
  runtimeToken?: string;
  timeoutMs?: number;
};

export type WorkspaceFileDownload = {
  content: Buffer;
  contentType: string;
  filename: string;
};

export type WorkspaceProjectResponse = {
  projectId: string;
  name: string;
  slug: string;
  status: string;
  visibility: string;
  githubUrl?: string | null;
  ownerUserId: string;
  leadUserId?: string | null;
  description?: string | null;
  brief?: string | null;
  budgetAmount?: number;
  budgetCurrency?: string | null;
  summary?: Record<string, any>;
  source?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceBoardResponse = {
  projectId: string;
  summary: {
    memberCount: number;
    openAssignments: number;
    pendingReviews: number;
    openCiIncidents: number;
  };
  memberPresence: Array<Record<string, any>>;
  goalSummaries: Array<Record<string, any>>;
  assignmentSummaries: Array<Record<string, any>>;
  workItemSummaries: Array<Record<string, any>>;
  inboxSummary: Array<Record<string, any>>;
};

export type WorkspaceMemberResponse = {
  memberId: string;
  userId: string;
  displayName?: string | null;
  role: string;
  permissions?: Record<string, any> | null;
  runtime?: Record<string, any> | null;
  activeGrants?: Array<Record<string, any>>;
  presence?: Record<string, any> | null;
  joinedAt: string;
};

export type WorkspaceProjectEventResponse = {
  id: string;
  seq: number;
  type: string;
  refType?: string | null;
  refId?: string | null;
  payload?: Record<string, any> | null;
  actor?: {
    id: string;
    email: string;
    displayName?: string | null;
    role?: string | null;
  } | null;
  createdAt: string;
};

@Injectable()
export class AgentWorkspaceClient {
  private readonly baseUrl: string;
  private readonly hostKey: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (this.configService.get<string>('AGENT_WORKSPACE_BASE_URL') || '').replace(/\/+$/, '');
    this.hostKey = this.configService.get<string>('AGENT_WORKSPACE_HOST_KEY') || '';
  }

  getConfiguredBaseUrl() {
    this.ensureConfigured();
    return this.baseUrl;
  }

  private ensureConfigured() {
    if (!this.baseUrl || !this.hostKey) {
      throw new InternalServerErrorException('Agent workspace host integration is not configured');
    }
  }

  private async request<T>(path: string, options: WorkspaceRequestOptions = {}): Promise<T> {
    this.ensureConfigured();
    const hasBody = options.body !== undefined;
    const timeoutMs = options.timeoutMs ?? 10000;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
        ...(options.runtimeToken
          ? { authorization: `Bearer ${options.runtimeToken}` }
          : { 'x-agent-workspace-host-key': this.hostKey }),
        ...(options.headers ?? {}),
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined,
    });

    if (!response.ok) {
      let message = `Agent workspace request failed with ${response.status}`;
      try {
        const payload = await response.json();
        message = payload?.error?.message || payload?.message || message;
      } catch {
        // Keep the default message when the response body is empty or non-JSON.
      }
      throw new InternalServerErrorException(message);
    }

    return response.json() as Promise<T>;
  }

  private async requestForm<T>(path: string, formData: FormData, headers: Record<string, string> = {}): Promise<T> {
    this.ensureConfigured();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'x-agent-workspace-host-key': this.hostKey,
        ...headers,
      },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      let message = `Agent workspace request failed with ${response.status}`;
      try {
        const payload = await response.json();
        message = payload?.error?.message || payload?.message || message;
      } catch {
        // Keep the default message when the response body is empty or non-JSON.
      }
      throw new InternalServerErrorException(message);
    }

    return response.json() as Promise<T>;
  }

  private async requestBuffer(path: string): Promise<WorkspaceFileDownload> {
    this.ensureConfigured();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        'x-agent-workspace-host-key': this.hostKey,
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      let message = `Agent workspace request failed with ${response.status}`;
      try {
        const payload = await response.json();
        message = payload?.error?.message || payload?.message || message;
      } catch {
        // Keep the default message when the response body is empty or non-JSON.
      }
      throw new InternalServerErrorException(message);
    }

    const disposition = response.headers.get('content-disposition') || '';
    const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    const filename = encodedMatch
      ? decodeURIComponent(encodedMatch[1])
      : plainMatch?.[1] || 'download';

    return {
      content: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      filename,
    };
  }

  createProject(body: Record<string, any>) {
    return this.request<{
      projectId: string;
      initialGoalId?: string | null;
      initializedProjectFileFolders?: string[];
    }>('/v1/projects', {
      method: 'POST',
      body,
      timeoutMs: 120000,
    });
  }

  updateProject(projectId: string, body: Record<string, any>) {
    return this.request<WorkspaceProjectResponse>(`/v1/projects/${projectId}`, {
      method: 'PATCH',
      body,
    });
  }

  getProject(projectId: string) {
    return this.request<WorkspaceProjectResponse>(`/v1/projects/${projectId}`);
  }

  getBoard(projectId: string) {
    return this.request<WorkspaceBoardResponse>(`/v1/projects/${projectId}/board`);
  }

  listProjectEvents(
    projectId: string,
    query?: { sinceSeq?: number; types?: string[]; refType?: string; refId?: string; workItemId?: string; limit?: number },
  ) {
    const params = new URLSearchParams();
    if (query?.sinceSeq !== undefined) params.set('sinceSeq', String(query.sinceSeq));
    if (query?.types?.length) params.set('types', query.types.join(','));
    if (query?.refType) params.set('refType', query.refType);
    if (query?.refId) params.set('refId', query.refId);
    if (query?.workItemId) params.set('workItemId', query.workItemId);
    if (query?.limit) params.set('limit', String(query.limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      projectId: string;
      events: WorkspaceProjectEventResponse[];
      lastSeq: number;
    }>(`/v1/projects/${projectId}/events${suffix}`);
  }

  recordProjectEvent(projectId: string, body: {
    type: string;
    refType?: string | null;
    refId?: string | null;
    actorUserId?: string | null;
    payload?: Record<string, any> | null;
  }) {
    return this.request<{ projectId: string; event: WorkspaceProjectEventResponse & { actorUserId?: string | null } }>(
      `/v1/projects/${projectId}/events`,
      {
        method: 'POST',
        body: {
          type: body.type,
          ...(body.refType ? { refType: body.refType } : {}),
          ...(body.refId ? { refId: body.refId } : {}),
          ...(body.actorUserId ? { actorUserId: body.actorUserId } : {}),
          ...(body.payload ? { payload: body.payload } : {}),
        },
      },
    );
  }

  listMembers(projectId: string) {
    return this.request<WorkspaceMemberResponse[]>(`/v1/projects/${projectId}/members`);
  }

  createAssignment(projectId: string, body: Record<string, any>) {
    return this.request<{ assignmentId: string; status: string; inboxItemId: string }>(
      `/v1/projects/${projectId}/assignments`,
      {
        method: 'POST',
        body,
      },
    );
  }

  updateWorkItem(projectId: string, workItemId: string, body: Record<string, any>, runtimeToken?: string) {
    return this.request<{ workItemId: string; workItem: Record<string, any> }>(
      `/v1/projects/${projectId}/work-items/${workItemId}`,
      {
        method: 'PATCH',
        body,
        runtimeToken,
      },
    );
  }

  registerRuntime(body: Record<string, any>) {
    return this.request<{ runtimeId: string; status: string; registeredAt: string }>(
      '/v1/runtimes/register',
      {
        method: 'POST',
        body,
      },
    );
  }

  issueAccessGrant(projectId: string, body: Record<string, any>) {
    return this.request<{
      grantId: string;
      status: string;
      scopes: string[];
      skillBundleRefs?: string[];
      capabilityBundleRefs?: string[];
      expiresAt?: string | null;
    }>(`/v1/projects/${projectId}/access-grants`, {
      method: 'POST',
      body,
    });
  }

  installCapabilityBundle(projectId: string, body: Record<string, any>) {
    return this.request<Record<string, any>>(`/v1/projects/${projectId}/capability-bundles`, {
      method: 'POST',
      body,
    });
  }

  mintAccessToken(grantId: string) {
    return this.request<{
      token: string;
      tokenType: string;
      expiresIn: number;
      grantId: string;
    }>(`/v1/access-grants/${grantId}/tokens`, {
      method: 'POST',
    });
  }

  resumeRuntime(runtimeId: string, token: string, projectId: string) {
    return this.request<Record<string, any>>(`/v1/runtimes/${runtimeId}/resume`, {
      method: 'POST',
      runtimeToken: token,
      body: { projectId },
    });
  }

  heartbeatRuntime(runtimeId: string, token: string, body: Record<string, any>) {
    return this.request<{ accepted: boolean; recordedAt: string }>(
      `/v1/runtimes/${runtimeId}/heartbeat`,
      {
        method: 'POST',
        runtimeToken: token,
        body,
      },
    );
  }

  listProjectFiles(projectId: string, query: Record<string, string | number | boolean | undefined> = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request<Record<string, any>>(`/v1/projects/${projectId}/files${suffix}`);
  }

  createProjectFolder(projectId: string, folderPath: string, options: { workItemId?: string } = {}) {
    return this.request<Record<string, any>>(`/v1/projects/${projectId}/files/folders`, {
      method: 'POST',
      body: { path: folderPath, ...(options.workItemId ? { workItemId: options.workItemId } : {}) },
    });
  }

  getProjectFileDownloadUrl(projectId: string, filePath: string, expiresIn?: number) {
    const params = new URLSearchParams({ path: filePath });
    if (expiresIn) params.set('expiresIn', String(expiresIn));
    return this.request<Record<string, any>>(
      `/v1/projects/${projectId}/files/download-url?${params.toString()}`,
    );
  }

  downloadProjectFile(projectId: string, filePath: string) {
    const params = new URLSearchParams({ path: filePath });
    return this.requestBuffer(`/v1/projects/${projectId}/files/download?${params.toString()}`);
  }

  readProjectFile(projectId: string, filePath: string, encoding?: 'text' | 'base64') {
    const params = new URLSearchParams({ path: filePath });
    if (encoding) params.set('encoding', encoding);
    return this.request<Record<string, any>>(
      `/v1/projects/${projectId}/files/read?${params.toString()}`,
    );
  }

  writeProjectFile(
    projectId: string,
    body: { path: string; content: string; contentType?: string; encoding?: 'text' | 'base64'; workItemId?: string },
  ) {
    return this.request<Record<string, any>>(`/v1/projects/${projectId}/files/write`, {
      method: 'POST',
      body,
    });
  }

  async uploadProjectFile(
    projectId: string,
    file: Express.Multer.File,
    filePath?: string,
    options: { workItemId?: string } = {},
  ) {
    const formData = new FormData();
    if (filePath) {
      formData.append('path', filePath);
    }
    if (options.workItemId) {
      formData.append('workItemId', options.workItemId);
    }
    formData.append('file', new Blob([file.buffer as any], { type: file.mimetype }), file.originalname);
    return this.requestForm<Record<string, any>>(
      `/v1/projects/${projectId}/files/upload`,
      formData,
      options.workItemId ? { 'x-agentcraft-work-item-id': options.workItemId } : {},
    );
  }

  deleteProjectFile(projectId: string, filePath: string, recursive = false, options: { workItemId?: string } = {}) {
    const params = new URLSearchParams({ path: filePath });
    if (recursive) params.set('recursive', 'true');
    if (options.workItemId) params.set('workItemId', options.workItemId);
    return this.request<Record<string, any>>(`/v1/projects/${projectId}/files?${params.toString()}`, {
      method: 'DELETE',
      headers: options.workItemId ? { 'x-agentcraft-work-item-id': options.workItemId } : undefined,
    });
  }

  listProjectMemories(projectId: string, query: Record<string, string | number | undefined> = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ projectId: string; memories: any[] }>(`/v1/projects/${projectId}/memories${suffix}`);
  }

  createProjectMemory(projectId: string, body: Record<string, any>, runtimeToken?: string) {
    return this.request<Record<string, any>>(`/v1/projects/${projectId}/memories`, {
      method: 'POST',
      body,
      runtimeToken,
    });
  }

  listProjectGlobals(projectId: string, options: { includeValues?: boolean } = {}) {
    const params = new URLSearchParams();
    if (options.includeValues) params.set('includeValues', 'true');
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ projectId: string; globals: any[] }>(`/v1/projects/${projectId}/globals${suffix}`);
  }

  updateProjectGlobals(
    projectId: string,
    globals: any[],
    options: { updatedByUserId?: string; workItemId?: string; source?: string } = {},
  ) {
    return this.request<{ projectId: string; globals: any[] }>(`/v1/projects/${projectId}/globals`, {
      method: 'PUT',
      body: {
        globals,
        ...(options.updatedByUserId ? { updatedByUserId: options.updatedByUserId } : {}),
        ...(options.workItemId ? { workItemId: options.workItemId } : {}),
        ...(options.source ? { source: options.source } : {}),
      },
    });
  }
}
