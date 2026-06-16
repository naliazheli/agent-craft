import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentRuntimeLauncherService } from './agent-runtime-launcher.service';

describe('AgentRuntimeLauncherService runtime activity merge', () => {
  const service = new AgentRuntimeLauncherService({ get: () => undefined } as never) as any;

  const session = {
    runtimeId: 'runtime-1',
    role: 'LEAD_AGENT',
    status: 'TYPING',
    lastMessageAt: '2026-05-16T00:01:00.000Z',
    messageHistory: [
      {
        id: 'user-1',
        role: 'user',
        content: 'hello',
        createdAt: '2026-05-16T00:00:00.000Z',
        status: 'SENT',
      },
      {
        id: 'activity-1',
        role: 'tool',
        content: 'Activity: terminal',
        createdAt: '2026-05-16T00:00:02.000Z',
        status: 'RUNTIME_ACTIVITY',
      },
      {
        id: 'hermes-runtime-1-assistant-13',
        role: 'assistant',
        content: 'old answer',
        createdAt: '2026-05-16T00:00:03.000Z',
        status: 'IDLE',
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'what can you do',
        createdAt: '2026-05-16T00:01:00.000Z',
        status: 'SENT',
      },
    ],
  };

  it('does not reattach prior Hermes timeline messages after a newer user message', () => {
    const merged = service.mergeRuntimeActivityMessages(session, [
      {
        id: 'activity-1',
        role: 'tool',
        content: 'Activity: terminal',
        createdAt: '2026-05-16T00:01:02.000Z',
        status: 'RUNTIME_ACTIVITY',
      },
      {
        id: 'hermes-runtime-1-assistant-13',
        role: 'assistant',
        content: 'old answer',
        createdAt: '2026-05-16T00:01:02.000Z',
        status: 'TYPING',
      },
      {
        id: 'hermes-runtime-1-assistant-21',
        role: 'assistant',
        content: 'new answer',
        createdAt: '2026-05-16T00:01:03.000Z',
        status: 'TYPING',
      },
    ]);

    expect(merged.slice(-2)).toEqual([
      expect.objectContaining({ id: 'user-2', role: 'user' }),
      expect.objectContaining({ id: 'hermes-runtime-1-assistant-21', content: 'new answer' }),
    ]);
    expect(merged.filter((message: any) => message.id === 'hermes-runtime-1-assistant-13')).toHaveLength(1);
    expect(merged.filter((message: any) => message.id === 'activity-1')).toHaveLength(0);
  });

  it('does not treat a previous answer as completed output for the current user message', () => {
    expect(service.assistantContentSeenBeforeLatestUser(session, 'old answer')).toBe(true);
    expect(service.assistantContentSeenBeforeLatestUser(session, 'new answer')).toBe(false);
  });

  it('does not reattach a prior Hermes fragment covered by an earlier final answer', () => {
    const coveredFragmentSession = {
      ...session,
      messageHistory: [
        {
          id: 'user-1',
          role: 'user',
          content: 'hello',
          createdAt: '2026-05-16T00:00:00.000Z',
          status: 'SENT',
        },
        {
          id: 'final-1',
          role: 'assistant',
          content: 'Let me check the board first.\n\nold answer',
          createdAt: '2026-05-16T00:00:03.000Z',
          status: 'IDLE',
        },
        {
          id: 'user-2',
          role: 'user',
          content: 'what can you do',
          createdAt: '2026-05-16T00:01:00.000Z',
          status: 'SENT',
        },
      ],
    };

    const merged = service.mergeRuntimeActivityMessages(coveredFragmentSession, [
      {
        id: 'hermes-runtime-1-assistant-13',
        role: 'assistant',
        content: 'old answer',
        createdAt: '2026-05-16T00:01:02.000Z',
        status: 'TYPING',
      },
      {
        id: 'hermes-runtime-1-assistant-21',
        role: 'assistant',
        content: 'new answer',
        createdAt: '2026-05-16T00:01:03.000Z',
        status: 'TYPING',
      },
    ]);

    expect(merged.slice(-2)).toEqual([
      expect.objectContaining({ id: 'user-2', role: 'user' }),
      expect.objectContaining({ id: 'hermes-runtime-1-assistant-21', content: 'new answer' }),
    ]);
    expect(merged.some((message: any) => message.id === 'hermes-runtime-1-assistant-13')).toBe(false);
  });

  it('upserts Hermes timeline messages for autonomous sessions without a user turn', () => {
    const autonomousSession = {
      runtimeId: 'runtime-2',
      role: 'LEGAL_CLAUSE_AGENT',
      status: 'TYPING',
      messageHistory: [
        {
          id: 'hermes-runtime-2-assistant-23',
          role: 'assistant',
          content: 'Analyzing the contract.',
          createdAt: '2026-05-16T00:00:02.000Z',
          status: 'TYPING',
        },
      ],
    };

    const merged = service.mergeRuntimeActivityMessages(autonomousSession, [
      {
        id: 'hermes-runtime-2-assistant-23',
        role: 'assistant',
        content: 'Analyzing the contract.',
        createdAt: '2026-05-16T00:00:03.000Z',
        status: 'TYPING',
      },
    ]);

    expect(merged.filter((message: any) => message.id === 'hermes-runtime-2-assistant-23')).toHaveLength(1);
  });

  it('skips a stale provisional Hermes answer once a final answer includes it', () => {
    const completedSession = {
      runtimeId: 'runtime-3',
      role: 'LEGAL_CLAUSE_AGENT',
      status: 'IDLE',
      messageHistory: [
        {
          id: 'final-answer',
          role: 'assistant',
          content: 'Analyzing the contract.\n\nAssignment complete.',
          createdAt: '2026-05-16T00:00:05.000Z',
          status: 'IDLE',
        },
      ],
    };

    const merged = service.mergeRuntimeActivityMessages(completedSession, [
      {
        id: 'hermes-runtime-3-assistant-23',
        role: 'assistant',
        content: 'Analyzing the contract.',
        createdAt: '2026-05-16T00:00:06.000Z',
        status: 'TYPING',
      },
    ]);

    expect(merged).toEqual([
      expect.objectContaining({ id: 'final-answer', content: 'Analyzing the contract.\n\nAssignment complete.' }),
    ]);
  });
});

