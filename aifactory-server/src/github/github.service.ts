import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GithubUser {
  login: string;
}

export interface GithubIssueResponse {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: string;
}

export interface GithubPullRequestResponse {
  number: number;
  html_url: string;
  state: string;
  merged: boolean;
  merged_at: string | null;
  draft?: boolean;
  mergeable?: boolean | null;
  head: {
    sha: string;
    ref: string;
    repo?: {
      full_name: string;
    } | null;
  };
  user: GithubUser | null;
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('GITHUB_TOKEN'));
  }

  async getAuthenticatedUser(): Promise<GithubUser> {
    return this.request<GithubUser>('GET', '/user');
  }

  async createIssue(
    repoFullName: string,
    payload: { title: string; body: string; labels?: string[] },
  ): Promise<GithubIssueResponse> {
    return this.request<GithubIssueResponse>('POST', `/repos/${repoFullName}/issues`, payload);
  }

  async getIssue(repoFullName: string, issueNumber: number): Promise<GithubIssueResponse> {
    return this.request<GithubIssueResponse>('GET', `/repos/${repoFullName}/issues/${issueNumber}`);
  }

  async getRepository(repoFullName: string): Promise<{ default_branch: string }> {
    return this.request<{ default_branch: string }>('GET', `/repos/${repoFullName}`);
  }

  async getRef(
    repoFullName: string,
    ref: string,
  ): Promise<{ object: { sha: string } }> {
    return this.request<{ object: { sha: string } }>(
      'GET',
      `/repos/${repoFullName}/git/ref/${ref}`,
    );
  }

  async createRef(repoFullName: string, ref: string, sha: string) {
    return this.request('POST', `/repos/${repoFullName}/git/refs`, {
      ref,
      sha,
    });
  }

  async getContent(
    repoFullName: string,
    path: string,
    ref?: string,
  ): Promise<{ sha: string; content?: string }> {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    return this.request<{ sha: string; content?: string }>(
      'GET',
      `/repos/${repoFullName}/contents/${path}${query}`,
    );
  }

  async upsertContent(
    repoFullName: string,
    path: string,
    payload: {
      message: string;
      content: string;
      branch: string;
      sha?: string;
    },
  ): Promise<{ content: { sha: string }; commit: { sha: string } }> {
    return this.request<{ content: { sha: string }; commit: { sha: string } }>(
      'PUT',
      `/repos/${repoFullName}/contents/${path}`,
      payload,
    );
  }

  async createPullRequest(
    repoFullName: string,
    payload: { title: string; head: string; base: string; body?: string },
  ): Promise<GithubPullRequestResponse> {
    return this.request<GithubPullRequestResponse>(
      'POST',
      `/repos/${repoFullName}/pulls`,
      payload,
    );
  }

  async getPullRequest(
    repoFullName: string,
    prNumber: number,
  ): Promise<GithubPullRequestResponse> {
    return this.request<GithubPullRequestResponse>(
      'GET',
      `/repos/${repoFullName}/pulls/${prNumber}`,
    );
  }

  async mergePullRequest(
    repoFullName: string,
    prNumber: number,
    payload?: { sha?: string; commit_title?: string },
  ): Promise<{ merged: boolean; message: string; sha?: string }> {
    return this.request<{ merged: boolean; message: string; sha?: string }>(
      'PUT',
      `/repos/${repoFullName}/pulls/${prNumber}/merge`,
      payload ?? {},
    );
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.config.get<string>('GITHUB_TOKEN');
    if (!token) {
      throw new Error('GITHUB_TOKEN is not configured');
    }

    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(`GitHub API ${method} ${path} failed: ${response.status} ${text}`);
      throw new Error(`GitHub API ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  }
}