describe('AgentRuntimeLauncherService template skill refs', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'runtime-template-skills-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('loads and materializes template-local role skills', async () => {
    const skillDir = join(
      root,
      'legal-contract-review',
      'roles',
      'lead-agent',
      'skills',
      'legal-contract-lead',
    );
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), 'Lead skill body');

    const service = new AgentRuntimeLauncherService({
      get: (key: string) => (key === 'AGENT_WORKSPACE_PROJECT_TEMPLATES_PATH' ? root : undefined),
    } as never) as any;

    const ref = 'template-role-skill://legal-contract-review/lead-agent/legal-contract-lead';
    const prompt = await service.loadSkillPrompt([ref], 'LEAD_AGENT');
    const files = await service.skillBundleFiles('LEAD_AGENT', [ref]);

    expect(prompt).toContain('"legal-contract-lead" skill is active');
    expect(prompt).toContain('Lead skill body');
    expect(files).toEqual([{ path: 'skills/legal-contract-lead/SKILL.md', content: 'Lead skill body' }]);
  });

  it('overlays project skill files for prompt injection and local-runner bundles', async () => {
    const skillDir = join(root, 'agent-workspace');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), 'Base skill body');

    const service = new AgentRuntimeLauncherService({
      get: (key: string) => (key === 'AGENT_WORKSPACE_SKILLS_PATH' ? root : undefined),
    } as never) as any;

    const overrides = [
      {
        ref: 'skill://agent-workspace',
        name: 'agent-workspace',
        storagePath: '.agentcraft/role-skills/lead-agent/agent-workspace/SKILL.md',
        files: [{ path: 'SKILL.md', content: 'Project skill body' }],
      },
    ];

    const prompt = await service.loadSkillPrompt(['skill://agent-workspace'], 'LEAD_AGENT', overrides);
    const files = await service.skillBundleFiles('LEAD_AGENT', ['skill://agent-workspace'], overrides);

    expect(prompt).toContain('Project skill body');
    expect(prompt).not.toContain('Base skill body');
    expect(files).toContainEqual({ path: 'skills/agent-workspace/SKILL.md', content: 'Project skill body' });
  });

  it('can expose skills progressively without injecting full skill bodies', async () => {
    const skillDir = join(root, 'agent-workspace');
    await mkdir(join(skillDir, 'scripts'), { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: agent-workspace',
        'description: Workspace entry skill.',
        '---',
        '',
        'Full body with Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN.',
      ].join('\n'),
    );
    await writeFile(join(skillDir, 'scripts', 'project-files.sh'), '# helper');

    const service = new AgentRuntimeLauncherService({
      get: (key: string) => (key === 'AGENT_WORKSPACE_SKILLS_PATH' ? root : undefined),
    } as never) as any;

    const prompt = await service.loadSkillPrompt(
      ['skill://agent-workspace'],
      'WORKER_AGENT',
      [],
      { progressive: true },
    );

    expect(prompt).toContain('Mounted entrypoint: /opt/data/skills/agent-workspace/SKILL.md');
    expect(prompt).toContain('Description: Workspace entry skill.');
    expect(prompt).toContain('/opt/data/skills/agent-workspace/scripts/project-files.sh');
    expect(prompt).not.toContain('Full body');
    expect(prompt).not.toContain('AIFACTORY_RUNTIME_TOKEN.');
  });

  it('can localize progressive skill mount paths for local CLI runners', async () => {
    const skillDir = join(root, 'agent-workspace');
    await mkdir(join(skillDir, 'scripts'), { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: agent-workspace',
        'description: Workspace entry skill.',
        '---',
        '',
        'Full body.',
      ].join('\n'),
    );
    await writeFile(join(skillDir, 'scripts', 'project-files.sh'), '# helper');

    const service = new AgentRuntimeLauncherService({
      get: (key: string) => (key === 'AGENT_WORKSPACE_SKILLS_PATH' ? root : undefined),
    } as never) as any;

    const prompt = await service.loadSkillPrompt(
      ['skill://agent-workspace'],
      'WORKER_AGENT',
      [],
      { progressive: true, mountRoot: './skills' },
    );

    expect(prompt).toContain('Mounted entrypoint: ./skills/agent-workspace/SKILL.md');
    expect(prompt).toContain('./skills/agent-workspace/scripts/project-files.sh');
    expect(prompt).not.toContain('/opt/data/skills/agent-workspace');
  });
});

describe('AgentRuntimeLauncherService runtime env', () => {
  const service = new AgentRuntimeLauncherService({ get: () => undefined } as never) as any;

  it('includes stable runtime identity aliases for local runner skills', () => {
    const env = service.workspaceRuntimeEnvContents(
      'http://workspace.local',
      'http://localhost:3000/api',
      'token-1',
      null,
      '/opt/data/workspace',
      [],
      [],
      {
        projectId: 'project-1',
        memberId: 'member-1',
        runtimeId: 'runtime-1',
      },
    );

    expect(env).toContain('export AGENT_WORKSPACE_PROJECT_ID="project-1"');
    expect(env).toContain('export AGENT_WORKSPACE_MEMBER_ID="member-1"');
    expect(env).toContain('export AGENT_WORKSPACE_RUNTIME_ID="runtime-1"');
    expect(env).toContain('export PROJECT_ID="project-1"');
    expect(env).toContain('export AIFACTORY_RUNTIME_ID="runtime-1"');
  });

  it('exports HackerOne project globals under common env aliases', () => {
    const env = service.workspaceRuntimeEnvContents(
      'http://workspace.local',
      'http://localhost:3000/api',
      'token-1',
      null,
      '/opt/data/workspace',
      [
        { key: 'hackerone_username', value: 'researcher' },
        { key: 'hackerone_api_token', value: 'h1-token', isSecret: true },
      ],
      [],
      {
        projectId: 'project-1',
        memberId: 'member-1',
        runtimeId: 'runtime-1',
      },
    );

    expect(env).toContain('export PROJECT_GLOBAL_HACKERONE_USERNAME="researcher"');
    expect(env).toContain('export HACKERONE_USERNAME="researcher"');
    expect(env).toContain('export H1_USERNAME="researcher"');
    expect(env).toContain('export PROJECT_GLOBAL_HACKERONE_API_TOKEN="h1-token"');
    expect(env).toContain('export HACKERONE_API_TOKEN="h1-token"');
    expect(env).toContain('export H1_API_TOKEN="h1-token"');
  });

  it('keeps runtime bearer tokens out of the mounted context JSON', () => {
    const file = service.localRunnerRuntimeContextFile(
      {
        runtimeId: 'runtime-1',
        grantId: 'grant-1',
        role: 'WORKER_AGENT',
        scopes: ['PROJECT_READ_BASIC'],
        skillBundleRefs: ['skill://agent-workspace'],
        workspaceToken: 'fresh-token',
      },
      {
        projectId: 'project-1',
        memberId: 'member-1',
        userId: 'user-1',
        role: 'WORKER_AGENT',
        workspaceBaseUrl: 'http://workspace.local',
      },
      {
        workspaceToken: 'old-token',
        accessToken: 'old-access-token',
        token: 'old-generic-token',
      },
    );

    const parsed = JSON.parse(file.content);
    expect(parsed.workspaceToken).toBeUndefined();
    expect(parsed.accessToken).toBeUndefined();
    expect(parsed.token).toBeUndefined();
  });
});

describe('AgentRuntimeLauncherService local Docker health', () => {
  const service = new AgentRuntimeLauncherService({ get: () => undefined } as never) as any;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marks health unhealthy when the running container has a different API key', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 });
    service.docker = jest.fn().mockResolvedValue({
      stdout: JSON.stringify(['API_SERVER_KEY=container-key']),
    });

    const health = await service.checkApiHealth({
      provider: 'local-docker',
      containerName: 'runtime-container',
      apiBaseUrl: 'http://127.0.0.1:41305',
      apiKey: 'session-key',
    });

    expect(health).toEqual({
      ok: false,
      statusCode: 200,
      authMismatch: true,
      error: 'Runtime API key mismatch',
    });
  });
});

describe('AgentRuntimeLauncherService local Docker LLM config', () => {
  const service = new AgentRuntimeLauncherService({ get: () => undefined } as never) as any;

  const llmConfig = (apiUrl: string) => ({
    configId: 'config-1',
    name: 'local model',
    apiType: 'openai',
    apiUrl,
    apiKey: 'key',
    modelName: 'local-model',
  });

  it('rewrites localhost model APIs to the Docker host address', () => {
    expect(service.localDockerLlmConfig(llmConfig('http://127.0.0.1:38440/v1')).apiUrl)
      .toBe('http://host.docker.internal:38440/v1');
    expect(service.localDockerLlmConfig(llmConfig('http://localhost:11434/v1/')).apiUrl)
      .toBe('http://host.docker.internal:11434/v1');
  });

  it('leaves non-local model APIs unchanged', () => {
    expect(service.localDockerLlmConfig(llmConfig('https://api.openai.com/v1')).apiUrl)
      .toBe('https://api.openai.com/v1');
  });

  it('writes a Pi custom provider config for the selected model API', () => {
    const modelsConfig = JSON.parse(service.piModelsConfigContents(llmConfig('http://127.0.0.1:38440/v1')));

    expect(modelsConfig.providers.agentcraft).toMatchObject({
      baseUrl: 'http://127.0.0.1:8642/v1',
      api: 'openai-completions',
      apiKey: '$AGENTCRAFT_MODEL_API_KEY',
      compat: expect.objectContaining({
        supportsUsageInStreaming: false,
      }),
    });
    expect(modelsConfig.providers.agentcraft.models).toContainEqual(
      expect.objectContaining({ id: 'local-model' }),
    );
  });

  it('writes direct Pi model API URLs for local agent package runs', () => {
    const modelsConfig = JSON.parse(service.piModelsConfigContents(
      llmConfig('http://127.0.0.1:38440/v1'),
      { directModelApi: true },
    ));

    expect(modelsConfig.providers.agentcraft).toMatchObject({
      baseUrl: 'http://127.0.0.1:38440/v1',
      api: 'openai-completions',
      apiKey: '$AGENTCRAFT_MODEL_API_KEY',
    });
  });

  it('disables Pi retries in generated settings', () => {
    const settings = JSON.parse(service.piSettingsConfigContents());

    expect(settings).toMatchObject({
      retry: {
        enabled: false,
        maxRetries: 0,
        provider: {
          maxRetries: 0,
        },
      },
    });
  });

  it('points Pi at the generated AgentCraft provider', () => {
    const piEnv = service.agentTypeEnvironmentObject('pi');
    expect(piEnv).toMatchObject({
      AGENTCRAFT_PI_BACKEND: 'rpc',
      AGENTCRAFT_CLI_TIMEOUT_SECONDS: '1800',
      AGENTCRAFT_PI_PROVIDER: 'agentcraft',
      PI_CODING_AGENT_DIR: '/opt/data/.pi/agent',
      AGENTCRAFT_PI_SESSION_ROOT: '/opt/data/.pi/sessions',
    });
    expect(piEnv.AGENTCRAFT_CLI_COMMAND_TEMPLATE).toContain('--mode json');
    expect(piEnv.AGENTCRAFT_CLI_COMMAND_TEMPLATE).toContain('--session "$AGENTCRAFT_PI_SESSION_FILE"');
    expect(piEnv.AGENTCRAFT_CLI_COMMAND_TEMPLATE).toContain('$AGENTCRAFT_INSTRUCTIONS_ARG');
    expect(piEnv.AGENTCRAFT_CLI_COMMAND_TEMPLATE).not.toContain('--no-session');
    expect(service.llmEnvironmentObject(llmConfig('http://127.0.0.1:38440/v1'))).toMatchObject({
      AGENTCRAFT_MODEL_API_KEY: 'key',
      AGENTCRAFT_PI_PROVIDER: 'agentcraft',
      AGENTCRAFT_UPSTREAM_OPENAI_BASE_URL: 'http://127.0.0.1:38440/v1',
    });
  });

  it('runs Pi local runner jobs through the CLI adapter', async () => {
    const job = await service.createLocalRunnerJob(
      {
        projectId: 'project-1',
        memberId: 'member-1',
        userId: 'user-1',
        role: 'WORKER_AGENT',
        agentType: 'pi',
        runtimeId: 'runtime-1',
        grantId: 'grant-1',
        workspaceToken: 'workspace-token',
        scopes: [],
        skillBundleRefs: [],
      },
      'aifactory/pi-agent:local',
      'agentcraft-runtime-1',
      'api-key',
    );

    expect(job.command).toEqual(['node', '/opt/agentcraft/cli-adapter.mjs']);
  });

  it('patches missing gosu in the standalone Hermes local runner entrypoint', async () => {
    const script = await readFile(join(process.cwd(), '..', 'scripts', 'agentcraft-local-runner.mjs'), 'utf8');

    expect(script).toContain('sed -i');
    expect(script).toContain('exec gosu hermes');
    expect(script).toContain('exec runuser -u hermes --');
    expect(script.indexOf('command -v hermes-docker-entrypoint')).toBeLessThan(
      script.indexOf('tr -d "\\\\r" </opt/hermes/docker/entrypoint.sh'),
    );
  });

  it('keeps a config switch for the legacy Pi CLI backend', () => {
    const legacyService = new AgentRuntimeLauncherService({
      get: (key: string) => (key === 'AGENTCRAFT_PI_BACKEND' ? 'cli' : undefined),
    } as never) as any;

    expect(legacyService.agentTypeEnvironmentObject('pi')).toMatchObject({
      AGENTCRAFT_PI_BACKEND: 'cli',
    });
  });
});

describe('AgentRuntimeLauncherService Responses API failures', () => {
  const service = new AgentRuntimeLauncherService({ get: () => undefined } as never) as any;

  it('surfaces failed response payload text as a runtime error', () => {
    const message = service.extractResponsesFailureMessage(
      {
        status: 'failed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Model API service returned an empty streaming response.',
              },
            ],
          },
        ],
      },
      'Model API service returned an empty streaming response.',
    );

    expect(message).toBe('Model API service returned an empty streaming response.');
  });

  it('does not mark completed response payloads as failures', () => {
    expect(service.extractResponsesFailureMessage({ status: 'completed' }, 'ok')).toBe('');
  });

  it('honors explicit retries for Pi runtime message delivery', async () => {
    service.buildResponsesRequest = jest.fn().mockResolvedValue({ input: 'hello' });
    service.readResponsesResponse = jest.fn().mockResolvedValue({ status: 'completed' });
    service.extractOutputText = jest.fn().mockReturnValue('ok');
    service.extractRecentActions = jest.fn().mockReturnValue([]);
    const originalFetch = global.fetch;
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ ok: true });
    (global as any).fetch = fetchMock;

    await expect(service.sendMessage(
      {
        runtimeId: 'runtime-1',
        role: 'WORKER_AGENT',
        agentType: 'pi',
        apiBaseUrl: 'http://runtime.local',
        apiKey: 'runtime-key',
        skillBundleRefs: [],
      },
      'message',
      'system',
      { retries: 2, retryDelayMs: 1 },
    )).resolves.toMatchObject({ outputText: 'ok' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    global.fetch = originalFetch;
  });
});
