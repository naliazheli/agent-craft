import { resolve } from 'node:path';
import { ProjectsService } from './projects.service';

describe('ProjectsService project names', () => {
  const service = new ProjectsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
    {} as never,
  );

  const preserveGoalDomainsInProjectName = (name: string, goal: string) =>
    (service as any).preserveGoalDomainsInProjectName(name, goal);

  it('keeps the full goal domain when generated metadata drops the suffix', () => {
    expect(
      preserveGoalDomainsInProjectName(
        '\u5230\u5fae\u535a\u53bb\u63a8\u9500agentcraft\u9879\u76ee',
        '\u5230\u5fae\u535a\u53bb\u63a8\u9500 agentcraft.com',
      ),
    ).toBe('\u5230\u5fae\u535a\u53bb\u63a8\u9500agentcraft.com\u9879\u76ee');
  });

  it('repairs compact fallback names that lost the domain dot', () => {
    expect(preserveGoalDomainsInProjectName('agentcraftcom', 'Promote agentcraft.com')).toBe('agentcraft.com');
  });

  it('appends the domain when the generated name has no matching token', () => {
    expect(preserveGoalDomainsInProjectName('Weibo launch', 'Promote https://agentcraft.com/campaign')).toBe(
      'Weibo launch agentcraft.com',
    );
  });

  it('preserves a domain even when the goal is only a url', () => {
    expect((service as any).fallbackProjectNameFromGoal('https://agentcraft.com')).toBe(
      'New Agent Project agentcraft.com',
    );
  });

  it('keeps lead resource-request guidance neutral and tied to project globals', async () => {
    const config = await (service as any).projectRoleConfigForRole('LEAD_AGENT');

    expect(config.initialPrompt).toContain('owner-owned resource request work item');
    expect(config.initialPrompt).toContain('inputPacket.resourceRequest');
    expect(config.initialPrompt).toContain('project global key');
    expect(config.initialPrompt).toContain('When the project template coordinator is enabled');
    expect(config.initialPrompt).toContain('Do not infer a vendor');
    expect(config.initialPrompt).not.toMatch(/\b(?:X\/Twitter|Twitter)\b/i);
  });

  it('tells lead runtimes to avoid duplicate dispatch when the coordinator is enabled', async () => {
    const leadService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    jest.spyOn(leadService, 'getProjectRuntimeBudgetContext').mockResolvedValue(null);
    jest.spyOn(leadService, 'leadRuntimeProjectContextPrompt').mockResolvedValue([]);

    const prompt = await leadService.runtimeSystemPrompt('project-1', 'LEAD_AGENT', {
      skillBundleRefs: ['skill://agent-workspace', 'role-skill://agent-workspace-lead'],
      capabilityBundleRefs: ['capability://agent-workspace/core', 'capability://agent-workspace/role/lead-agent'],
      projectGithubUrl: null,
    });

    expect(prompt).toContain('workItemStatusFlow.coordinator.enabled');
    expect(prompt).toContain('Do not call runtime-dispatch while the coordinator is enabled');
    expect(prompt).toContain('Manual dispatch fallback only');
    expect(prompt).toContain('/goals?includeClosed=false&limit=100');
    expect(prompt).toContain('/work-items?goalId=<goalId>&includeClosed=true&limit=100&page=1');
    expect(prompt).toContain('/work-items/{workItemId}');
    expect(prompt).toContain('coordination/lead-goal-ledger.jsonl');
    expect(prompt).toContain('statusDigest');
    expect(prompt).toContain('Do not create ordinary INTEGRATION items for status reports');
  });

  it('adds HackerOne gate and routing instructions to lead project context', async () => {
    const h1Service = new ProjectsService(
      {
        project: {
          findUnique: jest.fn().mockResolvedValue({
            name: 'Coupang Taiwan bounty',
            summary: 'Validate H1 scope',
            settings: {
              sourceTask: {
                taskSource: 'HACKERONE',
                taskTitle: '[HackerOne] Coupang Taiwan: tw.coupangls.com',
                sourceUrl: 'https://hackerone.com/coupang_tw',
              },
              hackerOneTaskProject: {
                source: {
                  taskSource: 'HACKERONE',
                  taskTitle: '[HackerOne] Coupang Taiwan: tw.coupangls.com',
                  sourceUrl: 'https://hackerone.com/coupang_tw',
                },
                program: { name: 'Coupang Taiwan', handle: 'coupang_tw' },
                scope: {
                  assetIdentifier: 'tw.coupangls.com',
                  assetType: 'URL',
                  maxSeverity: 'critical',
                  eligibleForBounty: true,
                },
                rewards: { scopeRange: { rawAmount: '$4,000 - $6,000' } },
                policy: {
                  scopeExclusions: [{ category: 'Infrastructure attacks', details: 'Do not test infrastructure.' }],
                },
                testing: {
                  requiredHeaders: [{ name: 'X-HackerOne-Researcher', value: 'H1 username' }],
                },
                reportTemplate: ['Summary', 'Steps to reproduce'],
              },
            },
          }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    const prompt = (await h1Service.leadRuntimeProjectContextPrompt('project-1')).join('\n');

    expect(prompt).toContain('[HackerOne bounty lead context]');
    expect(prompt).toContain('tw.coupangls.com');
    expect(prompt).toContain('Required testing headers: X-HackerOne-Researcher: H1 username.');
    expect(prompt).toContain('Do not dispatch DRAFT SECURITY_TEST');
    expect(prompt).toContain('INTAKE/PLANNING -> PLANNER_AGENT');
    expect(prompt).toContain('SECURITY_TEST -> WORKER_AGENT only after the plan gate');
  });

  it('keeps worker runtime prompts focused on supported portable context', async () => {
    const prompt = await (service as any).runtimeSystemPrompt('project-1', 'WORKER_AGENT', {
      name: 'Jordan',
      role: 'WORKER_AGENT',
      skillBundleRefs: ['skill://agent-workspace', 'role-skill://agent-workspace-worker'],
      capabilityBundleRefs: [
        'capability://agent-workspace/core',
        'capability://agent-workspace/role/worker-agent',
      ],
      capabilityBundles: [
        {
          ref: 'capability://agent-workspace/core',
          requiredScopes: ['PROJECT_READ_BASIC', 'PROJECT_BOARD_READ'],
          requiredProjectGlobals: [],
        },
      ],
      runtimeFeatureSupport: {
        supportedFeatures: ['filesystemSkills', 'skillPrompts', 'projectFiles', 'projectGlobals'],
        unsupportedFeatures: ['nativePlugins', 'pluginHooks', 'mcpServers'],
      },
      enableSudo: false,
      projectGithubUrl: null,
    });

    expect(prompt).toContain('This runtime supports these portable capability surfaces');
    expect(prompt).toContain('Do not read, print, or copy /opt/data/AGENT_WORKSPACE_RUNTIME.env');
    expect(prompt).toContain('$AGENT_WORKSPACE_BASE_URL/v1/runtimes/$AGENT_WORKSPACE_RUNTIME_ID/resume');
    expect(prompt).not.toMatch(/\bcurl\b/i);
    expect(prompt).not.toContain('Unsupported surfaces');
    expect(prompt).not.toContain('nativePlugins');
    expect(prompt).not.toContain('pluginHooks');
    expect(prompt).not.toContain('mcpServers');
  });

  it('gives lead runtimes explicit goal helper guidance and scope', async () => {
    const originalLeadContext = (service as any).leadRuntimeProjectContextPrompt;
    (service as any).leadRuntimeProjectContextPrompt = jest.fn().mockResolvedValue([]);
    const prompt = await (service as any).runtimeSystemPrompt('project-1', 'LEAD_AGENT', {
      name: 'Julius Caesar',
      role: 'LEAD_AGENT',
      skillBundleRefs: ['skill://agent-workspace', 'role-skill://agent-workspace-lead'],
      capabilityBundleRefs: [
        'capability://agent-workspace/core',
        'capability://agent-workspace/role/lead-agent',
      ],
      capabilityBundles: [
        {
          ref: 'capability://agent-workspace/role/lead-agent',
          requiredScopes: (service as any).rolePolicyScopes('LEAD_AGENT'),
          requiredProjectGlobals: [],
        },
      ],
      runtimeFeatureSupport: {
        supportedFeatures: ['filesystemSkills', 'skillPrompts', 'projectFiles', 'projectGlobals'],
        unsupportedFeatures: ['nativePlugins', 'pluginHooks', 'mcpServers'],
      },
      enableSudo: false,
      projectGithubUrl: null,
    });
    (service as any).leadRuntimeProjectContextPrompt = originalLeadContext;

    expect((service as any).rolePolicyScopes('LEAD_AGENT')).toContain('GOAL_CREATE');
    expect((service as any).rolePolicyScopes('LEAD_AGENT')).toContain('GOAL_UPDATE');
    expect(prompt).toContain('/goals/runtime-create');
    expect(prompt).toContain('/goals/{goalId}/runtime-update');
    expect(prompt).toContain('/work-items/runtime-create');
    expect(prompt).toContain('Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN');
    expect(prompt).toContain('Do not call the user-JWT /goals endpoint with a runtime token');
    expect(prompt).toContain('do not guess /goals/{goalId}/status');
    expect(prompt).toContain('Never mark DONE or create an owner goal-closure action while the same goal still has READY');
    expect(prompt).not.toMatch(/\bcurl\b/i);
  });

  it('allows HackerOne planners to create scoped opportunity goals', () => {
    expect((service as any).rolePolicyScopes('PLANNER_AGENT')).toContain('GOAL_CREATE');
    expect((service as any).rolePolicyScopes('PLANNER_AGENT')).toContain('GOAL_UPDATE');
  });

  it('allows HackerOne workers to surface owner resource requests', () => {
    expect((service as any).rolePolicyScopes('WORKER_AGENT')).toContain('WORK_ITEM_CREATE');
  });

  it('allows HackerOne auditors to create missing owner resource requests', () => {
    expect((service as any).rolePolicyScopes('SECURITY_AUDITOR')).toContain('WORK_ITEM_CREATE');
  });

  it('redacts completed owner resource values from work item responses', () => {
    const sanitized = (service as any).sanitizeWorkItemForResponse({
      id: 'item-1',
      inputPacket: {
        resourceRequest: {
          key: 'hackerone_api_token',
          label: 'HACKERONE_API_TOKEN',
          isSecret: true,
          value: 'secret-token',
        },
      },
      assignments: [
        {
          id: 'assignment-1',
          contextPacket: {
            apiToken: 'secret-token',
            note: 'safe',
          },
        },
      ],
    });

    expect(sanitized.inputPacket.resourceRequest).toEqual(
      expect.objectContaining({
        key: 'hackerone_api_token',
        hasValue: true,
      }),
    );
    expect(sanitized.inputPacket.resourceRequest).not.toHaveProperty('value');
    expect(sanitized.assignments[0].contextPacket).toEqual({
      apiToken: '[REDACTED:secret]',
      note: 'safe',
    });
  });

  it('redacts generic launch secret names from owner-visible errors', () => {
    const sanitized = (service as any).sanitizeAgentLaunchError(
      new Error(
        'docker run -e AGENTCRAFT_MODEL_API_KEY=fake-model-secret ' +
          '-e XIAOMI_TOKEN_PLAN_CN_API_KEY=fake-provider-secret ' +
          '{"hackeroneApiToken":"h1-secret-token","note":"safe"} ' +
          'Authorization: Bearer eyJaaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc',
      ),
    );

    expect(sanitized).toContain('AGENTCRAFT_MODEL_API_KEY=[redacted]');
    expect(sanitized).toContain('XIAOMI_TOKEN_PLAN_CN_API_KEY=[redacted]');
    expect(sanitized).toContain('"hackeroneApiToken":"[redacted]"');
    expect(sanitized).toContain('[jwt redacted]');
    expect(sanitized).not.toContain('fake-model-secret');
    expect(sanitized).not.toContain('fake-provider-secret');
    expect(sanitized).not.toContain('h1-secret-token');
  });

  it('exposes legacy owner decision work items as ownerAction packets', () => {
    const sanitized = (service as any).sanitizeWorkItemForResponse({
      id: 'decision-1',
      title: 'Owner Decision: Submit Matomo Analytics Platform Report to HackerOne?',
      workType: 'INTEGRATION',
      ownerId: 'owner-1',
      inputPacket: { source: 'agent-runtime' },
    });

    expect(sanitized.inputPacket.ownerAction).toEqual(expect.objectContaining({
      key: expect.stringContaining('legacy_owner_decision_submit_matomo'),
      label: 'Submit Matomo Analytics Platform Report to HackerOne?',
      type: 'approval',
      legacy: true,
    }));
  });

  it('returns queued local runtime dispatches without waiting for the first response by default', () => {
    expect((service as any).shouldWaitForDispatchFirstResponse('local-codex')).toBe(false);
    expect((service as any).shouldWaitForDispatchFirstResponse('local-runner')).toBe(false);
  });

  it('returns full visible project stats separately from the paged project list', async () => {
    const prisma = {
      project: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'project-1',
            name: 'Project one',
            summary: null,
            brief: null,
            settings: null,
            _count: { members: 2, workItems: 5, artifacts: 1 },
          },
        ]),
        count: jest.fn().mockResolvedValueOnce(21).mockResolvedValueOnce(4),
      },
      projectWorkItem: {
        count: jest.fn().mockResolvedValue(176),
      },
      projectArtifact: {
        count: jest.fn().mockResolvedValue(7),
      },
    };
    const listService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    );

    const result = await listService.listProjects('user-1', { page: 1, limit: 20 });
    const projectWhere = prisma.project.findMany.mock.calls[0][0].where;

    expect(result.meta.stats).toEqual({ total: 21, active: 4, workItems: 176, artifacts: 7 });
    expect((result.data[0] as any).workItemCount).toBe(5);
    expect(projectWhere.AND).toContainEqual({ deletedAt: null });
    expect(prisma.project.count).toHaveBeenNthCalledWith(1, { where: projectWhere });
    expect(prisma.project.count).toHaveBeenNthCalledWith(2, {
      where: { AND: [...projectWhere.AND, { status: 'ACTIVE' }] },
    });
    expect(prisma.projectWorkItem.count).toHaveBeenCalledWith({ where: { project: { is: projectWhere } } });
    expect(prisma.projectArtifact.count).toHaveBeenCalledWith({ where: { project: { is: projectWhere } } });
  });

  it('uses portable project search filters without breaking MySQL JSON path syntax', async () => {
    const prisma = {
      project: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
      },
      projectWorkItem: {
        count: jest.fn().mockResolvedValue(0),
      },
      projectArtifact: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const listService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    );

    await listService.listProjects('user-1', { search: ' 审核 ' });
    const projectWhere = prisma.project.findMany.mock.calls[0][0].where;
    const searchClause = projectWhere.AND.find((clause: any) =>
      clause.OR?.some((condition: any) => condition.name?.contains === '审核'),
    );

    expect(searchClause).toEqual({
      OR: [
        { name: { contains: '审核' } },
        { slug: { contains: '审核' } },
        { summary: { contains: '审核' } },
        { brief: { contains: '审核' } },
        { settings: { path: '$.githubUrl', string_contains: '审核' } },
      ],
    });
  });

  it('builds the project event graph without sorting project members in the database', async () => {
    const prisma = {
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'member-1',
            userId: 'user-1',
            role: 'WORKER_AGENT',
            permissions: {},
            user: {
              id: 'user-1',
              email: 'worker@example.com',
              displayName: 'Worker One',
              role: 'AI_AGENT',
            },
          },
        ]),
      },
      projectGoal: { findMany: jest.fn().mockResolvedValue([]) },
      projectFeature: { findMany: jest.fn().mockResolvedValue([]) },
      projectWorkItem: { findMany: jest.fn().mockResolvedValue([]) },
      projectRun: { findMany: jest.fn().mockResolvedValue([]) },
      projectArtifact: { findMany: jest.fn().mockResolvedValue([]) },
      projectReview: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      listProjectEvents: jest.fn().mockResolvedValue({ projectId: 'project-1', events: [], lastSeq: 0 }),
      listProjectFiles: jest.fn().mockResolvedValue({ files: [] }),
    };
    const graphService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    graphService.ensureProjectReadable = jest.fn().mockResolvedValue({
      id: 'project-1',
      name: 'Project one',
      settings: { workItemStatusFlow: { coordinator: { enabled: true } } },
    });
    graphService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);

    await graphService.getProjectEventGraph('project-1', 'owner-user');
    const memberQuery = prisma.projectMember.findMany.mock.calls[0]?.[0];

    expect(memberQuery).toEqual(expect.objectContaining({
      where: { projectId: 'project-1', removedAt: null },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true } },
      },
    }));
    expect(memberQuery).not.toHaveProperty('orderBy');
  });

  it('returns compact assignment runtime health when summary mode is requested', async () => {
    const prisma = {
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'assignment-1',
            projectId: 'project-1',
            workItemId: 'work-1',
            role: 'WORKER_AGENT',
            status: 'ACTIVE',
            objective: 'Check target',
            startedAt: new Date('2026-06-07T00:00:00.000Z'),
            finishedAt: null,
            createdAt: new Date('2026-06-07T00:00:00.000Z'),
            updatedAt: new Date('2026-06-07T00:01:00.000Z'),
            contextPacket: {},
            assigneeUserId: 'worker-user',
            assigneeUser: {
              id: 'worker-user',
              email: 'worker@example.com',
              displayName: 'Worker One',
              role: 'AI_AGENT',
            },
            assignedByUser: {
              id: 'owner-user',
              email: 'owner@example.com',
              displayName: 'Owner',
              role: 'ADMIN',
            },
            workItem: {
              id: 'work-1',
              title: 'Worker task',
              status: 'IN_PROGRESS',
              workType: 'SECURITY_TEST',
              goalId: 'goal-1',
              featureId: null,
              ownerId: 'worker-user',
              updatedAt: new Date('2026-06-07T00:01:00.000Z'),
            },
          },
        ]),
      },
    };
    const healthService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    healthService.ensureProjectAccess = jest.fn().mockResolvedValue({ id: 'project-1' });
    healthService.recoverProjectRuntimeSessions = jest.fn().mockResolvedValue({ recovered: 0 });
    healthService.assignmentAssigneeRuntimeState = jest.fn().mockResolvedValue({
      available: true,
      memberId: 'member-1',
      session: {
        runtimeId: 'runtime-1',
        role: 'WORKER_AGENT',
        status: 'TYPING',
        provider: 'local-docker',
        agentType: 'pi',
        rolePrompt: 'very long prompt',
        conversations: [{ id: 'conversation-1' }],
        messageHistory: [{ role: 'assistant', content: 'large history' }],
        dockerStatus: { running: true, status: 'running', exitCode: 0 },
      },
    });

    const result = await healthService.listAssignmentRuntimeStateForOwner('project-1', 'owner-user', {
      summary: true,
    });
    const session = result.assignments[0].assigneeRuntime.session;

    expect(session).toEqual(expect.objectContaining({
      runtimeId: 'runtime-1',
      role: 'WORKER_AGENT',
      status: 'TYPING',
      provider: 'local-docker',
      agentType: 'pi',
      dockerStatus: expect.objectContaining({ running: true, status: 'running' }),
    }));
    expect(session).not.toHaveProperty('rolePrompt');
    expect(session).not.toHaveProperty('conversations');
    expect(session).not.toHaveProperty('messageHistory');
  });

  it('still allows dispatch callers to override first-response waiting', () => {
    expect((service as any).shouldWaitForDispatchFirstResponse('local-codex', { waitForFirstResponse: true })).toBe(true);
    expect((service as any).shouldWaitForDispatchFirstResponse('local-runner', { waitForFirstResponse: true })).toBe(true);
    expect((service as any).shouldWaitForDispatchFirstResponse('local-docker')).toBe(true);
    expect((service as any).shouldWaitForDispatchFirstResponse('aws-ecs', { waitForFirstResponse: false })).toBe(false);
  });

  it('creates goals through the runtime helper for authorized planning roles', async () => {
    const prisma = {
      projectGoal: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'goal-1', title: 'Smoke goal' }),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'PLANNER_AGENT',
      userId: 'planner-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({ id: 'project-1', ownerId: 'owner-user' });
    runtimeService.scheduleLeadPollingWake = jest.fn();
    runtimeService.scheduleCoordinatorTick = jest.fn();
    runtimeService.plannerGoalAnalysisGraceMs = 500;

    const goal = await runtimeService.createGoalFromRuntime('project-1', 'runtime-token', {
      title: '  Smoke goal  ',
      description: '  Created by runtime  ',
      priority: '70' as any,
      sortOrder: '3' as any,
    });

    expect(runtimeService.authenticateProjectRuntimeToken).toHaveBeenCalledWith(
      'project-1',
      'runtime-token',
      ['GOAL_CREATE'],
    );
    expect(prisma.projectGoal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        title: 'Smoke goal',
        description: 'Created by runtime',
        priority: 70,
        sortOrder: 3,
        createdById: 'planner-user',
      }),
    });
    expect(runtimeService.scheduleLeadPollingWake).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'runtime-created goal goal-1',
    );
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'runtime-created planner goal goal-1 awaiting paired work item',
      1500,
    );
    expect(goal).toEqual({ id: 'goal-1', title: 'Smoke goal' });
  });

  it('updates goals through the runtime helper for authorized planning roles', async () => {
    const prisma = {
      projectGoal: {
        update: jest.fn().mockResolvedValue({ id: 'goal-1', status: 'DONE' }),
      },
      projectWorkItem: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'PLANNER_AGENT',
      userId: 'planner-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({ id: 'project-1', ownerId: 'owner-user' });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(undefined);
    runtimeService.scheduleCoordinatorTick = jest.fn();
    runtimeService.scheduleLeadPollingWake = jest.fn();

    const goal = await runtimeService.updateGoalFromRuntime('project-1', 'goal-1', 'runtime-token', {
      status: 'DONE',
      priority: 2,
    });

    expect(runtimeService.authenticateProjectRuntimeToken).toHaveBeenCalledWith(
      'project-1',
      'runtime-token',
      ['GOAL_UPDATE'],
    );
    expect(prisma.projectGoal.update).toHaveBeenCalledWith({
      where: { id: 'goal-1' },
      data: { priority: 2, status: 'DONE' },
    });
    expect(prisma.projectWorkItem.count).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        goalId: 'goal-1',
        status: { notIn: expect.arrayContaining(['ACCEPTED', 'DONE', 'CANCELLED']) },
      },
    });
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'runtime-updated goal goal-1',
    );
    expect(runtimeService.scheduleLeadPollingWake).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'runtime-updated goal goal-1',
    );
    expect(goal).toEqual({ id: 'goal-1', status: 'DONE' });
  });

  it('rejects runtime goal completion while linked work remains open', async () => {
    const prisma = {
      projectWorkItem: {
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({ id: 'project-1', ownerId: 'owner-user' });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(undefined);

    await expect(runtimeService.updateGoalFromRuntime('project-1', 'goal-1', 'runtime-token', {
      status: 'DONE',
    })).rejects.toThrow('linked non-terminal work items remain');
  });

  it('rejects runtime goal cancellation through the runtime update helper', async () => {
    const runtimeService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({ id: 'project-1', ownerId: 'owner-user' });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(undefined);

    await expect(runtimeService.updateGoalFromRuntime('project-1', 'goal-1', 'runtime-token', {
      status: 'CANCELLED',
    })).rejects.toThrow('Runtime goal updates cannot cancel goals');
  });

  it('cascades linked work when an owner marks a goal done', async () => {
    const tx = {
      projectGoal: {
        update: jest.fn().mockResolvedValue({ id: 'goal-1', title: 'Completed goal', status: 'DONE' }),
      },
      projectFeature: {
        findMany: jest.fn().mockResolvedValue([{ id: 'feature-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([{ id: 'work-1' }, { id: 'work-2' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'assignment-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      projectRun: {
        findMany: jest.fn().mockResolvedValue([{ id: 'run-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ id: 'project-1', settings: {} });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(undefined);
    runtimeService.recordWorkItemEvent = jest.fn().mockResolvedValue(undefined);

    const goal = await runtimeService.updateGoal('project-1', 'goal-1', 'owner-user', {
      status: 'DONE',
    });

    expect(goal).toEqual({ id: 'goal-1', title: 'Completed goal', status: 'DONE' });
    expect(tx.projectFeature.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['feature-1'] } },
      data: { status: 'REJECTED' },
    });
    expect(tx.projectWorkItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['work-1', 'work-2'] } },
      data: { status: 'REJECTED' },
    });
    expect(tx.projectAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['assignment-1'] } },
      data: { status: 'RELEASED', finishedAt: expect.any(Date) },
    });
    expect(tx.projectRun.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['run-1'] } },
      data: { status: 'CANCELLED', finishedAt: expect.any(Date) },
    });
    expect(runtimeService.recordWorkItemEvent).toHaveBeenCalledTimes(2);
  });

  it('schedules coordinator immediately for runtime-created lead goals', async () => {
    const prisma = {
      projectGoal: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'goal-1', title: 'Lead goal' }),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({ id: 'project-1', ownerId: 'owner-user' });
    runtimeService.scheduleLeadPollingWake = jest.fn();
    runtimeService.scheduleCoordinatorTick = jest.fn();

    await runtimeService.createGoalFromRuntime('project-1', 'runtime-token', {
      title: 'Lead goal',
      description: 'Created by lead runtime',
    });

    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'runtime-created goal goal-1',
    );
  });

  it('does not wake the lead when runtime goal creation deduplicates an existing goal', async () => {
    const prisma = {
      projectGoal: {
        findMany: jest.fn().mockResolvedValue([{ id: 'goal-1', title: 'Smoke goal', description: 'Created by runtime' }]),
        create: jest.fn(),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'PLANNER_AGENT',
      userId: 'planner-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({ id: 'project-1', ownerId: 'owner-user' });
    runtimeService.scheduleLeadPollingWake = jest.fn();
    runtimeService.scheduleCoordinatorTick = jest.fn();

    const goal = await runtimeService.createGoalFromRuntime('project-1', 'runtime-token', {
      title: 'Smoke goal',
      description: 'Created by runtime',
    });

    expect(prisma.projectGoal.create).not.toHaveBeenCalled();
    expect(runtimeService.scheduleLeadPollingWake).not.toHaveBeenCalled();
    expect(runtimeService.scheduleCoordinatorTick).not.toHaveBeenCalled();
    expect(goal).toEqual({ id: 'goal-1', title: 'Smoke goal', description: 'Created by runtime' });
  });

  it('wakes the lead when a runtime completes an assignment', async () => {
    const runtimeService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'WORKER_AGENT',
      userId: 'worker-user',
    });
    runtimeService.ensureProjectAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      assigneeUserId: 'worker-user',
    });
    runtimeService.updateAssignment = jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'COMPLETED' });
    runtimeService.scheduleLeadPollingWake = jest.fn();

    const updated = await runtimeService.updateAssignmentFromRuntime(
      'project-1',
      'work-1',
      'assignment-1',
      'runtime-token',
      { status: 'COMPLETED' },
    );

    expect(runtimeService.updateAssignment).toHaveBeenCalledWith(
      'project-1',
      'work-1',
      'assignment-1',
      'worker-user',
      { status: 'COMPLETED' },
    );
    expect(runtimeService.scheduleLeadPollingWake).toHaveBeenCalledWith(
      'project-1',
      'worker-user',
      'runtime-completed assignment assignment-1',
    );
    expect(updated).toEqual({ id: 'assignment-1', status: 'COMPLETED' });
  });

  it('runtime-launched sub agents default to pi and owner-visible model configs', async () => {
    const apiConfigService = {
      findAllForUse: jest.fn().mockResolvedValue([
        { id: 'owner-active', isActive: true },
        { id: 'lead-config', isActive: false },
      ]),
    };
    const runtimeService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      apiConfigService as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      session: { provider: 'local-docker', llm: { configId: 'lead-config' } },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.launchAgentRuntime = jest.fn().mockResolvedValue({ memberId: 'worker-member' });

    await runtimeService.launchAgentRuntimeFromRuntime('project-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchMode: 'local-docker',
    });

    expect(apiConfigService.findAllForUse).toHaveBeenCalledWith('owner-user');
    expect(runtimeService.launchAgentRuntime).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      expect.objectContaining({
        role: 'WORKER_AGENT',
        agentType: 'pi',
        llmConfigId: 'lead-config',
      }),
    );
  });

  it('retries runtime dispatch with the next owner model config after a model API failure', async () => {
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker', llm: { configId: 'bad-config' } },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.resolveDispatchAssignee = jest.fn().mockResolvedValue(null);
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([
      { id: 'bad-config' },
      { id: 'good-config' },
    ]);
    runtimeService.launchAgentRuntimeFromRuntime = jest
      .fn()
      .mockResolvedValueOnce({ memberId: 'worker-1', userId: 'worker-user-1', session: { runtimeId: 'runtime-1' } })
      .mockResolvedValueOnce({ memberId: 'worker-2', userId: 'worker-user-2', session: { runtimeId: 'runtime-2' } });
    runtimeService.createAssignment = jest
      .fn()
      .mockResolvedValueOnce({ id: 'assignment-1', contextPacket: {} })
      .mockResolvedValueOnce({ id: 'assignment-2', contextPacket: {} });
    runtimeService.wakeRuntimeForAssignment = jest
      .fn()
      .mockRejectedValueOnce(new Error('401 model API unauthorized'))
      .mockResolvedValueOnce({ completed: true, error: null });
    runtimeService.updateAssignment = jest.fn().mockResolvedValue({});

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchIfMissing: true,
    });

    expect(runtimeService.launchAgentRuntimeFromRuntime).toHaveBeenNthCalledWith(
      1,
      'project-1',
      'runtime-token',
      expect.objectContaining({ agentType: 'pi', llmConfigId: 'bad-config' }),
    );
    expect(runtimeService.launchAgentRuntimeFromRuntime).toHaveBeenNthCalledWith(
      2,
      'project-1',
      'runtime-token',
      expect.objectContaining({ agentType: 'pi', llmConfigId: 'good-config' }),
    );
    expect(runtimeService.updateAssignment).toHaveBeenCalledWith(
      'project-1',
      'work-1',
      'assignment-1',
      'lead-user',
      expect.objectContaining({ status: 'FAILED' }),
    );
    expect(result.assignment.id).toBe('assignment-2');
    expect(result.llmConfigAttempts).toHaveLength(1);
  });

  it('can batch-dispatch a launched sub-agent without waiting for the first response', async () => {
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker', llm: { configId: 'active-config' } },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.resolveDispatchAssignee = jest.fn().mockResolvedValue(null);
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'active-config' }]);
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn().mockResolvedValue({
      memberId: 'worker-1',
      userId: 'worker-user-1',
      session: { runtimeId: 'runtime-1' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({ id: 'assignment-1', contextPacket: {} });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true, error: null });

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchIfMissing: true,
      waitForFirstResponse: false,
    });

    expect(runtimeService.wakeRuntimeForAssignment).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'worker-1',
      expect.objectContaining({ id: 'assignment-1' }),
      { waitForFirstResponse: false },
    );
    expect(result.assignment.id).toBe('assignment-1');
    expect(result.llmConfigAttempts).toEqual([]);
  });

  it('enforces the HackerOne parallel worker project global during runtime dispatch', async () => {
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const agentWorkspaceClient = {
      listProjectGlobals: jest.fn().mockResolvedValue({
        globals: [{ key: 'h1_max_parallel_workers', value: '2', configured: true }],
      }),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker' },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn();

    await expect(runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchIfMissing: true,
    })).rejects.toThrow('Project WORKER_AGENT parallel limit reached (2/2)');

    expect(runtimeService.launchAgentRuntimeFromRuntime).not.toHaveBeenCalled();
  });

  it('counts queued local-runner workers against runtime dispatch parallel limits', async () => {
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'queued-worker-member',
            userId: 'queued-worker-user',
            permissions: {
              runtimeSession: {
                provider: 'local-runner',
                runtimeId: 'queued-runtime',
                status: 'WAITING_LOCAL_RUNNER',
              },
            },
          },
        ]),
      },
    };
    const agentWorkspaceClient = {
      listProjectGlobals: jest.fn().mockResolvedValue({
        globals: [{ key: 'h1_max_parallel_workers', value: '1', configured: true }],
      }),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-runner' },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn();

    await expect(runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchIfMissing: true,
      forceLaunchNew: true,
    })).rejects.toThrow('Project WORKER_AGENT parallel limit reached (1/1)');

    expect(runtimeService.launchAgentRuntimeFromRuntime).not.toHaveBeenCalled();
  });

  it('redacts secret-like fields from assignment context packets', async () => {
    const prisma = {
      projectWorkItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'work-1',
          title: 'Analyze target',
          description: 'Use @opportunities/analyzed.jsonl',
          workType: 'RESEARCH',
          status: 'READY',
          scopeBrief: null,
          acceptanceCriteria: 'Write notes',
          inputPacket: {},
          outputContract: { sharedFiles: ['opportunities/analyzed.jsonl'] },
          dependsOn: [],
          concurrencyMode: 'SINGLE',
          priority: 1,
          dueAt: null,
          goal: null,
          feature: null,
        }),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.relevantMemoryRefsForAssignment = jest.fn().mockResolvedValue([]);

    const packet = await runtimeService.buildAssignmentContextPacket('project-1', 'work-1', {
      role: 'PLANNER_AGENT',
      assigneeUserId: 'planner-user',
      contextPacket: {
        hackeroneUsername: 'researcher',
        hackeroneApiToken: 'h1-token',
        nested: {
          authorization: 'Bearer abc',
          harmless: 'kept',
        },
        credentials: {
          cookie: 'session=secret',
        },
      },
    });

    expect(packet.hackeroneUsername).toBe('researcher');
    expect(packet.hackeroneApiToken).toBe('[REDACTED:secret]');
    expect(packet.nested.authorization).toBe('[REDACTED:secret]');
    expect(packet.nested.harmless).toBe('kept');
    expect(packet.credentials.cookie).toBe('[REDACTED:secret]');
    expect(JSON.stringify(packet)).not.toContain('h1-token');
    expect(JSON.stringify(packet)).not.toContain('Bearer abc');
    expect(JSON.stringify(packet)).not.toContain('session=secret');
  });

  it('includes item comments, attachments, artifacts, and review feedback in assignment context packets', async () => {
    const prisma = {
      projectWorkItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'work-1',
          title: 'Revise report',
          description: 'Use @docs/spec.md',
          workType: 'REPORT',
          status: 'NEEDS_REVISION',
          scopeBrief: 'Address reviewer feedback',
          acceptanceCriteria: 'Reviewer changes are resolved',
          inputPacket: { projectFiles: [{ path: 'docs/spec.md', source: 'test' }] },
          outputContract: { sharedFiles: ['reports/final.md'] },
          dependsOn: [],
          concurrencyMode: 'SINGLE',
          priority: 1,
          dueAt: null,
          goal: { id: 'goal-1', title: 'Ship report', description: 'Goal details', status: 'IN_PROGRESS' },
          feature: null,
        }),
      },
      projectWorkItemComment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'comment-1',
            content: 'Owner attached additional context.',
            attachments: [
              { path: 'comments/context.txt', name: 'context.txt', size: 32 },
              { url: 'https://files.example.test/raw.bin', name: 'raw.bin', size: 64 },
            ],
            user: { id: 'owner-user', email: 'owner@example.test', displayName: 'Owner', role: 'USER' },
            createdAt: new Date('2026-06-09T08:00:00.000Z'),
            updatedAt: new Date('2026-06-09T08:00:00.000Z'),
          },
        ]),
      },
      projectReview: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'review-1',
            assignmentId: 'assignment-1',
            artifactId: 'artifact-1',
            reviewerType: 'AGENT_WORKSPACE',
            status: 'CHANGES_REQUESTED',
            reviewNote: 'Please add the missing validation section.',
            checklistResult: { changes: ['Add validation section'] },
            reviewerUser: { id: 'reviewer-user', email: 'reviewer@example.test', displayName: 'Reviewer', role: 'USER' },
            artifact: {
              id: 'artifact-1',
              title: 'Review notes',
              artifactType: 'HANDOFF',
              url: null,
              metadata: { projectFiles: [{ path: 'reviews/review-notes.md', name: 'review-notes.md' }] },
            },
            createdAt: new Date('2026-06-09T09:00:00.000Z'),
            updatedAt: new Date('2026-06-09T09:00:00.000Z'),
          },
        ]),
      },
      projectArtifact: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'artifact-1',
            artifactType: 'HANDOFF',
            title: 'Worker handoff',
            content: 'Initial report handoff',
            url: null,
            metadata: { resources: [{ path: 'handoffs/initial.md', name: 'initial.md' }] },
            createdAt: new Date('2026-06-09T08:30:00.000Z'),
          },
        ]),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.relevantMemoryRefsForAssignment = jest.fn().mockResolvedValue([]);

    const packet = await runtimeService.buildAssignmentContextPacket('project-1', 'work-1', {
      role: 'WORKER_AGENT',
      assigneeUserId: 'worker-user',
    });

    expect(packet.goal).toEqual(expect.objectContaining({ id: 'goal-1', title: 'Ship report' }));
    expect(packet.revisionFeedback).toEqual(
      expect.objectContaining({
        id: 'review-1',
        status: 'CHANGES_REQUESTED',
        summary: 'Please add the missing validation section.',
      }),
    );
    expect(packet.workItemContext.comments[0]).toEqual(
      expect.objectContaining({
        id: 'comment-1',
        attachments: expect.arrayContaining([
          expect.objectContaining({ path: 'comments/context.txt' }),
          expect.objectContaining({ url: 'https://files.example.test/raw.bin' }),
        ]),
      }),
    );
    expect(packet.workItemContext.artifacts[0]).toEqual(expect.objectContaining({ id: 'artifact-1' }));
    expect(packet.projectFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'docs/spec.md' }),
        expect.objectContaining({ path: 'comments/context.txt' }),
        expect.objectContaining({ path: 'reviews/review-notes.md' }),
        expect.objectContaining({ path: 'handoffs/initial.md' }),
      ]),
    );
    expect(packet.workerStartChecklist.join('\n')).toContain('revisionFeedback');
  });

  it('can force a fresh launched sub-agent even when an idle worker exists', async () => {
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker', llm: { configId: 'active-config' } },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.resolveDispatchAssignee = jest.fn().mockResolvedValue({
      memberId: 'idle-worker',
      userId: 'idle-worker-user',
      targetRuntimeId: 'idle-runtime',
    });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'active-config' }]);
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn().mockResolvedValue({
      memberId: 'fresh-worker',
      userId: 'fresh-worker-user',
      session: { runtimeId: 'fresh-runtime' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({ id: 'assignment-1', contextPacket: {} });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true, error: null });

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchIfMissing: true,
      forceLaunchNew: true,
      waitForFirstResponse: false,
    });

    expect(runtimeService.resolveDispatchAssignee).not.toHaveBeenCalled();
    expect(runtimeService.launchAgentRuntimeFromRuntime).toHaveBeenCalledWith(
      'project-1',
      'runtime-token',
      expect.objectContaining({ agentType: 'pi', llmConfigId: 'active-config' }),
    );
    expect(runtimeService.createAssignment).toHaveBeenCalledWith(
      'project-1',
      'work-1',
      'lead-user',
      expect.objectContaining({
        assigneeUserId: 'fresh-worker-user',
        targetRuntimeId: 'fresh-runtime',
      }),
    );
    expect(result.launchedRuntime.memberId).toBe('fresh-worker');
  });

  it('auto-launches a fresh worker for HackerOne template worker dispatches', async () => {
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker', llm: { configId: 'active-config' } },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({
      ownerId: 'owner-user',
      settings: { projectTemplateId: 'hackerone-opportunity-research' },
    });
    runtimeService.resolveDispatchAssignee = jest.fn().mockResolvedValue({
      memberId: 'idle-worker',
      userId: 'idle-worker-user',
      targetRuntimeId: 'idle-runtime',
    });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'active-config' }]);
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn().mockResolvedValue({
      memberId: 'fresh-worker',
      userId: 'fresh-worker-user',
      session: { runtimeId: 'fresh-runtime' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({ id: 'assignment-1', contextPacket: {} });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true, error: null });

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchIfMissing: true,
      waitForFirstResponse: false,
      contextPacket: { program: { handle: 'flipkart' } },
    });

    expect(runtimeService.resolveDispatchAssignee).not.toHaveBeenCalled();
    expect(runtimeService.launchAgentRuntimeFromRuntime).toHaveBeenCalled();
    expect(result.launchedRuntime.memberId).toBe('fresh-worker');
  });

  it('surfaces owner capacity work instead of reusing an idle worker when HackerOne fresh launch is full', async () => {
    const prisma = {
      projectWorkItem: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'work-1', status: 'READY' })
          .mockResolvedValueOnce({ id: 'work-1', title: 'Deep passive recon - @flipkart', goalId: 'goal-1' })
          .mockResolvedValueOnce(null),
      },
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker', llm: { configId: 'active-config' } },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({
      ownerId: 'owner-user',
      settings: { projectTemplateId: 'hackerone-opportunity-research' },
    });
    runtimeService.ensureRuntimeDispatchRoleCapacity = jest.fn().mockResolvedValue(undefined);
    runtimeService.resolveDispatchAssignee = jest.fn().mockResolvedValue({
      memberId: 'idle-worker',
      userId: 'idle-worker-user',
      targetRuntimeId: 'idle-runtime',
    });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'active-config' }]);
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn().mockRejectedValue(
      new Error('Project active agent limit reached (10/10). Dismiss inactive agents to free capacity.'),
    );
    runtimeService.createWorkItem = jest.fn().mockResolvedValue({ id: 'owner-capacity-item', ownerId: 'owner-user' });
    runtimeService.createAssignment = jest.fn();

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchIfMissing: true,
      waitForFirstResponse: false,
      contextPacket: { program: { handle: 'flipkart' } },
    });

    expect(runtimeService.resolveDispatchAssignee).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).not.toHaveBeenCalled();
    expect(runtimeService.createWorkItem).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      expect.objectContaining({
        title: expect.stringContaining('Increase agent capacity'),
        ownerId: 'owner-user',
        inputPacket: expect.objectContaining({
          source: 'runtime-dispatch-agent-capacity',
          blockedWorkItemId: 'work-1',
        }),
      }),
    );
    expect(result.ownerWorkItem.id).toBe('owner-capacity-item');
    expect(result.response).toContain('capacity');
  });

  it('allows explicit same-goal worker reuse for HackerOne continuation dispatches', async () => {
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker', llm: { configId: 'active-config' } },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({
      ownerId: 'owner-user',
      settings: { projectTemplateId: 'hackerone-opportunity-research' },
    });
    runtimeService.resolveDispatchAssignee = jest.fn().mockResolvedValue({
      memberId: 'idle-worker',
      userId: 'idle-worker-user',
      targetRuntimeId: 'idle-runtime',
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({ id: 'assignment-1', contextPacket: {} });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true, error: null });
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn();

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchIfMissing: true,
      contextPacket: { sameGoalContinuation: true },
    });

    expect(runtimeService.resolveDispatchAssignee).toHaveBeenCalled();
    expect(runtimeService.launchAgentRuntimeFromRuntime).not.toHaveBeenCalled();
    expect(result.assignment.id).toBe('assignment-1');
  });

  it('replaces an active assignment when its assignee runtime is unavailable', async () => {
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'stale-assignment',
          assigneeUserId: 'stale-worker-user',
          contextPacket: {},
        }),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker', llm: { configId: 'active-config' } },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.assignmentAssigneeRuntimeState = jest.fn().mockResolvedValue({ available: false, memberId: 'stale-worker' });
    runtimeService.updateAssignment = jest.fn().mockResolvedValue({});
    runtimeService.ensureRuntimeDispatchRoleCapacity = jest.fn().mockResolvedValue(undefined);
    runtimeService.resolveDispatchAssignee = jest.fn().mockResolvedValue(null);
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'active-config' }]);
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn().mockResolvedValue({
      memberId: 'fresh-planner',
      userId: 'fresh-planner-user',
      session: { runtimeId: 'fresh-runtime' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({ id: 'fresh-assignment', contextPacket: {} });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true, error: null });

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'PLANNER_AGENT',
      launchIfMissing: true,
      waitForFirstResponse: false,
    });

    expect(runtimeService.updateAssignment).toHaveBeenCalledWith(
      'project-1',
      'work-1',
      'stale-assignment',
      'lead-user',
      expect.objectContaining({
        status: 'FAILED',
        contextPacket: expect.objectContaining({
          staleDispatch: expect.objectContaining({ reason: 'ASSIGNEE_RUNTIME_UNAVAILABLE' }),
        }),
      }),
    );
    expect(runtimeService.createAssignment).toHaveBeenCalledWith(
      'project-1',
      'work-1',
      'lead-user',
      expect.objectContaining({ assigneeUserId: 'fresh-planner-user' }),
    );
    expect(result.assignment.id).toBe('fresh-assignment');
  });

  it('wakes an existing proposed assignment when its runtime is available', async () => {
    const existingAssignment = {
      id: 'proposed-assignment',
      assigneeUserId: 'planner-user',
      status: 'PROPOSED',
      contextPacket: {},
    };
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(existingAssignment),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker' },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.assignmentAssigneeRuntimeState = jest.fn().mockResolvedValue({ available: true, memberId: 'planner-member' });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true, error: null });
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn();
    runtimeService.createAssignment = jest.fn();

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'PLANNER_AGENT',
      launchIfMissing: true,
      waitForFirstResponse: false,
    });

    expect(runtimeService.wakeRuntimeForAssignment).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'planner-member',
      existingAssignment,
      { waitForFirstResponse: false },
    );
    expect(runtimeService.launchAgentRuntimeFromRuntime).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).not.toHaveBeenCalled();
    expect(result.assignment.id).toBe('proposed-assignment');
    expect(result.idempotent).toBe(true);
  });

  it('suppresses duplicate force-launch dispatches for the same work item and role', async () => {
    const existingAssignment = {
      id: 'in-flight-assignment',
      assigneeUserId: 'planner-user',
      status: 'ACTIVE',
      contextPacket: {},
    };
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(existingAssignment),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker' },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.assignmentAssigneeRuntimeState = jest.fn().mockResolvedValue({ available: false, memberId: null });
    runtimeService.updateAssignment = jest.fn();
    runtimeService.ensureRuntimeDispatchRoleCapacity = jest.fn();
    runtimeService.launchAgentRuntimeFromRuntime = jest.fn();
    runtimeService.createAssignment = jest.fn();

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'PLANNER_AGENT',
      launchIfMissing: true,
      forceLaunchNew: true,
      waitForFirstResponse: false,
    });

    expect(runtimeService.updateAssignment).not.toHaveBeenCalled();
    expect(runtimeService.ensureRuntimeDispatchRoleCapacity).not.toHaveBeenCalled();
    expect(runtimeService.launchAgentRuntimeFromRuntime).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).not.toHaveBeenCalled();
    expect(result.assignment.id).toBe('in-flight-assignment');
    expect(result.idempotent).toBe(true);
    expect(result.duplicateDispatchSuppressed).toBe(true);
  });

  it('creates an owner work item when every owner model config fails dispatch', async () => {
    const prisma = {
      projectAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
      memberId: 'lead-member',
      session: { provider: 'local-docker', llm: { configId: 'bad-config' } },
    });
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.resolveDispatchAssignee = jest.fn().mockResolvedValue(null);
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([
      { id: 'bad-config' },
      { id: 'worse-config' },
    ]);
    runtimeService.launchAgentRuntimeFromRuntime = jest
      .fn()
      .mockResolvedValueOnce({ memberId: 'worker-1', userId: 'worker-user-1', session: { runtimeId: 'runtime-1' } })
      .mockResolvedValueOnce({ memberId: 'worker-2', userId: 'worker-user-2', session: { runtimeId: 'runtime-2' } });
    runtimeService.createAssignment = jest
      .fn()
      .mockResolvedValueOnce({ id: 'assignment-1', contextPacket: {} })
      .mockResolvedValueOnce({ id: 'assignment-2', contextPacket: {} });
    runtimeService.wakeRuntimeForAssignment = jest
      .fn()
      .mockRejectedValueOnce(new Error('AgentCraft model proxy error: 502 upstream'))
      .mockRejectedValueOnce(new Error('empty streaming response from model api'));
    runtimeService.updateAssignment = jest.fn().mockResolvedValue({});
    runtimeService.createOwnerModelApiFailureWorkItem = jest.fn().mockResolvedValue({
      id: 'owner-item-1',
      title: 'Fix model API',
    });

    const result = await runtimeService.dispatchWorkItemFromRuntime('project-1', 'work-1', 'runtime-token', {
      role: 'WORKER_AGENT',
      launchIfMissing: true,
    });

    expect(runtimeService.createOwnerModelApiFailureWorkItem).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'work-1',
      'WORKER_AGENT',
      'pi',
      expect.arrayContaining([
        expect.objectContaining({ llmConfigId: 'bad-config' }),
        expect.objectContaining({ llmConfigId: 'worse-config' }),
      ]),
      expect.stringContaining('empty streaming response'),
    );
    expect(result.assignment).toBeNull();
    expect(result.ownerWorkItem.id).toBe('owner-item-1');
  });

  it('blocks coordinator dispatch when a launch needs model config and none is available', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'work-1',
            title: 'Research target',
            status: 'READY',
            workType: 'SECURITY_TEST',
            ownerId: null,
            assignments: [],
            goal: { id: 'goal-1', title: 'Target goal' },
          },
        ]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'WORKER_AGENT' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 0, maxActiveAgents: 10 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([]);
    runtimeService.launchAgentRuntime = jest.fn();

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(result.dispatched).toHaveLength(0);
    expect(result.blocked[0]).toEqual(expect.objectContaining({ reason: 'MODEL_API_MISSING', workItemId: 'work-1' }));
    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
    expect(agentWorkspaceClient.recordProjectEvent).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        type: 'COORDINATOR_BLOCKED',
        refType: 'WORK_ITEM',
        refId: 'work-1',
      }),
    );
  });

  it('schedules a coordinator tick when a dispatchable work item is created', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
          },
        ],
        coordinator: { enabled: true },
      },
    };
    const createdWorkItem = {
      id: 'work-1',
      title: 'Research target',
      status: 'READY',
      workType: 'SECURITY_TEST',
      ownerId: null,
      assignments: [],
    };
    const prisma = {
      projectWorkItem: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdWorkItem),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(null);
    runtimeService.scheduleCoordinatorTick = jest.fn();

    const result = await runtimeService.createWorkItem('project-1', 'owner-user', {
      title: 'Research target',
      description: 'Authorized target research',
      workType: 'SECURITY_TEST',
    });

    expect(result).toEqual(expect.objectContaining(createdWorkItem));
    expect(prisma.projectWorkItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        projectId: 'project-1',
        status: 'READY',
        title: 'Research target',
      }),
    }));
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'work item work-1 created as READY',
    );
  });

  it('rejects new active work items when the project active item limit is reached', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        terminalStatuses: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
      },
      projectGlobals: [
        {
          key: 'max_active_items',
          value: '3',
          isSecret: false,
          required: false,
        },
      ],
    };
    const prisma = {
      projectWorkItem: {
        count: jest.fn().mockResolvedValue(3),
        create: jest.fn(),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(null);
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue(settings.projectGlobals);

    await expect(runtimeService.createWorkItem('project-1', 'owner-user', {
      title: 'Research target',
      description: 'Authorized target research',
      workType: 'SECURITY_TEST',
    })).rejects.toThrow('Project active work item limit reached (3/3)');

    expect(prisma.projectWorkItem.count).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        status: { notIn: expect.arrayContaining(['ACCEPTED', 'REJECTED', 'CANCELLED']) },
      },
    });
    expect(prisma.projectWorkItem.create).not.toHaveBeenCalled();
  });

  it('schedules a coordinator tick when runtime listing reconciles stale assignments', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        assignmentFailedStatus: 'NEEDS_REVISION',
        dispatchRules: [
          {
            statuses: ['NEEDS_REVISION'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
          },
        ],
        coordinator: { enabled: true },
      },
    };
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings }),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.findProjectRuntimeMembers = jest.fn().mockResolvedValue([]);
    runtimeService.getWorkspaceMembers = jest.fn().mockResolvedValue([]);
    runtimeService.getProjectRuntimeBudgetContext = jest.fn().mockResolvedValue(null);
    runtimeService.sanitizeAccountLocalRunnerPresences = jest.fn().mockReturnValue([]);
    runtimeService.reconcileStaleOpenAssignments = jest.fn().mockResolvedValue([
      { assignmentId: 'assignment-1', workItemId: 'work-1' },
    ]);
    runtimeService.scheduleCoordinatorTick = jest.fn();

    const result = await runtimeService.listAgentRuntimes('project-1', 'viewer-user');

    expect(result.sessions).toEqual([]);
    expect(runtimeService.reconcileStaleOpenAssignments).toHaveBeenCalledWith(
      'project-1',
      'viewer-user',
      expect.objectContaining({ assignmentFailedStatus: 'NEEDS_REVISION' }),
      { source: 'owner-runtime-list' },
    );
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'runtime list reconciled 1 stale assignment(s)',
      250,
    );
  });

  it('reconciles runtime budget commitments with inspected local runtime sessions', async () => {
    const storedSession = {
      runtimeId: 'runtime-1',
      provider: 'local-docker',
      status: 'TYPING',
      deploymentDays: 1,
    };
    const inspectedSession = {
      ...storedSession,
      status: 'STOPPED',
      currentActivity: 'Runtime stopped',
      apiHealth: { ok: false, error: 'fetch failed' },
    };
    const runtimeService = new ProjectsService(
      {
        project: {
          findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} }),
        },
      } as never,
      {} as never,
      { inspect: jest.fn().mockResolvedValue(inspectedSession) } as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({});
    runtimeService.findProjectRuntimeMembers = jest.fn().mockResolvedValue([
      {
        id: 'member-1',
        userId: 'agent-user',
        role: 'WORKER_AGENT',
        permissions: { runtimeSession: storedSession },
        user: { id: 'agent-user', email: 'agent@example.test' },
      },
    ]);
    runtimeService.getWorkspaceMembers = jest.fn().mockResolvedValue([]);
    runtimeService.getProjectRuntimeBudgetContext = jest.fn().mockResolvedValue({
      budgetAmount: 10,
      budgetCurrency: 'AIC',
      dailyAgentCostAmount: 10,
      committedAmount: 0,
      availableAmount: 10,
      canLaunchOneDayAgent: true,
      runtimeCommitments: [
        {
          memberId: 'member-1',
          userId: 'agent-user',
          role: 'WORKER_AGENT',
          runtimeId: 'runtime-1',
          status: 'TYPING',
          deploymentDays: 1,
          dailyCostAmount: 0,
          committedAmount: 0,
        },
      ],
      launchableRoles: [],
    });
    runtimeService.sanitizeAccountLocalRunnerPresences = jest.fn().mockReturnValue([]);
    runtimeService.reconcileStaleOpenAssignments = jest.fn().mockResolvedValue([]);
    runtimeService.writeRuntimeSession = jest.fn();

    const result = await runtimeService.listAgentRuntimes('project-1', 'viewer-user');

    expect(result.sessions[0].session.status).toBe('STOPPED');
    expect(result.budget.runtimeCommitments[0]).toEqual(expect.objectContaining({
      memberId: 'member-1',
      runtimeId: 'runtime-1',
      status: 'STOPPED',
      committedAmount: 0,
    }));
    expect(result.budget.availableAmount).toBe(10);
    expect(runtimeService.writeRuntimeSession).toHaveBeenCalledWith(
      'member-1',
      expect.objectContaining({ status: 'STOPPED' }),
    );
  });

  it('marks active assignments stale when their runtime is idle without an active request', () => {
    const runtimeService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    const nowMs = Date.parse('2026-06-07T12:00:00.000Z');
    const assignment = {
      status: 'ACTIVE',
      startedAt: '2026-06-07T11:55:00.000Z',
      updatedAt: '2026-06-07T11:55:00.000Z',
      createdAt: '2026-06-07T11:55:00.000Z',
    };

    expect(runtimeService.openAssignmentIdleRuntimeStaleReasons(
      assignment,
      { available: true, session: { status: 'IDLE' } },
      nowMs,
    )).toEqual(['runtime_idle_without_active_request']);

    expect(runtimeService.openAssignmentIdleRuntimeStaleReasons(
      assignment,
      { available: true, session: { status: 'TYPING' } },
      nowMs,
    )).toEqual(['runtime_typing_without_active_request']);

    expect(runtimeService.openAssignmentIdleRuntimeStaleReasons(
      assignment,
      { available: true, session: { status: 'TYPING', lastStreamAt: '2026-06-07T11:59:00.000Z' } },
      nowMs,
    )).toEqual([]);

    expect(runtimeService.openAssignmentIdleRuntimeStaleReasons(
      assignment,
      { available: true, session: { status: 'IDLE', activeRequestId: 'request-1' } },
      nowMs,
    )).toEqual([]);

    expect(runtimeService.openAssignmentIdleRuntimeStaleReasons(
      assignment,
      { available: true, session: null },
      nowMs,
    )).toEqual(['runtime_session_missing']);

    expect(runtimeService.openAssignmentIdleRuntimeStaleReasons(
      { ...assignment, startedAt: '2026-06-07T11:59:30.000Z', updatedAt: '2026-06-07T11:59:30.000Z' },
      { available: true, session: null },
      nowMs,
    )).toEqual([]);
  });

  it('schedules a coordinator tick when polling sweep reconciles stale assignments', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        assignmentFailedStatus: 'NEEDS_REVISION',
        dispatchRules: [
          {
            statuses: ['NEEDS_REVISION'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
          },
        ],
        coordinator: { enabled: true },
      },
    };
    const prisma = {
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'member-1', projectId: 'project-1', role: 'LEAD_AGENT', permissions: {} },
        ]),
      },
      project: {
        findMany: jest.fn().mockResolvedValue([{ id: 'project-1', ownerId: 'owner-user', status: 'ACTIVE', settings }]),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.reconcileStaleOpenAssignments = jest.fn().mockResolvedValue([
      { assignmentId: 'assignment-1', workItemId: 'work-1' },
    ]);
    runtimeService.scheduleCoordinatorTick = jest.fn();

    await runtimeService.sweepDueAgentRuntimePolling();

    expect(runtimeService.reconcileStaleOpenAssignments).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      expect.objectContaining({ assignmentFailedStatus: 'NEEDS_REVISION' }),
      { source: 'polling-sweep', limit: 100 },
    );
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'polling sweep reconciled 1 stale assignment(s)',
      250,
    );
  });

  it('preserves runtime-created output project files in the assignment packet source', async () => {
    const createdWorkItem = {
      id: 'work-1',
      title: 'Discovery',
      status: 'READY',
      workType: 'OPPORTUNITY_DISCOVERY',
      ownerId: null,
      assignments: [],
    };
    const prisma = {
      projectWorkItem: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdWorkItem),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(null);
    runtimeService.scheduleCoordinatorTick = jest.fn();

    await runtimeService.createWorkItemFromRuntime('project-1', 'runtime-token', {
      title: 'Discovery',
      workType: 'OPPORTUNITY_DISCOVERY',
      outputProjectFiles: ['analysed/project-addresses.jsonl', 'opportunities/analyzed.jsonl'],
    });

    expect(prisma.projectWorkItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inputPacket: expect.objectContaining({
          outputProjectFiles: ['analysed/project-addresses.jsonl', 'opportunities/analyzed.jsonl'],
          sharedFiles: [
            { path: 'analysed/project-addresses.jsonl', required: true, source: 'outputProjectFiles' },
            { path: 'opportunities/analyzed.jsonl', required: true, source: 'outputProjectFiles' },
          ],
        }),
      }),
    }));
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'work item work-1 created as READY',
    );
  });

  it('normalizes HackerOne opportunity discovery runtime work to planner-routed unowned items', async () => {
    const createdWorkItem = {
      id: 'work-1',
      title: 'HackerOne Opportunity Discovery - batch scan',
      status: 'READY',
      workType: 'OPPORTUNITY_DISCOVERY',
      ownerId: null,
      assignments: [],
    };
    const prisma = {
      projectWorkItem: {
        create: jest.fn().mockResolvedValue(createdWorkItem),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'PLANNER_AGENT',
      userId: 'planner-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({
      settings: { projectTemplateId: 'hackerone-opportunity-research' },
    });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(null);
    runtimeService.ensureProjectActiveWorkItemCapacity = jest.fn().mockResolvedValue(null);
    runtimeService.recordWorkItemEvent = jest.fn().mockResolvedValue(null);
    runtimeService.scheduleCoordinatorTick = jest.fn();

    await runtimeService.createWorkItemFromRuntime('project-1', 'runtime-token', {
      goalId: 'goal-1',
      ownerId: 'planner-user',
      title: 'HackerOne Opportunity Discovery - batch scan',
      workType: 'SECURITY_TEST',
      status: 'READY',
      inputPacket: {
        source: 'agent-runtime',
        opportunitySource: 'https://hackerone.com/opportunities/all',
        outputProjectFiles: ['analysed/project-addresses.jsonl', 'opportunities/analyzed.jsonl'],
      },
      outputContract: {
        required: ['analyzedCount', 'createdGoalIds'],
      },
    });

    expect(prisma.projectWorkItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workType: 'OPPORTUNITY_DISCOVERY',
        ownerId: undefined,
      }),
    }));
  });

  it('lets authorized runtimes read work item comments through the runtime helper', async () => {
    const comments = [
      {
        id: 'comment-1',
        projectId: 'project-1',
        workItemId: 'work-1',
        content: 'Worker handoff',
      },
    ];
    const prisma = {
      projectWorkItemComment: {
        findMany: jest.fn().mockResolvedValue(comments),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
    });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(null);

    const result = await runtimeService.listWorkItemCommentsFromRuntime('project-1', 'work-1', 'runtime-token');

    expect(runtimeService.authenticateProjectRuntimeToken).toHaveBeenCalledWith(
      'project-1',
      'runtime-token',
      ['THREAD_PARTICIPATE'],
    );
    expect(runtimeService.ensureProjectScopedReference).toHaveBeenCalledWith('project-1', 'workItem', 'work-1');
    expect(prisma.projectWorkItemComment.findMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1', workItemId: 'work-1' },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual({
      projectId: 'project-1',
      workItemId: 'work-1',
      comments,
    });
  });

  it('rejects HackerOne runtime-created target work items without a goalId', async () => {
    const prisma = {
      projectWorkItem: {
        create: jest.fn(),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({
      settings: { projectTemplateId: 'hackerone-opportunity-research' },
    });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(null);

    await expect(runtimeService.createWorkItemFromRuntime('project-1', 'runtime-token', {
      title: 'Phase 2 Validation: Vimeo Authenticated API and CORS Testing',
      workType: 'SECURITY_TEST',
      status: 'READY',
    })).rejects.toThrow('HackerOne runtime-created target work items must include a goalId');

    expect(prisma.projectWorkItem.create).not.toHaveBeenCalled();
  });

  it('deduplicates runtime-created security audit work items for the same goal', async () => {
    const existingAudit = {
      id: 'audit-1',
      projectId: 'project-1',
      goalId: 'goal-1',
      featureId: null,
      parentWorkItemId: null,
      title: 'Security Audit: Existing Evidence Review',
      description: 'Existing audit item',
      workType: 'SECURITY_AUDIT',
      status: 'READY',
      inputPacket: { source: 'agent-runtime' },
      outputContract: {},
      ownerId: null,
      assignments: [],
      owner: null,
      _count: { assignments: 0, artifacts: 0, reviews: 0, comments: 0 },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([existingAudit]),
        create: jest.fn(),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      role: 'LEAD_AGENT',
      userId: 'lead-user',
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({
      settings: { projectTemplateId: 'hackerone-opportunity-research' },
    });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(null);
    runtimeService.scheduleCoordinatorTick = jest.fn();

    const result = await runtimeService.createWorkItemFromRuntime('project-1', 'runtime-token', {
      goalId: 'goal-1',
      title: 'Security Audit: New Evidence Review',
      workType: 'SECURITY_AUDIT',
      status: 'READY',
      inputPacket: { source: 'agent-runtime' },
    });

    expect(prisma.projectWorkItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        projectId: 'project-1',
        goalId: 'goal-1',
        workType: 'SECURITY_AUDIT',
        status: expect.objectContaining({ notIn: expect.any(Array) }),
      }),
    }));
    expect(prisma.projectWorkItem.create).not.toHaveBeenCalled();
    expect(runtimeService.scheduleCoordinatorTick).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 'audit-1' }));
  });

  it('schedules a coordinator tick when an owner resource request is completed', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['IN_REVIEW'],
            workTypes: ['SECURITY_TEST'],
            role: 'SECURITY_AUDITOR',
          },
        ],
        coordinator: { enabled: true },
      },
    };
    const currentWorkItem = {
      status: 'READY',
      inputPacket: {
        resourceRequest: {
          key: 'h1_goal_airtable_account_a_email',
          label: 'Airtable account A email',
          category: 'hackerone-goal',
          isSecret: false,
        },
      },
    };
    const updatedWorkItem = {
      id: 'resource-1',
      title: 'Resource Request: Airtable account A email',
      status: 'ACCEPTED',
      workType: 'INTEGRATION',
      inputPacket: {
        resourceRequest: {
          ...currentWorkItem.inputPacket.resourceRequest,
          value: 'totol+airtable-a@example.com',
        },
      },
    };
    const prisma = {
      projectWorkItem: {
        findUnique: jest.fn().mockResolvedValue(currentWorkItem),
        update: jest.fn().mockResolvedValue(updatedWorkItem),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(null);
    runtimeService.applyCompletedProjectGlobalResourceRequest = jest.fn().mockResolvedValue(true);
    runtimeService.scheduleCoordinatorTick = jest.fn();
    runtimeService.scheduleLeadPollingWake = jest.fn();
    runtimeService.notifyOwnerTodoRequester = jest.fn().mockResolvedValue(true);

    const result = await runtimeService.updateWorkItem('project-1', 'resource-1', 'owner-user', {
      status: 'ACCEPTED',
      inputPacket: updatedWorkItem.inputPacket,
    });

    expect(result).toEqual(expect.objectContaining({
      id: 'resource-1',
      status: 'ACCEPTED',
    }));
    expect(runtimeService.applyCompletedProjectGlobalResourceRequest).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      updatedWorkItem,
    );
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'resource request resource-1 completed',
    );
    expect(runtimeService.scheduleLeadPollingWake).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'resource request resource-1 completed',
    );
    expect(runtimeService.notifyOwnerTodoRequester).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      updatedWorkItem,
      'resourceRequest',
    );
  });

  it('stamps runtime-created owner actions with requester session context', async () => {
    const runtimeService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.authenticateProjectRuntimeToken = jest.fn().mockResolvedValue({
      memberId: 'member-1',
      userId: 'agent-user',
      role: 'WORKER_AGENT',
      runtimeId: 'runtime-1',
      scopes: ['WORK_ITEM_CREATE'],
      session: {
        runtimeId: 'runtime-1',
        activeConversationId: 'conversation-1',
        activeRequestId: 'request-1',
      },
    });
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({ settings: {} });
    runtimeService.createWorkItemInternal = jest.fn().mockResolvedValue({ id: 'owner-action-1' });

    await runtimeService.createWorkItemFromRuntime('project-1', 'runtime-token', {
      title: 'Owner Action: Activate account',
      workType: 'INTEGRATION',
      status: 'READY',
      goalId: 'goal-1',
      inputPacket: {
        source: 'agent-runtime',
        ownerAction: {
          key: 'h1_goal_demo_account_a_activation',
          label: 'Activate account A',
        },
      },
    });

    const dto = runtimeService.createWorkItemInternal.mock.calls[0][2];
    expect(dto.inputPacket.ownerTodoRequester).toEqual(expect.objectContaining({
      memberId: 'member-1',
      userId: 'agent-user',
      role: 'WORKER_AGENT',
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      requestId: 'request-1',
    }));
    expect(dto.inputPacket.ownerAction.requester).toEqual(dto.inputPacket.ownerTodoRequester);
  });

  it('schedules a coordinator tick and requester notification when an owner action is completed', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        coordinator: { enabled: true },
      },
    };
    const currentWorkItem = {
      status: 'READY',
      inputPacket: {
        ownerAction: {
          key: 'h1_goal_demo_account_a_activation',
          label: 'Activate account A',
        },
      },
    };
    const updatedWorkItem = {
      id: 'owner-action-1',
      title: 'Owner Action: Activate account A',
      status: 'ACCEPTED',
      workType: 'INTEGRATION',
      goalId: 'goal-1',
      inputPacket: {
        ownerAction: {
          ...currentWorkItem.inputPacket.ownerAction,
          completedAt: '2026-06-07T12:00:00.000Z',
        },
      },
    };
    const prisma = {
      projectWorkItem: {
        findUnique: jest.fn().mockResolvedValue(currentWorkItem),
        update: jest.fn().mockResolvedValue(updatedWorkItem),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.ensureProjectScopedReference = jest.fn().mockResolvedValue(null);
    runtimeService.applyCompletedProjectGlobalResourceRequest = jest.fn().mockResolvedValue(false);
    runtimeService.scheduleCoordinatorTick = jest.fn();
    runtimeService.scheduleLeadPollingWake = jest.fn();
    runtimeService.notifyOwnerTodoRequester = jest.fn().mockResolvedValue(true);

    const result = await runtimeService.updateWorkItem('project-1', 'owner-action-1', 'owner-user', {
      status: 'ACCEPTED',
      inputPacket: updatedWorkItem.inputPacket,
    });

    expect(result).toEqual(expect.objectContaining({
      id: 'owner-action-1',
      status: 'ACCEPTED',
    }));
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'owner todo owner-action-1 completed',
    );
    expect(runtimeService.scheduleLeadPollingWake).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'owner todo owner-action-1 completed',
    );
    expect(runtimeService.notifyOwnerTodoRequester).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      updatedWorkItem,
      'ownerAction',
    );
  });

  it('reconnects a stale requester runtime before notifying that an owner resource is complete', async () => {
    const staleSession = {
      provider: 'local-docker',
      status: 'IDLE',
      runtimeId: 'runtime-1',
      activeConversationId: 'conversation-1',
      apiHealth: { ok: false, authMismatch: true },
      dockerStatus: { running: true },
    };
    const healthySession = {
      ...staleSession,
      apiHealth: { ok: true },
      dockerStatus: { running: true },
    };
    const prisma = {
      projectMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'member-1',
          role: 'WORKER_AGENT',
          userId: 'agent-user',
          permissions: {},
        }),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.readRuntimeSession = jest.fn().mockReturnValue(staleSession);
    runtimeService.recoverPersistedRuntimeSession = jest.fn((session) => session);
    runtimeService.writeRuntimeSession = jest.fn();
    runtimeService.agentRuntimeLauncher = {
      inspect: jest.fn()
        .mockResolvedValueOnce(staleSession)
        .mockResolvedValueOnce(healthySession),
    };
    runtimeService.reconnectAgentRuntime = jest.fn().mockResolvedValue({ session: healthySession });
    runtimeService.latestRuntimeSessionForMember = jest.fn().mockResolvedValue(null);
    runtimeService.sendAgentRuntimeMessage = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.notifyOwnerTodoRequester(
      'project-1',
      'owner-user',
      {
        id: 'resource-1',
        title: 'Resource Request: Airtable PAT',
        status: 'ACCEPTED',
        inputPacket: {
          resourceRequest: {
            key: 'h1_goal_airtable_staging_pat',
            label: 'Airtable PAT',
            requester: {
              memberId: 'member-1',
              conversationId: 'conversation-1',
            },
          },
        },
      },
      'resourceRequest',
    );

    expect(result).toBe(true);
    expect(runtimeService.reconnectAgentRuntime).toHaveBeenCalledWith('project-1', 'member-1', 'owner-user');
    expect(runtimeService.sendAgentRuntimeMessage).toHaveBeenCalledWith(
      'project-1',
      'member-1',
      'owner-user',
      expect.objectContaining({
        conversationId: 'conversation-1',
        message: expect.stringContaining('h1_goal_airtable_staging_pat'),
      }),
    );
  });

  it('schedules a coordinator tick when a completed assignment makes a review item dispatchable', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        assignmentCompletedStatus: 'IN_REVIEW',
        dispatchRules: [
          {
            statuses: ['IN_REVIEW'],
            workTypes: ['SECURITY_TEST'],
            role: 'SECURITY_AUDITOR',
          },
        ],
        coordinator: { enabled: true },
      },
    };
    const prisma = {
      projectAssignment: {
        update: jest.fn().mockResolvedValue({
          id: 'assignment-1',
          status: 'COMPLETED',
          assigneeUser: null,
          assignedByUser: null,
        }),
      },
      projectWorkItem: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ status: 'IN_PROGRESS' })
          .mockResolvedValueOnce({ status: 'IN_REVIEW' }),
        update: jest.fn().mockResolvedValue({ id: 'work-1', status: 'IN_REVIEW' }),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({
      ownerId: 'owner-user',
      leadAgentUserId: 'lead-user',
      settings,
    });
    runtimeService.ensureProjectAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      assigneeUserId: 'worker-user',
      startedAt: new Date('2026-06-04T00:00:00.000Z'),
    });
    runtimeService.scheduleCoordinatorTick = jest.fn();

    await runtimeService.updateAssignment('project-1', 'work-1', 'assignment-1', 'worker-user', {
      status: 'COMPLETED',
    });

    expect(prisma.projectWorkItem.update).toHaveBeenCalledWith({
      where: { id: 'work-1' },
      data: { status: 'IN_REVIEW' },
    });
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'assignment assignment-1 updated work item work-1 to IN_REVIEW',
    );
  });

  it('does not reopen a terminal work item when a stale assignment becomes active', async () => {
    const settings = {
      workItemStatusFlow: {
        activeStatus: 'IN_PROGRESS',
        terminalStatuses: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
        coordinator: { enabled: true },
      },
    };
    const prisma = {
      projectAssignment: {
        update: jest.fn().mockResolvedValue({
          id: 'assignment-1',
          status: 'ACTIVE',
          assigneeUser: null,
          assignedByUser: null,
        }),
      },
      projectWorkItem: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ status: 'CANCELLED' })
          .mockResolvedValueOnce({ status: 'CANCELLED' }),
        update: jest.fn(),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({
      ownerId: 'owner-user',
      leadAgentUserId: 'lead-user',
      settings,
    });
    runtimeService.ensureProjectAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      assigneeUserId: 'worker-user',
      startedAt: null,
    });
    runtimeService.scheduleCoordinatorTick = jest.fn();

    await runtimeService.updateAssignment('project-1', 'work-1', 'assignment-1', 'worker-user', {
      status: 'ACTIVE',
    });

    expect(prisma.projectWorkItem.update).not.toHaveBeenCalled();
    expect(runtimeService.scheduleCoordinatorTick).not.toHaveBeenCalled();
  });

  it('wakes the assignee runtime when a manager manually starts an assignment', async () => {
    const settings = {
      workItemStatusFlow: {
        activeStatus: 'IN_PROGRESS',
      },
    };
    const prisma = {
      projectAssignment: {
        update: jest.fn().mockResolvedValue({
          id: 'assignment-1',
          workItemId: 'work-1',
          status: 'ACTIVE',
          assigneeUserId: 'worker-user',
          contextPacket: { workItem: { title: 'Research target' } },
          assigneeUser: null,
          assignedByUser: null,
        }),
      },
      projectWorkItem: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ status: 'ASSIGNED', title: 'Research target', workType: 'SECURITY_TEST', goalId: 'goal-1', featureId: null })
          .mockResolvedValueOnce({ status: 'ASSIGNED' }),
        update: jest.fn().mockResolvedValue({ id: 'work-1', status: 'IN_PROGRESS' }),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({
      ownerId: 'owner-user',
      leadAgentUserId: 'lead-user',
      settings,
    });
    runtimeService.ensureProjectAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'work-1',
      status: 'PROPOSED',
      assigneeUserId: 'worker-user',
      startedAt: null,
      contextPacket: { workItem: { title: 'Research target' } },
    });
    runtimeService.recordWorkItemEvent = jest.fn().mockResolvedValue(undefined);
    runtimeService.assignmentAssigneeRuntimeState = jest.fn().mockResolvedValue({
      available: true,
      memberId: 'worker-member',
      session: { provider: 'local-runner' },
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    await runtimeService.updateAssignment('project-1', 'work-1', 'assignment-1', 'owner-user', {
      status: 'ACTIVE',
    });

    expect(runtimeService.assignmentAssigneeRuntimeState).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ id: 'assignment-1', assigneeUserId: 'worker-user' }),
    );
    expect(runtimeService.wakeRuntimeForAssignment).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'worker-member',
      expect.objectContaining({
        id: 'assignment-1',
        workItemId: 'work-1',
        status: 'ACTIVE',
      }),
      { waitForFirstResponse: false },
    );
  });

  it('does not move a terminal work item back to review when a stale assignment completes', async () => {
    const settings = {
      workItemStatusFlow: {
        assignmentCompletedStatus: 'IN_REVIEW',
        terminalStatuses: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
        coordinator: { enabled: true },
      },
    };
    const prisma = {
      projectAssignment: {
        update: jest.fn().mockResolvedValue({
          id: 'assignment-1',
          status: 'COMPLETED',
          assigneeUser: null,
          assignedByUser: null,
        }),
      },
      projectWorkItem: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ status: 'ACCEPTED' })
          .mockResolvedValueOnce({ status: 'ACCEPTED' }),
        update: jest.fn(),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectAccess = jest.fn().mockResolvedValue({
      ownerId: 'owner-user',
      leadAgentUserId: 'lead-user',
      settings,
    });
    runtimeService.ensureProjectAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      assigneeUserId: 'worker-user',
      startedAt: new Date('2026-06-04T00:00:00.000Z'),
    });
    runtimeService.scheduleCoordinatorTick = jest.fn();

    await runtimeService.updateAssignment('project-1', 'work-1', 'assignment-1', 'worker-user', {
      status: 'COMPLETED',
    });

    expect(prisma.projectWorkItem.update).not.toHaveBeenCalled();
    expect(runtimeService.scheduleCoordinatorTick).not.toHaveBeenCalled();
  });

  it('coordinator launches, assigns, and wakes the matching role for an unassigned item', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'work-1',
            title: 'Research target',
            status: 'READY',
            workType: 'SECURITY_TEST',
            ownerId: null,
            assignments: [],
            goal: { id: 'goal-1', title: 'Target goal' },
          },
        ]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'WORKER_AGENT' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 0, maxActiveAgents: 10 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn().mockResolvedValue({
      memberId: 'worker-member',
      userId: 'worker-user',
      session: { runtimeId: 'runtime-1' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'work-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(runtimeService.launchAgentRuntime).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      expect.objectContaining({
        role: 'WORKER_AGENT',
        llmConfigId: 'model-config-1',
        launchMode: 'local-docker',
        agentType: 'pi',
        launchSource: 'coordinator',
      }),
    );
    expect(runtimeService.createAssignment).toHaveBeenCalledWith(
      'project-1',
      'work-1',
      'owner-user',
      expect.objectContaining({
        assigneeUserId: 'worker-user',
        role: 'WORKER_AGENT',
        targetRuntimeId: 'runtime-1',
      }),
    );
    expect(runtimeService.wakeRuntimeForAssignment).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'worker-member',
      expect.objectContaining({ id: 'assignment-1' }),
      { waitForFirstResponse: false },
    );
    expect(result.dispatched[0]).toEqual(expect.objectContaining({ assignmentId: 'assignment-1', workItemId: 'work-1' }));
    expect(agentWorkspaceClient.recordProjectEvent).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        type: 'COORDINATOR_DISPATCHED_ITEM',
        refType: 'WORK_ITEM',
        refId: 'work-1',
      }),
    );
  });

  it('launches an automatic role runtime into an existing pending member', async () => {
    const pendingMember = {
      id: 'pending-planner-member',
      userId: 'planner-user',
      role: 'PLANNER_AGENT',
      permissions: {
        agentRoleName: { displayName: 'Morgan' },
      },
      user: { displayName: 'Morgan', email: 'agent+planner@aifactory.local' },
    };
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ settings: {}, budgetCurrency: 'AIC' }),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([pendingMember]),
        findFirst: jest.fn().mockResolvedValue({ id: 'owner-member', userId: 'owner-user', role: 'OWNER' }),
      },
    };
    const agentWorkspaceClient = {
      registerRuntime: jest.fn().mockResolvedValue({}),
      issueAccessGrant: jest.fn().mockResolvedValue({ grantId: 'grant-1' }),
      mintAccessToken: jest.fn().mockResolvedValue({ token: 'workspace-token' }),
      getConfiguredBaseUrl: jest.fn().mockReturnValue('http://agent-workspace:3010'),
      heartbeatRuntime: jest.fn().mockResolvedValue({}),
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const apiConfigService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'model-config-1',
        name: 'Model config',
        apiType: 'openai',
        apiUrl: 'https://models.example.test',
        apiKey: 'test-key',
        modelName: 'gpt-test',
      }),
      activate: jest.fn().mockResolvedValue({}),
    };
    const agentRuntimeLauncher = {
      runtimeFeatureSupport: jest.fn().mockReturnValue({
        agentType: 'pi',
        supportedFeatures: ['filesystemSkills', 'skillPrompts', 'projectFiles', 'projectGlobals'],
        unsupportedFeatures: [],
        notes: [],
      }),
      defaultImage: jest.fn().mockReturnValue('aifactory/pi-agent:local'),
      launch: jest.fn().mockResolvedValue({
        runtimeId: 'runtime-1',
        provider: 'local-docker',
        agentType: 'pi',
        status: 'READY',
        launchedAt: '2026-06-09T08:00:00.000Z',
        conversations: [],
      }),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      agentRuntimeLauncher as never,
      apiConfigService as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'PLANNER_AGENT' }]);
    runtimeService.ensureRuntimeBudgetForLaunch = jest.fn().mockResolvedValue({
      budgetAmount: 0,
      budgetCurrency: 'AIC',
      committedByOtherMembers: 0,
      requestedAmount: 0,
      remainingAfterLaunch: 0,
      dailyAgentCostAmount: 0,
    });
    runtimeService.findOrCreateAgentMember = jest.fn();
    runtimeService.projectRoleConfigForRole = jest.fn().mockResolvedValue({
      role: 'PLANNER_AGENT',
      skillBundleRefs: ['skill://agent-workspace', 'role-skill://agent-workspace-planner'],
      capabilityBundleRefs: [],
      initialPrompt: '',
      polling: { enabled: false },
    });
    runtimeService.resolveRoleCapabilityBundles = jest.fn().mockResolvedValue({
      refs: [],
      manifests: [],
      skillBundleRefs: ['skill://agent-workspace', 'role-skill://agent-workspace-planner'],
      requiredScopes: [],
      requiredProjectGlobals: [],
    });
    runtimeService.projectSkillOverridesForRole = jest.fn().mockResolvedValue([]);
    runtimeService.scopesForRole = jest.fn().mockReturnValue(['PROJECT_READ_BASIC']);
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.visibleProjectGlobalsForRuntime = jest.fn().mockResolvedValue([]);
    runtimeService.installResolvedCapabilityBundles = jest.fn().mockResolvedValue(undefined);
    runtimeService.writeRuntimeSession = jest.fn().mockResolvedValue(undefined);

    const result = await runtimeService.launchAgentRuntime('project-1', 'owner-user', {
      role: 'PLANNER_AGENT',
      llmConfigId: 'model-config-1',
      launchMode: 'local-docker',
      agentType: 'pi',
      launchSource: 'coordinator',
    });

    expect(runtimeService.findOrCreateAgentMember).not.toHaveBeenCalled();
    expect(runtimeService.ensureRuntimeBudgetForLaunch).toHaveBeenCalledWith(
      'project-1',
      'pending-planner-member',
      1,
      'local-docker',
    );
    expect(agentWorkspaceClient.registerRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'pending-planner-member' }),
    );
    expect(agentRuntimeLauncher.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 'pending-planner-member',
        userId: 'planner-user',
        role: 'PLANNER_AGENT',
        agentDisplayName: 'Morgan',
      }),
    );
    expect(result.memberId).toBe('pending-planner-member');
  });

  it('coordinator counts queued local-runner role members before launching another runtime', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
            launchMode: 'local-runner',
            agentType: 'pi',
            maxAgents: 1,
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1, maxAgentsByRole: { WORKER_AGENT: 1 } },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'work-1',
            title: 'Research target',
            status: 'READY',
            workType: 'SECURITY_TEST',
            ownerId: null,
            assignments: [],
            goal: { id: 'goal-1', title: 'Target goal' },
          },
        ]),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'queued-worker-member',
            userId: 'queued-worker-user',
            role: 'WORKER_AGENT',
            permissions: {
              runtimeSession: {
                provider: 'local-runner',
                runtimeId: 'queued-runtime',
                status: 'WAITING_LOCAL_RUNNER',
              },
            },
          },
        ]),
      },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'WORKER_AGENT' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn();
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn();
    runtimeService.launchAgentRuntime = jest.fn();
    runtimeService.createAssignment = jest.fn();
    runtimeService.wakeRuntimeForAssignment = jest.fn();

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).not.toHaveBeenCalled();
    expect(result.dispatched).toEqual([]);
    expect(result.blocked[0]).toEqual(expect.objectContaining({
      reason: 'ROLE_CAPACITY_REACHED',
      role: 'WORKER_AGENT',
      activeForRole: 1,
      maxAgentsForRole: 1,
    }));
  });

  it('coordinator reuses an idle role runtime that keeps its last conversation id', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['OPPORTUNITY_DISCOVERY'],
            role: 'PLANNER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
            maxAgents: 1,
            forceLaunchNew: false,
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1, maxAgentsByRole: { PLANNER_AGENT: 1 } },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'discovery-1',
            title: 'HackerOne Opportunity Discovery',
            status: 'READY',
            workType: 'OPPORTUNITY_DISCOVERY',
            ownerId: null,
            assignments: [],
            goal: null,
          },
        ]),
      },
      projectMember: {
        findMany: jest.fn()
          .mockResolvedValueOnce([
            {
              id: 'planner-member',
              userId: 'planner-user',
              role: 'PLANNER_AGENT',
              permissions: {
                runtimeSession: {
                  runtimeId: 'runtime-1',
                  status: 'IDLE',
                  agentType: 'pi',
                  activeRequestId: null,
                  activeRequestConversationId: 'default-runtime-1',
                },
              },
            },
          ]),
      },
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'PLANNER_AGENT' }]);
    runtimeService.activeCoordinatorRoleCount = jest.fn();
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn();
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn();
    runtimeService.launchAgentRuntime = jest.fn();
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'discovery-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({
      accepted: true,
      conversationId: 'default-runtime-1',
    });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
    expect(runtimeService.activeCoordinatorRoleCount).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).toHaveBeenCalledWith(
      'project-1',
      'discovery-1',
      'owner-user',
      expect.objectContaining({
        assigneeUserId: 'planner-user',
        role: 'PLANNER_AGENT',
        targetRuntimeId: 'runtime-1',
      }),
    );
    expect(result.blocked).toEqual([]);
    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-1',
      dispatchMode: 'reuse-idle',
      memberId: 'planner-member',
      role: 'PLANNER_AGENT',
      workItemId: 'discovery-1',
    }));
  });

  it('coordinator skips duplicate concurrent ticks for the same project', async () => {
    const runtimeService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings: {} });
    runtimeService.launchAgentRuntime = jest.fn();
    runtimeService.createAssignment = jest.fn();
    runtimeService.coordinatorTicksInFlight.add('project-1');

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(result.dispatched).toEqual([]);
    expect(result.skipped).toContainEqual(expect.objectContaining({ reason: 'TICK_IN_PROGRESS' }));
    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).not.toHaveBeenCalled();
  });

  it('coordinator scans past owner-only items to find dispatchable work', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const ownerResourceItems = Array.from({ length: 30 }, (_, index) => ({
      id: `resource-${index}`,
      title: `Resource Request: Account ${index}`,
      status: 'READY',
      workType: 'INTEGRATION',
      priority: 100 - index,
      goalId: 'goal-1',
      ownerId: 'owner-user',
      owner: { id: 'owner-user', role: 'ADMIN' },
      inputPacket: {
        resourceRequest: {
          key: `resource_${index}`,
          label: `Resource ${index}`,
          category: 'hackerone-goal',
        },
      },
      assignments: [],
      goal: { id: 'goal-1', title: 'Target goal' },
    }));
    const ownerAction = {
      id: 'owner-action-1',
      title: 'Owner Action: confirm external step',
      status: 'READY',
      workType: 'INTEGRATION',
      priority: 110,
      goalId: 'goal-1',
      ownerId: 'owner-user',
      owner: { id: 'owner-user', role: 'ADMIN' },
      inputPacket: {
        ownerAction: {
          key: 'confirm_external_step',
          label: 'Confirm external step',
          type: 'EXTERNAL_STEP',
        },
      },
      assignments: [],
      goal: { id: 'goal-1', title: 'Target goal' },
    };
    const dispatchableItem = {
      id: 'work-1',
      title: 'Research target',
      status: 'READY',
      workType: 'SECURITY_TEST',
      priority: 1,
      ownerId: null,
      assignments: [],
      goal: { id: 'goal-1', title: 'Target goal' },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([ownerAction, ...ownerResourceItems, dispatchableItem]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'WORKER_AGENT' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 0, maxActiveAgents: 10 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn().mockResolvedValue({
      memberId: 'worker-member',
      userId: 'worker-user',
      session: { runtimeId: 'runtime-1' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'work-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');
    const query = prisma.projectWorkItem.findMany.mock.calls[0]?.[0];

    expect(query.take).toBeGreaterThanOrEqual(200);
    expect(runtimeService.launchAgentRuntime).toHaveBeenCalled();
    expect(result.dispatched[0]).toEqual(expect.objectContaining({ workItemId: 'work-1' }));
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ workItemId: 'owner-action-1', reason: 'OWNER_ACTION_PENDING' }),
      expect.objectContaining({ workItemId: 'resource-0', reason: 'OWNER_RESOURCE_REQUEST' }),
    ]));
  });

  it('finds idle coordinator runtimes without sorting project members in the database', async () => {
    const prisma = {
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'busy-member',
            userId: 'busy-user',
            role: 'WORKER_AGENT',
            permissions: {
              runtimeSession: {
                runtimeId: 'busy-runtime',
                status: 'TYPING',
                agentType: 'pi',
              },
            },
          },
          {
            id: 'idle-member',
            userId: 'idle-user',
            role: 'WORKER_AGENT',
            permissions: {
              runtimeSession: {
                runtimeId: 'idle-runtime',
                status: 'IDLE',
                agentType: 'pi',
              },
            },
          },
        ]),
      },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    const member = await runtimeService.findIdleCoordinatorRuntime('project-1', 'WORKER_AGENT', 'pi', {});
    const query = prisma.projectMember.findMany.mock.calls[0]?.[0];

    expect(query).toEqual(expect.objectContaining({
      where: { projectId: 'project-1', role: 'WORKER_AGENT', removedAt: null },
      select: { id: true, userId: true, role: true, permissions: true },
    }));
    expect(query).not.toHaveProperty('orderBy');
    expect(member).toEqual(expect.objectContaining({
      id: 'idle-member',
      userId: 'idle-user',
      session: expect.objectContaining({ runtimeId: 'idle-runtime' }),
    }));
  });

  it('does not reuse idle local-docker runtimes whose containers are unavailable', async () => {
    const txProjectMemberUpdate = jest.fn().mockResolvedValue({});
    const runtimeSession = {
      runtimeId: 'idle-runtime',
      provider: 'local-docker',
      status: 'IDLE',
      agentType: 'pi',
      activeRequestId: null,
    };
    const prisma = {
      $transaction: jest.fn(async (callback: any) => callback({
        $queryRaw: jest.fn(),
        projectMember: {
          findUnique: jest.fn().mockResolvedValue({
            permissions: { runtimeSession },
          }),
          update: txProjectMemberUpdate,
        },
      })),
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'idle-member',
            userId: 'idle-user',
            role: 'SECURITY_AUDITOR',
            permissions: { runtimeSession },
          },
        ]),
      },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentRuntimeLauncher = {
      inspect: jest.fn().mockRejectedValue(new Error('container not found')),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      agentRuntimeLauncher as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    const member = await runtimeService.findIdleCoordinatorRuntime('project-1', 'SECURITY_AUDITOR', 'pi', {});

    expect(member).toBeNull();
    expect(agentRuntimeLauncher.inspect).toHaveBeenCalledWith(expect.objectContaining({ runtimeId: 'idle-runtime' }));
    expect(txProjectMemberUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'idle-member' },
      data: expect.objectContaining({
        permissions: expect.objectContaining({
          runtimeSession: expect.objectContaining({
            status: 'STOPPED',
            currentActivity: 'Runtime container is unavailable',
          }),
        }),
      }),
    }));
  });

  it('does not count idle coordinator runtimes against role parallel capacity', async () => {
    const prisma = {
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            permissions: {
              runtimeSession: {
                status: 'IDLE',
                activeRequestId: null,
              },
            },
          },
          {
            permissions: {
              runtimeSession: {
                status: 'READY',
                activeRequestId: null,
              },
            },
          },
          {
            permissions: {
              runtimeSession: {
                status: 'TYPING',
                activeRequestId: 'request-1',
              },
            },
          },
        ]),
      },
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([
          { workItem: { status: 'ACCEPTED' } },
        ]),
      },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    await expect(runtimeService.activeCoordinatorRoleCount('project-1', 'SECURITY_AUDITOR', {})).resolves.toBe(1);
  });

  it('coordinator does not reuse idle runtimes when forceLaunchNew is default true', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'target-1',
            title: 'Independent target',
            status: 'READY',
            workType: 'SECURITY_TEST',
            ownerId: null,
            assignments: [],
            goal: null,
          },
        ]),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'idle-worker-member',
            userId: 'idle-worker-user',
            role: 'WORKER_AGENT',
            permissions: {
              runtimeSession: {
                runtimeId: 'idle-runtime',
                status: 'IDLE',
                agentType: 'pi',
                activeRequestId: null,
                activeRequestConversationId: 'default-idle-runtime',
              },
            },
          },
        ]),
      },
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'WORKER_AGENT' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 0, maxActiveAgents: 10 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn().mockResolvedValue({
      memberId: 'fresh-worker-member',
      userId: 'fresh-worker-user',
      session: { runtimeId: 'fresh-runtime' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'target-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({
      accepted: true,
      conversationId: 'default-fresh-runtime',
    });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    expect(runtimeService.launchAgentRuntime).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      expect.objectContaining({
        role: 'WORKER_AGENT',
        llmConfigId: 'model-config-1',
      }),
    );
    expect(runtimeService.createAssignment).toHaveBeenCalledWith(
      'project-1',
      'target-1',
      'owner-user',
      expect.objectContaining({
        assigneeUserId: 'fresh-worker-user',
        targetRuntimeId: 'fresh-runtime',
      }),
    );
    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-1',
      dispatchMode: 'launch-new',
      memberId: 'fresh-worker-member',
      workItemId: 'target-1',
    }));
  });

  it('coordinator reuses an idle worker for a same-item NEEDS_REVISION continuation', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        reviewChangesRequestedStatus: 'NEEDS_REVISION',
        statuses: [
          { id: 'READY', category: 'claimable' },
          { id: 'NEEDS_REVISION', category: 'claimable' },
          { id: 'IN_PROGRESS', category: 'active' },
          { id: 'IN_REVIEW', category: 'feedback' },
          { id: 'ACCEPTED', category: 'completed', terminal: true },
        ],
        dispatchRules: [
          {
            statuses: ['READY', 'NEEDS_REVISION'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
            forceLaunchNew: true,
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'revision-1',
            title: 'Same target revision',
            status: 'NEEDS_REVISION',
            workType: 'SECURITY_TEST',
            ownerId: null,
            assignments: [
              {
                id: 'worker-completed-1',
                role: 'WORKER_AGENT',
                status: 'COMPLETED',
                assigneeUserId: 'idle-worker-user',
                createdAt: new Date('2026-06-07T10:00:00.000Z'),
              },
            ],
            goal: null,
          },
        ]),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'idle-worker-member',
            userId: 'idle-worker-user',
            role: 'WORKER_AGENT',
            permissions: {
              runtimeSession: {
                runtimeId: 'idle-worker-runtime',
                status: 'IDLE',
                agentType: 'pi',
                activeRequestId: null,
              },
            },
          },
        ]),
      },
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'WORKER_AGENT' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 6, maxActiveAgents: 6 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn();
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'revision-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(runtimeService.ensureProjectActiveAgentCapacity).not.toHaveBeenCalled();
    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).toHaveBeenCalledWith(
      'project-1',
      'revision-1',
      'owner-user',
      expect.objectContaining({
        assigneeUserId: 'idle-worker-user',
        targetRuntimeId: 'idle-worker-runtime',
      }),
    );
    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-1',
      dispatchMode: 'reuse-idle',
      memberId: 'idle-worker-member',
      workItemId: 'revision-1',
    }));
  });

  it('coordinator reuses idle auditor runtimes for feedback even when forceLaunchNew is true', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['IN_REVIEW'],
            workTypes: ['SECURITY_TEST'],
            role: 'SECURITY_AUDITOR',
            launchMode: 'local-docker',
            agentType: 'pi',
            forceLaunchNew: true,
            allowOwnerOwned: true,
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'review-work-1',
            title: 'Review worker handoff',
            status: 'IN_REVIEW',
            workType: 'SECURITY_TEST',
            ownerId: 'worker-user',
            assignments: [],
            goal: null,
          },
        ]),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'idle-auditor-member',
            userId: 'idle-auditor-user',
            role: 'SECURITY_AUDITOR',
            permissions: {
              runtimeSession: {
                runtimeId: 'idle-auditor-runtime',
                status: 'IDLE',
                agentType: 'pi',
                activeRequestId: null,
              },
            },
          },
        ]),
      },
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'SECURITY_AUDITOR' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 6, maxActiveAgents: 6 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn();
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'review-work-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(runtimeService.ensureProjectActiveAgentCapacity).not.toHaveBeenCalled();
    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).toHaveBeenCalledWith(
      'project-1',
      'review-work-1',
      'owner-user',
      expect.objectContaining({
        assigneeUserId: 'idle-auditor-user',
        targetRuntimeId: 'idle-auditor-runtime',
      }),
    );
    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-1',
      dispatchMode: 'reuse-idle',
      memberId: 'idle-auditor-member',
      workItemId: 'review-work-1',
    }));
  });

  it('coordinator reuses idle auditor runtimes for audit items when project capacity is full', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['SECURITY_AUDIT'],
            role: 'SECURITY_AUDITOR',
            launchMode: 'local-docker',
            agentType: 'pi',
            forceLaunchNew: true,
            allowOwnerOwned: true,
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-work-1',
            title: 'Audit testing evidence',
            status: 'READY',
            workType: 'SECURITY_AUDIT',
            ownerId: null,
            assignments: [],
            goal: null,
          },
        ]),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'idle-auditor-member',
            userId: 'idle-auditor-user',
            role: 'SECURITY_AUDITOR',
            permissions: {
              runtimeSession: {
                runtimeId: 'idle-auditor-runtime',
                status: 'IDLE',
                agentType: 'pi',
                activeRequestId: null,
              },
            },
          },
        ]),
      },
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'SECURITY_AUDITOR' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockRejectedValue(new Error('Project active agent limit reached'));
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn();
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'audit-work-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(runtimeService.ensureProjectActiveAgentCapacity).not.toHaveBeenCalled();
    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).toHaveBeenCalledWith(
      'project-1',
      'audit-work-1',
      'owner-user',
      expect.objectContaining({
        assigneeUserId: 'idle-auditor-user',
        targetRuntimeId: 'idle-auditor-runtime',
      }),
    );
    expect(result.blocked).toEqual([]);
    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-1',
      dispatchMode: 'reuse-idle',
      memberId: 'idle-auditor-member',
      workItemId: 'audit-work-1',
    }));
  });

  it('coordinator skips stale planner items when the goal already has active work', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['PLANNING'],
            role: 'PLANNER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'planning-1',
            title: 'Plan Goal: Target',
            status: 'READY',
            workType: 'PLANNING',
            ownerId: null,
            goalId: 'goal-1',
            assignments: [],
            goal: { id: 'goal-1', title: 'Target', description: '', status: 'OPEN' },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      projectMember: { findMany: jest.fn() },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'PLANNER_AGENT' }]);
    runtimeService.launchAgentRuntime = jest.fn();
    runtimeService.createAssignment = jest.fn();
    runtimeService.wakeRuntimeForAssignment = jest.fn();

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(prisma.projectWorkItem.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        projectId: 'project-1',
        goalId: 'goal-1',
        workType: { not: 'PLANNING' },
      }),
    }));
    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
    expect(runtimeService.createAssignment).not.toHaveBeenCalled();
    expect(result.dispatched).toEqual([]);
    expect(result.skipped).toEqual([
      expect.objectContaining({ workItemId: 'planning-1', reason: 'GOAL_ALREADY_HAS_ACTIVE_WORK' }),
    ]);
  });

  it('coordinator creates and dispatches planner items for goals without active work items', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['PLANNING'],
            role: 'PLANNER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const createdPlannerItem = {
      id: 'planning-1',
      title: 'Plan Goal: Target goal',
      status: 'READY',
      workType: 'PLANNING',
      ownerId: null,
      assignments: [],
      goal: { id: 'goal-1', title: 'Target goal' },
    };
    const prisma = {
      projectGoal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'goal-1',
            title: 'Target goal',
            description: 'Research this target',
            priority: 7,
            status: 'OPEN',
            createdAt: new Date('2026-06-04T00:00:00.000Z'),
          },
        ]),
      },
      projectWorkItem: {
        create: jest.fn().mockResolvedValue(createdPlannerItem),
        findMany: jest.fn().mockResolvedValue([createdPlannerItem]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'PLANNER_AGENT' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 0, maxActiveAgents: 10 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn().mockResolvedValue({
      memberId: 'planner-member',
      userId: 'planner-user',
      session: { runtimeId: 'planner-runtime-1' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'planning-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(prisma.projectGoal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        projectId: 'project-1',
        workItems: expect.objectContaining({
          none: expect.objectContaining({
            status: { notIn: expect.arrayContaining(['ACCEPTED', 'REJECTED', 'CANCELLED']) },
          }),
        }),
      }),
    }));
    expect(prisma.projectWorkItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        goalId: 'goal-1',
        workType: 'PLANNING',
        status: 'READY',
        inputPacket: expect.objectContaining({
          source: 'project-coordinator',
          planningMode: 'goal-analysis',
        }),
      }),
    }));
    expect(runtimeService.launchAgentRuntime).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      expect.objectContaining({
        role: 'PLANNER_AGENT',
        llmConfigId: 'model-config-1',
        launchMode: 'local-docker',
        agentType: 'pi',
        launchSource: 'coordinator',
      }),
    );
    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-1',
      workItemId: 'planning-1',
      role: 'PLANNER_AGENT',
    }));
  });

  it('coordinator does not recreate planner items for goals already analyzed by a prior planner item', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        terminalStatuses: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['PLANNING'],
            role: 'PLANNER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectGoal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'goal-1',
            title: 'Already analyzed goal',
            description: 'Research this target',
            priority: 7,
            status: 'OPEN',
            createdAt: new Date('2026-06-04T00:00:00.000Z'),
            workItems: [
              {
                id: 'planning-previous',
                title: 'Plan Goal: Already analyzed goal',
                status: 'ACCEPTED',
                inputPacket: {
                  source: 'project-coordinator',
                  planningMode: 'goal-analysis',
                },
              },
            ],
          },
        ]),
      },
      projectWorkItem: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      { recordProjectEvent: jest.fn().mockResolvedValue({}) } as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'PLANNER_AGENT' }]);

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(prisma.projectWorkItem.create).not.toHaveBeenCalled();
    expect(result.dispatched).toEqual([]);
  });

  it('coordinator does not create generic planner items for completed opportunity-discovery goals', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        terminalStatuses: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['PLANNING'],
            role: 'PLANNER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectGoal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'goal-1',
            title: 'HackerOne opportunity research',
            description: 'Screen opportunities and create target goals',
            priority: 7,
            status: 'OPEN',
            createdAt: new Date('2026-06-04T00:00:00.000Z'),
            workItems: [
              {
                id: 'discovery-previous',
                title: 'HackerOne Opportunity Discovery',
                status: 'ACCEPTED',
                workType: 'OPPORTUNITY_DISCOVERY',
                inputPacket: {},
              },
            ],
          },
        ]),
      },
      projectWorkItem: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      { recordProjectEvent: jest.fn().mockResolvedValue({}) } as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'PLANNER_AGENT' }]);

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(prisma.projectWorkItem.create).not.toHaveBeenCalled();
    expect(result.dispatched).toEqual([]);
  });

  it('coordinator defers planner items for recently agent-created goals', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['PLANNING'],
            role: 'PLANNER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectGoal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'goal-1',
            title: 'Fresh target goal',
            description: 'Research this target',
            priority: 7,
            status: 'OPEN',
            createdAt: new Date(),
            createdBy: { role: 'AI_AGENT' },
          },
        ]),
      },
      projectWorkItem: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      { recordProjectEvent: jest.fn().mockResolvedValue({}) } as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'PLANNER_AGENT' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 0, maxActiveAgents: 10 });
    runtimeService.scheduleCoordinatorTick = jest.fn();
    runtimeService.plannerGoalAnalysisGraceMs = 60_000;

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(prisma.projectWorkItem.create).not.toHaveBeenCalled();
    expect(runtimeService.scheduleCoordinatorTick).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      'recent agent-created goal planner grace elapsed',
      61_000,
    );
    expect(result.dispatched).toEqual([]);
  });

  it('coordinator blocks dispatch when required work-item globals are missing', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const workItem = {
      id: 'work-1',
      title: 'Authenticated target test',
      status: 'READY',
      workType: 'SECURITY_TEST',
      goalId: 'goal-1',
      ownerId: null,
      inputPacket: { requiredGlobals: ['h1_goal_target_api_key'] },
      assignments: [],
      goal: { id: 'goal-1', title: 'Target goal' },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([workItem]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'WORKER_AGENT' }]);
    runtimeService.launchAgentRuntime = jest.fn();

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
    expect(result.dispatched).toEqual([]);
    expect(result.blocked[0]).toEqual(expect.objectContaining({
      workItemId: 'work-1',
      reason: 'RESOURCE_GLOBALS_MISSING',
      missingRequiredGlobals: ['h1_goal_target_api_key'],
    }));
    expect(agentWorkspaceClient.recordProjectEvent).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        type: 'COORDINATOR_BLOCKED',
        refType: 'WORK_ITEM',
        refId: 'work-1',
        payload: expect.objectContaining({
          reason: 'RESOURCE_GLOBALS_MISSING',
          missingRequiredGlobals: ['h1_goal_target_api_key'],
        }),
      }),
    );
  });

  it('coordinator can redispatch a failed AI-owned claimable item', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['READY', 'NEEDS_REVISION'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'work-1',
            title: 'Research target',
            status: 'NEEDS_REVISION',
            workType: 'SECURITY_TEST',
            ownerId: 'previous-worker-user',
            owner: { id: 'previous-worker-user', role: 'AI_AGENT' },
            assignments: [
              {
                id: 'failed-assignment-1',
                role: 'WORKER_AGENT',
                status: 'FAILED',
                assigneeUserId: 'previous-worker-user',
              },
            ],
            goal: { id: 'goal-1', title: 'Target goal' },
          },
        ]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'WORKER_AGENT' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 0, maxActiveAgents: 10 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn().mockResolvedValue({
      memberId: 'worker-member-2',
      userId: 'worker-user-2',
      session: { runtimeId: 'runtime-2' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-2',
      workItemId: 'work-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(result.skipped).toEqual([]);
    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-2',
      role: 'WORKER_AGENT',
      workItemId: 'work-1',
    }));
    expect(runtimeService.launchAgentRuntime).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      expect.objectContaining({
        role: 'WORKER_AGENT',
        llmConfigId: 'model-config-1',
        launchMode: 'local-docker',
        agentType: 'pi',
        launchSource: 'coordinator',
      }),
    );
  });

  it('coordinator can dispatch owner-owned review items when the template rule allows it', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['IN_REVIEW'],
            workTypes: ['SECURITY_TEST'],
            role: 'SECURITY_AUDITOR',
            launchMode: 'local-docker',
            agentType: 'pi',
            allowOwnerOwned: true,
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'review-work-1',
            title: 'Review worker handoff',
            status: 'IN_REVIEW',
            workType: 'SECURITY_TEST',
            ownerId: 'worker-user',
            assignments: [],
            goal: { id: 'goal-1', title: 'Target goal' },
          },
        ]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'SECURITY_AUDITOR' }]);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 0, maxActiveAgents: 10 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn().mockResolvedValue({
      memberId: 'auditor-member',
      userId: 'auditor-user',
      session: { runtimeId: 'runtime-1' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'review-work-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-1',
      role: 'SECURITY_AUDITOR',
      workItemId: 'review-work-1',
    }));
    expect(runtimeService.launchAgentRuntime).toHaveBeenCalledWith(
      'project-1',
      'owner-user',
      expect.objectContaining({
        role: 'SECURITY_AUDITOR',
        llmConfigId: 'model-config-1',
        launchMode: 'local-docker',
        agentType: 'pi',
        launchSource: 'coordinator',
      }),
    );
  });

  it('coordinator reconciles stale open assignments before dispatch', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        assignmentFailedStatus: 'NEEDS_REVISION',
        dispatchRules: [
          {
            statuses: ['READY', 'NEEDS_REVISION'],
            workTypes: ['SECURITY_TEST'],
            role: 'WORKER_AGENT',
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'assignment-1',
            projectId: 'project-1',
            workItemId: 'work-1',
            assigneeUserId: 'worker-user',
            role: 'WORKER_AGENT',
            status: 'ACTIVE',
            contextPacket: {},
            workItem: {
              id: 'work-1',
              title: 'Stale research',
              status: 'IN_PROGRESS',
              workType: 'SECURITY_TEST',
            },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      projectMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'worker-member', permissions: {} }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectWorkItem: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'WORKER_AGENT' }]);
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(prisma.projectAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'assignment-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        contextPacket: expect.objectContaining({
          staleDispatch: expect.objectContaining({
            reason: 'runtime_unavailable',
            source: 'coordinator-tick',
            runtimeMemberId: 'worker-member',
          }),
        }),
      }),
    }));
    expect(prisma.projectWorkItem.update).toHaveBeenCalledWith({
      where: { id: 'work-1' },
      data: { status: 'NEEDS_REVISION' },
    });
    expect(result.skipped).toContainEqual(expect.objectContaining({
      assignmentId: 'assignment-1',
      reason: 'RECONCILED_STALE_ASSIGNMENT',
    }));
    expect(agentWorkspaceClient.recordProjectEvent).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        type: 'COORDINATOR_RECONCILED_STALE_ASSIGNMENT',
        refId: 'work-1',
      }),
    );
  });

  it('lets HackerOne project globals raise coordinator role concurrency caps', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        dispatchRules: [
          {
            statuses: ['IN_REVIEW'],
            workTypes: ['SECURITY_TEST'],
            role: 'SECURITY_AUDITOR',
            launchMode: 'local-docker',
            agentType: 'pi',
            maxAgents: 2,
            allowOwnerOwned: true,
          },
        ],
        coordinator: {
          enabled: true,
          maxDispatchesPerTick: 1,
          maxAgentsByRole: { SECURITY_AUDITOR: 2 },
        },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'review-work-1',
            title: 'Review worker handoff',
            status: 'IN_REVIEW',
            workType: 'SECURITY_TEST',
            ownerId: 'worker-user',
            assignments: [],
            goal: { id: 'goal-1', title: 'Target goal' },
          },
        ]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([
      { key: 'h1_max_parallel_auditors', value: '3' },
    ]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'SECURITY_AUDITOR' }]);
    runtimeService.findIdleCoordinatorRuntime = jest.fn().mockResolvedValue(null);
    runtimeService.activeCoordinatorRoleCount = jest.fn().mockResolvedValue(2);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 2, maxActiveAgents: 10 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn().mockResolvedValue({
      memberId: 'auditor-member',
      userId: 'auditor-user',
      session: { runtimeId: 'runtime-1' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-1',
      workItemId: 'review-work-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(result.blocked).toEqual([]);
    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-1',
      role: 'SECURITY_AUDITOR',
      workItemId: 'review-work-1',
    }));
    expect(runtimeService.activeCoordinatorRoleCount).toHaveBeenCalledWith('project-1', 'SECURITY_AUDITOR', settings);
  });

  it('coordinator does not repeat a completed feedback-role assignment by default', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        statuses: [
          { id: 'READY', category: 'claimable' },
          { id: 'IN_REVIEW', category: 'feedback' },
        ],
        dispatchRules: [
          {
            statuses: ['IN_REVIEW'],
            workTypes: ['SECURITY_TEST'],
            role: 'SECURITY_AUDITOR',
            launchMode: 'local-docker',
            agentType: 'pi',
            allowOwnerOwned: true,
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'review-work-1',
            title: 'Review worker handoff',
            status: 'IN_REVIEW',
            workType: 'SECURITY_TEST',
            ownerId: 'worker-user',
            assignments: [
              {
                id: 'completed-audit-1',
                role: 'SECURITY_AUDITOR',
                status: 'COMPLETED',
                assigneeUserId: 'auditor-user',
              },
            ],
            goal: { id: 'goal-1', title: 'Target goal' },
          },
        ]),
      },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'SECURITY_AUDITOR' }]);
    runtimeService.launchAgentRuntime = jest.fn();

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(result.dispatched).toHaveLength(0);
    expect(result.skipped[0]).toEqual(expect.objectContaining({
      reason: 'ROLE_ALREADY_COMPLETED_FEEDBACK',
      role: 'SECURITY_AUDITOR',
      workItemId: 'review-work-1',
    }));
    expect(runtimeService.launchAgentRuntime).not.toHaveBeenCalled();
  });

  it('coordinator re-runs feedback role when a newer worker revision completes', async () => {
    const settings = {
      workItemStatusFlow: {
        initialStatus: 'READY',
        statuses: [
          { id: 'READY', category: 'claimable' },
          { id: 'IN_REVIEW', category: 'feedback' },
        ],
        dispatchRules: [
          {
            statuses: ['IN_REVIEW'],
            workTypes: ['SECURITY_TEST'],
            role: 'SECURITY_AUDITOR',
            launchMode: 'local-docker',
            agentType: 'pi',
            allowOwnerOwned: true,
          },
        ],
        coordinator: { enabled: true, maxDispatchesPerTick: 1 },
      },
    };
    const prisma = {
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'review-work-1',
            title: 'Review revised worker handoff',
            status: 'IN_REVIEW',
            workType: 'SECURITY_TEST',
            ownerId: 'worker-user-2',
            assignments: [
              {
                id: 'completed-worker-2',
                role: 'WORKER_AGENT',
                status: 'COMPLETED',
                assigneeUserId: 'worker-user-2',
                finishedAt: new Date('2026-06-07T14:33:00.000Z'),
                updatedAt: new Date('2026-06-07T14:33:00.000Z'),
                createdAt: new Date('2026-06-07T14:25:00.000Z'),
              },
              {
                id: 'completed-audit-1',
                role: 'SECURITY_AUDITOR',
                status: 'COMPLETED',
                assigneeUserId: 'auditor-user',
                finishedAt: new Date('2026-06-07T13:45:00.000Z'),
                updatedAt: new Date('2026-06-07T13:45:00.000Z'),
                createdAt: new Date('2026-06-07T13:42:00.000Z'),
              },
              {
                id: 'completed-worker-1',
                role: 'WORKER_AGENT',
                status: 'COMPLETED',
                assigneeUserId: 'worker-user-1',
                finishedAt: new Date('2026-06-07T13:40:00.000Z'),
                updatedAt: new Date('2026-06-07T13:40:00.000Z'),
                createdAt: new Date('2026-06-07T13:36:00.000Z'),
              },
            ],
            goal: { id: 'goal-1', title: 'Target goal' },
          },
        ]),
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const agentWorkspaceClient = {
      recordProjectEvent: jest.fn().mockResolvedValue({}),
    };
    const runtimeService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    runtimeService.ensureProjectManager = jest.fn().mockResolvedValue({ ownerId: 'owner-user', settings });
    runtimeService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    runtimeService.listLaunchableRoleSummaries = jest.fn().mockResolvedValue([{ role: 'SECURITY_AUDITOR' }]);
    runtimeService.findIdleCoordinatorRuntime = jest.fn().mockResolvedValue(null);
    runtimeService.activeCoordinatorRoleCount = jest.fn().mockResolvedValue(0);
    runtimeService.ensureProjectActiveAgentCapacity = jest.fn().mockResolvedValue({ activeAgentCount: 0, maxActiveAgents: 10 });
    runtimeService.ownerVisibleLlmConfigCandidates = jest.fn().mockResolvedValue([{ id: 'model-config-1' }]);
    runtimeService.launchAgentRuntime = jest.fn().mockResolvedValue({
      memberId: 'auditor-member-2',
      userId: 'auditor-user-2',
      session: { runtimeId: 'runtime-2' },
    });
    runtimeService.createAssignment = jest.fn().mockResolvedValue({
      id: 'assignment-2',
      workItemId: 'review-work-1',
      contextPacket: {},
    });
    runtimeService.wakeRuntimeForAssignment = jest.fn().mockResolvedValue({ accepted: true });

    const result = await runtimeService.tickProjectCoordinator('project-1', 'owner-user');

    expect(result.dispatched[0]).toEqual(expect.objectContaining({
      assignmentId: 'assignment-2',
      role: 'SECURITY_AUDITOR',
      workItemId: 'review-work-1',
    }));
    expect(result.skipped).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: 'ROLE_ALREADY_COMPLETED_FEEDBACK',
        workItemId: 'review-work-1',
      }),
    ]));
  });
});

describe('ProjectsService capability bundle resolution', () => {
  const createService = () =>
    new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        get: (key: string) =>
          key === 'AGENT_WORKSPACE_CAPABILITY_BUNDLES_PATH'
            ? resolve(__dirname, '../../../agent-workspace/capability-bundles')
            : undefined,
      } as never,
      {} as never,
    ) as any;

  it('resolves file, template, and synthesized role capability bundles', async () => {
    const service = createService();
    const roleConfig = {
      role: 'WORKER_AGENT',
      description: 'Worker',
      skillBundleRefs: ['skill://agent-workspace', 'role-skill://agent-workspace-worker'],
      capabilityBundleRefs: [
        'capability://agent-workspace/core',
        'capability://agent-workspace/role/worker-agent',
        'capability://example/custom',
      ],
      capabilityBundles: [
        {
          ref: 'capability://example/custom',
          purpose: 'Custom tool surface',
          requiredScopes: ['CUSTOM_SCOPE'],
          requiredProjectGlobals: ['github_token'],
          surfaces: ['skill://custom-skill', 'agent-workspace.v0.custom'],
        },
      ],
      runtimeCompatibility: {
        requiredFeatures: ['filesystemSkills', 'skillPrompts'],
      },
    };

    const resolved = await service.resolveRoleCapabilityBundles('WORKER_AGENT', roleConfig);

    expect(resolved.refs).toEqual(
      expect.arrayContaining([
        'capability://agent-workspace/core',
        'capability://agent-workspace/role/worker-agent',
        'capability://example/custom',
      ]),
    );
    expect(resolved.skillBundleRefs).toEqual(
      expect.arrayContaining(['skill://agent-workspace', 'role-skill://agent-workspace-worker', 'skill://custom-skill']),
    );
    expect(resolved.requiredScopes).toEqual(
      expect.arrayContaining(['PROJECT_READ_BASIC', 'PROJECT_FILE_READ', 'CUSTOM_SCOPE']),
    );
    expect(resolved.requiredProjectGlobals).toEqual(['github_token']);
  });

  it('adds capability-required scopes and validates required project globals', async () => {
    const service = createService();
    const roleConfig = {
      role: 'WORKER_AGENT',
      skillBundleRefs: ['skill://agent-workspace'],
      capabilityBundleRefs: ['capability://example/custom'],
      capabilityBundles: [
        {
          ref: 'capability://example/custom',
          requiredScopes: ['CUSTOM_SCOPE'],
          requiredProjectGlobals: ['api_key'],
          surfaces: [],
        },
      ],
    };
    const resolved = await service.resolveRoleCapabilityBundles('WORKER_AGENT', roleConfig);

    expect(service.scopesForRole('WORKER_AGENT', roleConfig, resolved)).toEqual(expect.arrayContaining(['CUSTOM_SCOPE']));
    expect(service.missingRequiredProjectGlobals([{ key: 'api_key', value: '' }], resolved.requiredProjectGlobals)).toEqual([
      'api_key',
    ]);
    expect(service.missingRequiredProjectGlobals([{ key: 'api_key', value: 'configured' }], resolved.requiredProjectGlobals)).toEqual([]);
  });

  it('omits null optional fields from skill-only synthesized bundle manifests', async () => {
    const service = createService();
    const resolved = await service.resolveRoleCapabilityBundles('LEGAL_CLAUSE_AGENT', {
      role: 'LEGAL_CLAUSE_AGENT',
      skillBundleRefs: ['skill://agent-workspace'],
    });

    const manifest = resolved.manifests.find((item: any) => item.ref === 'skill://agent-workspace');

    expect(manifest).toBeDefined();
    expect(manifest).not.toHaveProperty('name');
    expect(manifest).not.toHaveProperty('description');
    expect(manifest).not.toHaveProperty('runtimeCompatibility');
    expect(JSON.parse(JSON.stringify({ manifest }))).toEqual({
      manifest: expect.not.objectContaining({
        name: null,
        description: null,
        runtimeCompatibility: null,
      }),
    });
  });

  it('uses template capability bundle surfaces for custom role skills', async () => {
    const service = createService();
    const roleConfig = (service as any).roleConfigFromTemplateEntry({
      role: 'LEGAL_CLAUSE_AGENT',
      label: 'Clause Analyst',
      capabilityBundleRefs: ['capability://agent-workspace/core'],
      capabilityBundles: [
        {
          ref: 'capability://agent-workspace/role/legal-clause-agent',
          surfaces: [
            'skill://agent-workspace',
            'template-role-skill://legal-contract-review/legal-clause-agent/legal-clause-review',
          ],
          requiredScopes: ['WORK_ITEM_UPDATE', 'PROJECT_FILE_WRITE'],
        },
      ],
    });

    expect(roleConfig.skillBundleRefs).toEqual([]);

    const resolved = await service.resolveRoleCapabilityBundles('LEGAL_CLAUSE_AGENT', roleConfig);

    expect(resolved.refs).toEqual(
      expect.arrayContaining([
        'capability://agent-workspace/core',
        'capability://agent-workspace/role/legal-clause-agent',
      ]),
    );
    expect(resolved.skillBundleRefs).toEqual(
      expect.arrayContaining([
        'skill://agent-workspace',
        'template-role-skill://legal-contract-review/legal-clause-agent/legal-clause-review',
      ]),
    );
    expect(resolved.skillBundleRefs).not.toContain('role-skill://agent-workspace-worker');
    expect(resolved.requiredScopes).toEqual(expect.arrayContaining(['WORK_ITEM_UPDATE', 'PROJECT_FILE_WRITE']));
  });
});

describe('ProjectsService agent role names', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips agent names that have already been used in the project', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        permissions: {
          agentRoleName: {
            displayName: 'Alex',
            source: 'general',
            role: 'WORKER_AGENT',
            assignedAt: '2026-06-02T00:00:00.000Z',
          },
        },
        user: {
          displayName: 'Alex',
          email: 'alex@example.test',
        },
      },
    ]);
    const service = new ProjectsService(
      {
        projectMember: {
          findMany,
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    jest.spyOn(Math, 'random').mockReturnValue(0.1);

    const assigned = await service.assignProjectAgentRoleName('project-1', 'WORKER_AGENT', 'Worker Agent');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'project-1' } }));
    expect(assigned.displayName).toBe('Morgan');
    expect(assigned.source).toBe('general');
  });
});

describe('ProjectsService lead agent recreation', () => {
  const createService = (activeLeadAgent: { id: string } | null = null) =>
    new ProjectsService(
      {
        projectMember: {
          findFirst: jest.fn().mockResolvedValue(activeLeadAgent),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

  const settings = {
    projectTemplateRoles: [
      { role: 'OWNER', launchable: false },
      { role: 'LEAD_AGENT', auto: 'ON_CREATE', launchable: false },
      { role: 'WORKER_AGENT', launchable: true },
    ],
  };

  it('allows creating a lead runtime only when the project has no active lead member', async () => {
    await expect(createService(null).canCreateProjectLeadAgent('project-1', settings)).resolves.toBe(true);
    await expect(createService({ id: 'member-1' }).canCreateProjectLeadAgent('project-1', settings)).resolves.toBe(false);
  });
});

describe('ProjectsService project globals', () => {
  it('does not return secret project global values even to the owner', () => {
    const service = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    const sanitized = service.sanitizeProjectGlobalVariables([
      { key: 'hackerone_api_token', value: 'secret-token', isSecret: true, configured: true },
      { key: 'h1_batch_limit', value: '3', isSecret: false, configured: true },
    ], { includeValues: true });

    expect(sanitized).toEqual([
      expect.objectContaining({
        key: 'hackerone_api_token',
        isSecret: true,
        configured: true,
        hasValue: true,
      }),
      expect.objectContaining({
        key: 'h1_batch_limit',
        value: '3',
        isSecret: false,
        configured: true,
      }),
    ]);
    expect(sanitized[0]).not.toHaveProperty('value');
  });

  it('persists newly supplied secret values when project settings are saved', async () => {
    const prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'project-1',
          ownerId: 'owner-1',
          leadAgentUserId: null,
          settings: {
            projectGlobals: [
              { key: 'hackerone_api_token', label: 'HACKERONE_API_TOKEN', isSecret: true },
            ],
          },
        }),
        findUnique: jest.fn().mockResolvedValue({
          settings: {
            projectGlobals: [
              { key: 'hackerone_api_token', label: 'HACKERONE_API_TOKEN', isSecret: true },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'project-1',
          ownerId: 'owner-1',
          settings: {},
          owner: null,
          leadAgent: null,
          _count: { members: 0, workItems: 0, artifacts: 0 },
        }),
      },
    };
    const agentWorkspaceClient = {
      listProjectGlobals: jest.fn().mockResolvedValue({ globals: [] }),
      updateProject: jest.fn().mockResolvedValue({}),
      updateProjectGlobals: jest.fn().mockResolvedValue({}),
    };
    const service = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    jest.spyOn(service, 'syncProjectCapabilityBundles').mockResolvedValue(undefined);
    jest.spyOn(service, 'syncProjectGlobalResourceTasks').mockResolvedValue(undefined);

    await service.updateProject('project-1', 'owner-1', {
      settings: {
        projectGlobals: [
          {
            key: 'hackerone_api_token',
            label: 'HACKERONE_API_TOKEN',
            value: 'new-secret-token',
            isSecret: true,
            required: true,
            createTaskOnMissing: true,
            category: 'hackerone',
          },
        ],
      },
    });

    expect(agentWorkspaceClient.updateProjectGlobals).toHaveBeenCalledWith(
      'project-1',
      expect.arrayContaining([
        expect.objectContaining({
          key: 'hackerone_api_token',
          value: 'new-secret-token',
          isSecret: true,
        }),
      ]),
      expect.objectContaining({
        updatedByUserId: 'owner-1',
        source: 'project-settings',
      }),
    );
    expect(agentWorkspaceClient.updateProject).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        settings: expect.objectContaining({
          projectGlobals: [
            expect.not.objectContaining({ value: 'new-secret-token' }),
          ],
        }),
      }),
    );
  });

  it('resolves goal-scoped secrets by goal identity instead of key alone', async () => {
    const agentWorkspaceClient = {
      listProjectGlobals: jest.fn().mockResolvedValue({
        globals: [
          {
            key: 'shared_token',
            value: 'goal-one-token',
            isSecret: true,
            scope: 'goal',
            goalId: 'goal-1',
          },
          {
            key: 'shared_token',
            value: 'goal-two-token',
            isSecret: true,
            scope: 'goal',
            goalId: 'goal-2',
          },
        ],
      }),
    };
    const service = new ProjectsService(
      {} as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    const secretMap = await service.readProjectGlobalSecretMap('project-1');
    const merged = service.mergeResolvedProjectGlobals([
      { key: 'shared_token', isSecret: true, scope: 'goal', goalId: 'goal-1' },
      { key: 'shared_token', isSecret: true, scope: 'goal', goalId: 'goal-2' },
    ], secretMap);

    expect(merged.map((entry: any) => entry.value)).toEqual(['goal-one-token', 'goal-two-token']);
  });

  it('syncs runtimes after an owner completes a goal resource request item', async () => {
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({
          ownerId: 'owner-1',
          settings: { projectGlobals: [] },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      projectFeature: {
        findFirst: jest.fn(),
      },
      projectWorkItem: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const agentWorkspaceClient = {
      updateProject: jest.fn().mockResolvedValue({}),
      updateProjectGlobals: jest.fn().mockResolvedValue({}),
    };
    const service = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    jest.spyOn(service, 'resolveProjectGlobalVariables').mockResolvedValue([
      {
        key: 'hackerone_api_token',
        label: 'HackerOne API token',
        value: 'existing-h1-token',
        isSecret: true,
        scope: 'project',
      },
    ]);
    jest.spyOn(service, 'syncProjectGlobalResourceTasks').mockResolvedValue(undefined);
    const syncSpy = jest
      .spyOn(service, 'syncProjectGlobalsToRuntimeSessions')
      .mockResolvedValue({ updated: 1, skipped: [] });

    await service.applyCompletedProjectGlobalResourceRequest('project-1', 'owner-1', {
      id: 'work-item-1',
      status: 'ACCEPTED',
      goalId: 'goal-1',
      inputPacket: {
        resourceRequest: {
          key: 'h1_goal_gitlab_gitlab_pat',
          label: 'GitLab PAT',
          value: 'secret-token',
          isSecret: true,
          category: 'hackerone-goal',
          required: true,
        },
      },
    });

    const expectedGoalGlobal = expect.objectContaining({
      key: 'h1_goal_gitlab_gitlab_pat',
      value: 'secret-token',
      scope: 'goal',
      goalId: 'goal-1',
    });
    expect(agentWorkspaceClient.updateProjectGlobals).toHaveBeenCalledWith(
      'project-1',
      [expectedGoalGlobal],
      expect.objectContaining({
        updatedByUserId: 'owner-1',
        workItemId: 'work-item-1',
        source: 'work-item-resource-request',
      }),
    );
    expect(agentWorkspaceClient.updateProjectGlobals.mock.calls[0][1]).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'hackerone_api_token',
          value: 'existing-h1-token',
        }),
      ]),
    );
    expect(syncSpy).toHaveBeenCalledWith(
      'project-1',
      expect.arrayContaining([
        expectedGoalGlobal,
        expect.objectContaining({
          key: 'hackerone_api_token',
          value: 'existing-h1-token',
        }),
      ]),
    );
    expect(prisma.projectWorkItem.update).toHaveBeenCalledWith({
      where: { id: 'work-item-1' },
      data: {
        inputPacket: {
          resourceRequest: expect.objectContaining({
            key: 'h1_goal_gitlab_gitlab_pat',
            hasValue: true,
          }),
        },
      },
    });
    expect(prisma.projectWorkItem.update.mock.calls[0][0].data.inputPacket.resourceRequest).not.toHaveProperty('value');
  });

  it('closes matching goal resource request items after a goal global is supplied', async () => {
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'resource-1',
            goalId: 'goal-1',
            status: 'READY',
            inputPacket: {
              resourceRequest: {
                key: 'h1_goal_vimeo_account_a_email',
                label: 'Vimeo account A email',
                category: 'hackerone-goal',
                isSecret: false,
              },
            },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };
    const service = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    await service.syncProjectGlobalResourceTasks('project-1', 'owner-1', [
      {
        key: 'h1_goal_vimeo_account_a_email',
        label: 'Vimeo account A email',
        value: 'totol+vimeo-a@example.com',
        scope: 'goal',
        goalId: 'goal-1',
        required: true,
        createTaskOnMissing: true,
      },
    ]);

    expect(prisma.projectWorkItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['resource-1'] } },
      data: { status: 'ACCEPTED' },
    });
    expect(prisma.projectWorkItem.create).not.toHaveBeenCalled();
  });

  it('treats configured secret globals as supplied when syncing resource tasks', async () => {
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      projectWorkItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'resource-1',
            goalId: 'goal-1',
            status: 'READY',
            inputPacket: {
              resourceRequest: {
                key: 'h1_goal_vimeo_account_a_password',
                label: 'Vimeo account A password',
                category: 'hackerone-goal',
                isSecret: true,
              },
            },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };
    const service = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    await service.syncProjectGlobalResourceTasks('project-1', 'owner-1', [
      {
        key: 'h1_goal_vimeo_account_a_password',
        label: 'Vimeo account A password',
        configured: true,
        isSecret: true,
        scope: 'goal',
        goalId: 'goal-1',
        required: true,
        createTaskOnMissing: true,
      },
    ]);

    expect(prisma.projectWorkItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['resource-1'] } },
      data: { status: 'ACCEPTED' },
    });
    expect(prisma.projectWorkItem.create).not.toHaveBeenCalled();
  });
});

describe('ProjectsService active agent limits', () => {
  const activeMember = (status = 'IDLE') => ({ permissions: { runtimeSession: { status } } });
  const createService = (members: any[]) =>
    new ProjectsService(
      {
        projectMember: {
          findMany: jest.fn().mockResolvedValue(members),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

  it('defaults project active agent capacity to 10 and caps saved values at 50', () => {
    const service = createService([]);

    expect(service.projectMaxActiveAgentsFromSettings({})).toBe(10);
    expect(service.projectMaxActiveAgentsFromSettings({ maxActiveAgents: 100 })).toBe(50);
    expect(() => service.normalizeProjectMaxActiveAgents(51, { strict: true })).toThrow(
      'Max active agents must be between 1 and 50',
    );
  });

  it('blocks creating a new agent member when the project is at capacity', async () => {
    const service = createService(Array.from({ length: 10 }, () => activeMember('IDLE')));

    await expect(service.ensureProjectActiveAgentCapacity('project-1', { maxActiveAgents: 10 })).rejects.toThrow(
      'Project active agent limit reached (10/10)',
    );
  });

  it('does not count stopped or errored runtime sessions against active agent capacity', async () => {
    const service = createService([
      activeMember('TYPING'),
      activeMember('STOPPED'),
      activeMember('ERROR'),
      { permissions: {} },
      { permissions: null },
    ]);

    await expect(service.ensureProjectActiveAgentCapacity('project-1', { maxActiveAgents: 2 })).resolves.toEqual({
      activeAgentCount: 1,
      maxActiveAgents: 2,
    });
  });

  it('does not count unavailable local docker runtimes against active agent capacity', async () => {
    const prisma = {
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'member-1',
            permissions: {
              runtimeSession: {
                runtimeId: 'runtime-1',
                provider: 'local-docker',
                status: 'IDLE',
              },
            },
          },
          activeMember('TYPING'),
        ]),
      },
    };
    const service = new ProjectsService(
      prisma as never,
      {} as never,
      {
        inspect: jest.fn().mockResolvedValue({
          runtimeId: 'runtime-1',
          provider: 'local-docker',
          status: 'STOPPED',
          dockerStatus: { running: false },
        }),
      } as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    service.writeRuntimeSession = jest.fn().mockResolvedValue({});

    await expect(service.ensureProjectActiveAgentCapacity('project-1', { maxActiveAgents: 2 })).resolves.toEqual({
      activeAgentCount: 1,
      maxActiveAgents: 2,
    });
    expect(service.writeRuntimeSession).toHaveBeenCalledWith(
      'member-1',
      expect.objectContaining({ status: 'STOPPED' }),
    );
  });
});

describe('ProjectsService runtime orphan detection', () => {
  const createService = (config: Record<string, string | undefined> = {}, hasActiveMessage = false) =>
    new ProjectsService(
      {} as never,
      {} as never,
      { hasActiveMessage: () => hasActiveMessage } as never,
      {} as never,
      {} as never,
      { get: (key: string) => config[key] } as never,
      {} as never,
    ) as any;

  const session = (overrides: Record<string, unknown> = {}) => ({
    provider: 'aws-ecs',
    image: 'runtime',
    containerName: 'runtime',
    apiBaseUrl: 'http://10.0.0.2:8642',
    apiKey: 'key',
    dataDir: '/tmp/runtime',
    runtimeId: 'runtime-1',
    grantId: 'grant-1',
    workspaceToken: 'token',
    scopes: [],
    skillBundleRefs: [],
    role: 'WORKER_AGENT',
    status: 'TYPING',
    launchedAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    lastMessageAt: new Date(Date.now() - 60_000).toISOString(),
    activeRequestId: 'request-1',
    ...overrides,
  });

  it('does not mark a fresh cloud response orphaned just because the in-memory controller is absent', () => {
    const service = createService();

    expect(service.isRuntimeTypingOrphaned(session())).toBe(false);
  });

  it('marks a missing cloud controller orphaned after the configured grace window', () => {
    const service = createService({ HERMES_AGENT_ORPHAN_GRACE_MS: '1000' });

    expect(
      service.isRuntimeTypingOrphaned(
        session({
          lastMessageAt: new Date(Date.now() - 5000).toISOString(),
          updatedAt: new Date(Date.now() - 5000).toISOString(),
        }),
      ),
    ).toBe(true);
  });

  it('measures active request age from the request start, not refreshed runtime metadata', () => {
    const service = createService();
    const activeRequestStartedAt = new Date(Date.now() - 5000).toISOString();

    expect(
      service.runtimeActiveRequestAgeMs(
        session({
          activeRequestStartedAt,
          lastMessageAt: null,
          lastStreamAt: null,
          updatedAt: new Date().toISOString(),
        }),
      ),
    ).toBeGreaterThanOrEqual(4000);
  });

  it('recovers stale typing sessions even when runtime metadata was refreshed recently', () => {
    const service = createService({
      HERMES_AGENT_TYPING_STALE_MS: '1000',
      HERMES_AGENT_ORPHAN_GRACE_MS: '600000',
    });

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        activeRequestStartedAt: new Date(Date.now() - 5000).toISOString(),
        lastMessageAt: null,
        lastStreamAt: null,
        updatedAt: new Date().toISOString(),
      }),
    );

    expect(recovered.status).toBe('ERROR');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.activeRequestStartedAt).toBeNull();
    expect(recovered.activeRequestConversationId).toBeNull();
    expect(recovered.lastError).toBe('Previous background message stalled and was reset.');
  });

  it('parks stale queued local active requests when the active wait state was lost', () => {
    const service = createService({
      HERMES_AGENT_LOCAL_RUNNER_ACTIVE_REQUEST_STALE_MS: '1000',
      AGENTCRAFT_LOCAL_RUNNER_STALE_MS: '1000',
    });
    const staleAt = new Date(Date.now() - 5000).toISOString();

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        provider: 'local-runner',
        apiBaseUrl: 'local-runner://runtime-1',
        status: 'TYPING',
        activeRequestId: 'request-1',
        activeRequestStartedAt: staleAt,
        activeRequestConversationId: 'conversation-1',
        lastMessageAt: staleAt,
        lastStreamAt: null,
        localRunnerBridge: {
          connectedAt: staleAt,
          lastSeenAt: staleAt,
          requests: [
            {
              id: 'request-1',
              status: 'RUNNING',
              payload: {},
              conversationId: 'conversation-1',
              assistantMessageId: 'local-runner-request-1-assistant',
              createdAt: staleAt,
              updatedAt: staleAt,
              outputText: null,
              recentActions: [],
              error: null,
            },
          ],
        },
      }),
    );

    expect(recovered.status).toBe('WAITING_LOCAL_RUNNER');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.activeRequestStartedAt).toBeNull();
    expect(recovered.activeRequestConversationId).toBeNull();
    expect(recovered.apiBaseUrl).toBe('');
    expect(recovered.localRunnerBridge?.disconnectReason).toBe('active-request-stale');
    expect(recovered.localRunnerBridge?.requests?.[0]).toEqual(expect.objectContaining({
      id: 'request-1',
      status: 'ERROR',
    }));
  });

  it('keeps stale queued local active requests while the active wait state is still present', () => {
    const service = createService({
      HERMES_AGENT_LOCAL_RUNNER_ACTIVE_REQUEST_STALE_MS: '1000',
      AGENTCRAFT_LOCAL_RUNNER_STALE_MS: '1000',
    }, true);
    const staleAt = new Date(Date.now() - 5000).toISOString();
    const queuedSession = session({
      provider: 'local-runner',
      apiBaseUrl: 'local-runner://runtime-1',
      status: 'TYPING',
      activeRequestId: 'request-1',
      activeRequestStartedAt: staleAt,
      activeRequestConversationId: 'conversation-1',
      lastMessageAt: staleAt,
      lastStreamAt: null,
      localRunnerBridge: {
        connectedAt: staleAt,
        lastSeenAt: staleAt,
        requests: [
          {
            id: 'request-1',
            status: 'RUNNING',
            payload: {},
            conversationId: 'conversation-1',
            assistantMessageId: 'local-runner-request-1-assistant',
            createdAt: staleAt,
            updatedAt: staleAt,
            outputText: null,
            recentActions: [],
            error: null,
          },
        ],
      },
    });

    expect(service.recoverPersistedRuntimeSession(queuedSession)).toEqual(queuedSession);
  });

  it('clears dangling active request metadata from terminal runtime sessions', () => {
    const service = createService();

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        status: 'STOPPED',
        activeRequestId: 'request-1',
        activeRequestStartedAt: new Date(Date.now() - 5000).toISOString(),
        activeRequestConversationId: 'conversation-1',
      }),
    );

    expect(recovered.status).toBe('STOPPED');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.activeRequestStartedAt).toBeNull();
    expect(recovered.activeRequestConversationId).toBeNull();
  });

  it('clears dangling request start metadata even when terminal sessions lost the request id', () => {
    const service = createService();

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        status: 'STOPPED',
        activeRequestId: null,
        activeRequestStartedAt: new Date(Date.now() - 5000).toISOString(),
        activeRequestConversationId: null,
      }),
    );

    expect(recovered.status).toBe('STOPPED');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.activeRequestStartedAt).toBeNull();
    expect(recovered.activeRequestConversationId).toBeNull();
  });

  it('persists recovered project runtime sessions during runtime health reconciliation', async () => {
    const service = createService() as any;
    service.prisma = {
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'member-1',
            permissions: {
              runtimeSession: session({
                status: 'STOPPED',
                activeRequestId: 'request-1',
                activeRequestStartedAt: new Date(Date.now() - 5000).toISOString(),
                activeRequestConversationId: 'conversation-1',
              }),
            },
          },
        ]),
      },
    };
    service.writeRuntimeSession = jest.fn().mockResolvedValue({});

    await expect(service.recoverProjectRuntimeSessions('project-1')).resolves.toEqual({ recovered: 1 });
    expect(service.writeRuntimeSession).toHaveBeenCalledWith(
      'member-1',
      expect.objectContaining({
        status: 'STOPPED',
        activeRequestId: null,
        activeRequestStartedAt: null,
        activeRequestConversationId: null,
      }),
    );
  });

  it('keeps a session non-orphaned while its active controller is present', () => {
    const service = createService({ HERMES_AGENT_ORPHAN_GRACE_MS: '1000' }, true);

    expect(
      service.isRuntimeTypingOrphaned(
        session({
          lastMessageAt: new Date(Date.now() - 5000).toISOString(),
          updatedAt: new Date(Date.now() - 5000).toISOString(),
        }),
      ),
    ).toBe(false);
  });

  it('preserves an active local-codex bridge request when a stale refresh omits it', () => {
    const service = createService();
    const existing = session({
      provider: 'local-codex',
      apiBaseUrl: 'local-codex://runtime-1',
      activeRequestId: 'request-1',
      activeRequestConversationId: 'conversation-1',
      status: 'TYPING',
      currentActivity: 'Waiting for local Codex',
      localRunnerBridge: {
        requests: [
          {
            id: 'request-1',
            status: 'PENDING',
            payload: {},
            assistantMessageId: 'assistant-1',
            createdAt: new Date(Date.now() - 5000).toISOString(),
            updatedAt: new Date(Date.now() - 1000).toISOString(),
            outputText: null,
            recentActions: [],
            error: null,
          },
        ],
      },
    });

    const recovered = service.preserveQueuedLocalRuntimeBridge(
      session({
        provider: 'local-codex',
        apiBaseUrl: 'local-codex://runtime-1',
        status: 'IDLE',
        activeRequestId: null,
        localRunnerBridge: { requests: [] },
      }),
      existing,
    );

    expect(recovered.status).toBe('TYPING');
    expect(recovered.activeRequestId).toBe('request-1');
    expect(recovered.activeRequestConversationId).toBe('conversation-1');
    expect(recovered.localRunnerBridge.requests).toEqual((existing as any).localRunnerBridge.requests);
  });

  it('preserves an active local-codex message before its bridge request is queued', () => {
    const service = createService();
    const existing = session({
      provider: 'local-codex',
      apiBaseUrl: 'local-codex://runtime-1',
      activeRequestId: 'request-1',
      activeRequestConversationId: 'conversation-1',
      status: 'TYPING',
      currentActivity: 'Reading context',
      localRunnerBridge: { requests: [] },
    });

    const recovered = service.preserveQueuedLocalRuntimeBridge(
      session({
        provider: 'local-codex',
        apiBaseUrl: 'local-codex://runtime-1',
        status: 'IDLE',
        activeRequestId: null,
        localRunnerBridge: { requests: [] },
      }),
      existing,
    );

    expect(recovered.status).toBe('TYPING');
    expect(recovered.activeRequestId).toBe('request-1');
    expect(recovered.activeRequestConversationId).toBe('conversation-1');
    expect(recovered.currentActivity).toBe('Reading context');
  });

  it('allows a queued local-codex runtime to be claimed after dispatch queued its first message', () => {
    const service = createService();

    expect(
      service.isLocalRuntimeClaimable(
        session({
          provider: 'local-codex',
          apiBaseUrl: '',
          localRunnerJob: { files: [] },
          activeRequestId: 'request-1',
          status: 'TYPING',
          localRunnerBridge: {
            requests: [
              {
                id: 'request-1',
                status: 'PENDING',
                payload: {},
                assistantMessageId: 'assistant-1',
                createdAt: new Date(Date.now() - 5000).toISOString(),
                updatedAt: new Date(Date.now() - 1000).toISOString(),
                outputText: null,
                recentActions: [],
                error: null,
              },
            ],
          },
        }),
        'local-codex',
      ),
    ).toBe(true);
  });

  it('allows an unconnected timed-out local-codex runtime to be reclaimed', () => {
    const service = createService();

    expect(
      service.isLocalRuntimeClaimable(
        session({
          provider: 'local-codex',
          apiBaseUrl: '',
          localRunnerJob: { files: [] },
          activeRequestId: null,
          status: 'IDLE',
          lastError: 'Agent response timed out before completion.',
          localRunnerBridge: { requests: [] },
        }),
        'local-codex',
      ),
    ).toBe(true);
  });

  it('allows a stale connected local-codex runtime to be reclaimed after the runner dies', () => {
    const service = createService({ AGENTCRAFT_LOCAL_RUNNER_STALE_MS: '1000' });

    expect(
      service.isLocalRuntimeClaimable(
        session({
          provider: 'local-codex',
          apiBaseUrl: 'local-codex://runtime-1',
          localRunnerJob: { files: [] },
          activeRequestId: null,
          status: 'IDLE',
          localRunnerBridge: {
            lastSeenAt: new Date(Date.now() - 5000).toISOString(),
            requests: [],
          },
        }),
        'local-codex',
      ),
    ).toBe(true);
  });

  it('includes skill files in queued local runtime requests', async () => {
    const launcher = {
      localRunnerJobWithSkillBundle: jest.fn().mockResolvedValue({
        files: [
          { path: 'AGENT_WORKSPACE_CONTEXT.json', content: '{"skillBundleRefs":["skill://agent-workspace"]}' },
          { path: 'skills/agent-workspace/SKILL.md', content: 'Use project helpers.' },
          { path: 'skills/agent-workspace/scripts/project-files.sh', content: 'project-file-list() { :; }' },
          { path: 'config.yaml', content: 'model: test' },
        ],
      }),
      localRunnerRuntimeEnvFile: jest.fn().mockReturnValue({
        path: 'AGENT_WORKSPACE_RUNTIME.env',
        content: 'export AGENT_WORKSPACE_TOKEN="token"',
      }),
    };
    const service = new ProjectsService(
      {} as never,
      {} as never,
      launcher as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;

    const files = await service.localRunnerBridgeRequestFiles(
      session({
        provider: 'local-codex',
        localRunnerJob: { files: [] },
        skillBundleRefs: ['skill://agent-workspace'],
        projectSkillOverrides: [],
      }),
      {
        projectId: 'project-1',
        memberId: 'member-1',
        userId: 'user-1',
        role: 'LEAD_AGENT',
        workspaceBaseUrl: 'http://workspace',
        projectGlobals: [],
      },
    );

    expect(files).toEqual([
      { path: 'AGENT_WORKSPACE_CONTEXT.json', content: '{"skillBundleRefs":["skill://agent-workspace"]}' },
      { path: 'skills/agent-workspace/SKILL.md', content: 'Use project helpers.' },
      { path: 'skills/agent-workspace/scripts/project-files.sh', content: 'project-file-list() { :; }' },
      { path: 'AGENT_WORKSPACE_RUNTIME.env', content: 'export AGENT_WORKSPACE_TOKEN="token"' },
    ]);
    expect(files).not.toEqual(expect.arrayContaining([expect.objectContaining({ path: 'config.yaml' })]));
  });

  it('allows an intentional local-codex error write to clear an active bridge request', () => {
    const service = createService();
    const existing = session({
      provider: 'local-codex',
      apiBaseUrl: 'local-codex://runtime-1',
      activeRequestId: 'request-1',
      status: 'TYPING',
      localRunnerBridge: {
        requests: [
          {
            id: 'request-1',
            status: 'PENDING',
            payload: {},
            assistantMessageId: 'assistant-1',
            createdAt: new Date(Date.now() - 5000).toISOString(),
            updatedAt: new Date(Date.now() - 1000).toISOString(),
            outputText: null,
            recentActions: [],
            error: null,
          },
        ],
      },
    });

    const failed = service.preserveQueuedLocalRuntimeBridge(
      session({
        provider: 'local-codex',
        apiBaseUrl: 'local-codex://runtime-1',
        status: 'ERROR',
        activeRequestId: null,
        lastError: 'Local runner bridge request disappeared while waiting for response',
        localRunnerBridge: { requests: [] },
      }),
      existing,
    );

    expect(failed.status).toBe('ERROR');
    expect(failed.activeRequestId).toBeNull();
    expect(failed.localRunnerBridge.requests).toEqual([]);
  });

  it('recovers local-codex typing sessions whose active bridge request was lost', () => {
    const service = createService({ HERMES_AGENT_LOCAL_RUNNER_MISSING_REQUEST_GRACE_MS: '1000' });

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        provider: 'local-codex',
        apiBaseUrl: 'local-codex://runtime-1',
        activeRequestId: 'request-1',
        status: 'TYPING',
        lastMessageAt: new Date(Date.now() - 5000).toISOString(),
        localRunnerBridge: { requests: [] },
      }),
    );

    expect(recovered.status).toBe('ERROR');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.lastError).toBe('Local Codex message request was lost before the runner could complete it. Please retry the message.');
    expect(recovered.messageHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: 'Local Codex message request was lost before the runner could complete it. Please retry the message.',
          status: 'ERROR',
        }),
      ]),
    );
  });

  it('finalizes a late local-codex completion after a stale heartbeat error', () => {
    const service = createService();
    const requestCreatedAt = new Date(Date.now() - 120_000).toISOString();
    const completedAt = new Date(Date.now() - 1000).toISOString();

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        provider: 'local-codex',
        apiBaseUrl: '',
        status: 'STARTING',
        activeRequestId: null,
        lastMessageAt: requestCreatedAt,
        lastError: 'local Codex heartbeat stopped before the active message completed.',
        messageHistory: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            createdAt: requestCreatedAt,
            status: 'SENT',
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Local Codex picked up the AgentCraft request.',
            createdAt: requestCreatedAt,
            status: 'ERROR',
          },
        ],
        localRunnerBridge: {
          requests: [
            {
              id: 'request-1',
              status: 'COMPLETED',
              payload: {},
              assistantMessageId: 'assistant-1',
              createdAt: requestCreatedAt,
              updatedAt: completedAt,
              completedAt,
              outputText: 'Final answer from Codex.',
              recentActions: [{ kind: 'message', name: 'codex', summary: 'Completed', status: 'ok' }],
              error: null,
            },
          ],
        },
      }),
    );

    expect(recovered.status).toBe('IDLE');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.lastError).toBeNull();
    expect(recovered.currentActivity).toBe('Idle after responding');
    expect(recovered.messageHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'assistant-1',
          role: 'assistant',
          content: 'Final answer from Codex.',
          status: 'IDLE',
        }),
      ]),
    );
  });

  it('finalizes completed local-runner bridge requests after an API restart', () => {
    const service = createService();

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        provider: 'local-runner',
        activeRequestId: 'request-1',
        localRunnerBridge: {
          requests: [
            {
              id: 'request-1',
              status: 'COMPLETED',
              payload: {},
              assistantMessageId: 'assistant-1',
              createdAt: new Date(Date.now() - 5000).toISOString(),
              updatedAt: new Date(Date.now() - 1000).toISOString(),
              completedAt: new Date(Date.now() - 1000).toISOString(),
              outputText: 'Done from the local runner.',
              recentActions: [{ kind: 'message', name: 'assistant', summary: 'Done', status: 'ok' }],
              error: null,
            },
          ],
        },
      }),
    );

    expect(recovered.status).toBe('IDLE');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.lastError).toBeNull();
    expect(recovered.messageHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'assistant-1',
          role: 'assistant',
          content: 'Done from the local runner.',
          status: 'IDLE',
        }),
      ]),
    );
  });

  it('marks errored local-runner bridge requests as failed after an API restart', () => {
    const service = createService();

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        provider: 'local-runner',
        activeRequestId: 'request-1',
        localRunnerBridge: {
          requests: [
            {
              id: 'request-1',
              status: 'ERROR',
              payload: {},
              assistantMessageId: 'assistant-1',
              createdAt: new Date(Date.now() - 5000).toISOString(),
              updatedAt: new Date(Date.now() - 1000).toISOString(),
              completedAt: new Date(Date.now() - 1000).toISOString(),
              outputText: 'Agent command exited with 1.',
              recentActions: [],
              error: 'Command failed.',
            },
          ],
        },
      }),
    );

    expect(recovered.status).toBe('ERROR');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.lastError).toBe('Command failed.');
    expect(recovered.messageHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'assistant-1',
          role: 'assistant',
          content: 'Agent command exited with 1.',
          status: 'ERROR',
        }),
        expect.objectContaining({
          role: 'system',
          content: 'Command failed.',
          status: 'ERROR',
        }),
      ]),
    );
  });

  it('parks timed-out local-runner bridge requests as idle after an API restart', () => {
    const service = createService();

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        provider: 'local-runner',
        activeRequestId: 'request-1',
        localRunnerBridge: {
          requests: [
            {
              id: 'request-1',
              status: 'ERROR',
              payload: {},
              assistantMessageId: 'assistant-1',
              createdAt: new Date(Date.now() - 5000).toISOString(),
              updatedAt: new Date(Date.now() - 1000).toISOString(),
              completedAt: new Date(Date.now() - 1000).toISOString(),
              outputText: 'Request timed out.',
              recentActions: [],
              error: 'Request timed out.',
            },
          ],
        },
      }),
    );

    expect(recovered.status).toBe('IDLE');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.lastError).toBe('Request timed out.');
    expect(recovered.currentActivity).toBe('Response timed out; ready for another message');
    expect(recovered.messageHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'assistant-1',
          role: 'assistant',
          content: 'Request timed out.',
          status: 'WARNING',
        }),
      ]),
    );
  });

  it('marks timed-out queued local requests terminal so late progress cannot revive typing', () => {
    const service = createService();
    const failed = service.failQueuedLocalRuntimeBridgeRequest(
      session({
        provider: 'local-codex',
        activeRequestId: 'request-1',
        status: 'TYPING',
        localRunnerBridge: {
          requests: [
            {
              id: 'request-1',
              status: 'RUNNING',
              payload: {},
              assistantMessageId: 'assistant-1',
              createdAt: new Date(Date.now() - 5000).toISOString(),
              updatedAt: new Date(Date.now() - 1000).toISOString(),
              outputText: null,
              recentActions: [],
              error: null,
            },
          ],
        },
      }),
      'request-1',
      'Agent response timed out before completion.',
    );

    expect(failed.localRunnerBridge.requests).toEqual([
      expect.objectContaining({
        id: 'request-1',
        status: 'ERROR',
        error: 'Agent response timed out before completion.',
      }),
    ]);
    expect(failed.localRunnerBridge.requests[0].completedAt).toBeTruthy();
  });

  it('marks active local-codex requests failed when the runner goes offline', () => {
    const service = createService();

    const recovered = service.recoverPersistedRuntimeSession(
      session({
        provider: 'local-codex',
        apiBaseUrl: '',
        status: 'WAITING_LOCAL_CODEX',
        activeRequestId: 'request-1',
        activeRequestConversationId: null,
        lastError: 'local Codex heartbeat stopped before the active message completed.',
        localRunnerBridge: {
          requests: [
            {
              id: 'request-1',
              status: 'RUNNING',
              payload: {},
              assistantMessageId: 'assistant-1',
              createdAt: new Date(Date.now() - 5000).toISOString(),
              updatedAt: new Date(Date.now() - 1000).toISOString(),
              outputText: null,
              recentActions: [],
              error: null,
            },
          ],
        },
      }),
    );

    expect(recovered.status).toBe('WAITING_LOCAL_CODEX');
    expect(recovered.activeRequestId).toBeNull();
    expect(recovered.lastError).toBe('local Codex heartbeat stopped before the active message completed.');
    expect(recovered.messageHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: 'local Codex heartbeat stopped before the active message completed.',
          status: 'ERROR',
        }),
      ]),
    );
  });
  });

describe('ProjectsService runtime conversation history', () => {
  const service = new ProjectsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
    {} as never,
  ) as any;

  const baseSession = () => ({
    provider: 'local-docker',
    image: 'runtime',
    containerName: 'runtime',
    apiBaseUrl: 'http://127.0.0.1:8642',
    apiKey: 'key',
    dataDir: '/tmp/runtime',
    runtimeId: 'runtime-1',
    grantId: 'grant-1',
    workspaceToken: 'token',
    scopes: [],
    skillBundleRefs: [],
    role: 'LEAD_AGENT',
    status: 'TYPING',
    launchedAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:02.000Z',
    activeRequestId: 'request-1',
    activeRequestConversationId: 'chat-1',
    activeConversationId: 'chat-2',
    messageHistory: [],
    conversations: [
      {
        id: 'chat-2',
        title: 'New conversation',
        createdAt: '2026-05-16T00:00:02.000Z',
        updatedAt: '2026-05-16T00:00:02.000Z',
        messageHistory: [],
      },
      {
        id: 'chat-1',
        title: 'hello',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:01.000Z',
        messageHistory: [
          {
            id: 'message-1',
            role: 'user',
            content: 'hello',
            createdAt: '2026-05-16T00:00:01.000Z',
            status: 'SENT',
          },
        ],
      },
    ],
  });

  it('writes a background response to its original chat without stealing the active chat', () => {
    const session = baseSession();
    const originalChat = service.selectRuntimeConversation(session, 'chat-1');
    const updated = service.updateRuntimeConversationHistory(
      session,
      'chat-1',
      service.upsertRuntimeMessage(originalChat, {
        id: 'assistant-1',
        role: 'assistant',
        content: 'done',
        createdAt: '2026-05-16T00:00:03.000Z',
        status: 'IDLE',
      }),
      {
        status: 'IDLE',
        activeRequestId: null,
        activeRequestConversationId: null,
        updatedAt: '2026-05-16T00:00:03.000Z',
      },
    );

    expect(updated.activeConversationId).toBe('chat-2');
    expect(updated.messageHistory).toEqual([]);
    expect(updated.conversations.find((conversation: any) => conversation.id === 'chat-1').messageHistory).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'done' }),
    ]);
  });

  it('focuses the active request conversation while the agent is typing', () => {
    const session = baseSession();
    const originalChat = service.selectRuntimeConversation(session, 'chat-1');
    const updated = service.updateRuntimeConversationHistory(
      session,
      'chat-1',
      service.upsertRuntimeMessage(originalChat, {
        id: 'assistant-1',
        role: 'assistant',
        content: 'working',
        createdAt: '2026-05-16T00:00:03.000Z',
        status: 'TYPING',
      }),
      {
        status: 'TYPING',
        activeRequestId: 'request-1',
        activeRequestConversationId: 'chat-1',
        updatedAt: '2026-05-16T00:00:03.000Z',
      },
    );

    expect(updated.activeConversationId).toBe('chat-1');
    expect(updated.messageHistory).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'working' }),
    ]);
  });

  it('does not let stale request updates steal the active request conversation', () => {
    const session = {
      ...baseSession(),
      activeRequestId: 'request-2',
      activeRequestConversationId: 'chat-2',
      activeConversationId: 'chat-2',
    };
    const originalChat = service.selectRuntimeConversation(session, 'chat-1');
    const scopedUpdates = service.activeRequestScopedUpdates(session, 'request-1', {
      status: 'TYPING',
      activeRequestId: 'request-1',
      activeRequestConversationId: 'chat-1',
      currentActivity: 'Streaming response',
      updatedAt: '2026-05-16T00:00:03.000Z',
    });
    const updated = service.updateRuntimeConversationHistory(
      session,
      'chat-1',
      service.upsertRuntimeMessage(originalChat, {
        id: 'assistant-1',
        role: 'assistant',
        content: 'late old response',
        createdAt: '2026-05-16T00:00:03.000Z',
        status: 'TYPING',
      }),
      scopedUpdates,
    );

    expect(updated.activeRequestId).toBe('request-2');
    expect(updated.activeRequestConversationId).toBe('chat-2');
    expect(updated.activeConversationId).toBe('chat-2');
    expect(updated.currentActivity).toBeUndefined();
    expect(updated.conversations.find((conversation: any) => conversation.id === 'chat-1').messageHistory).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'late old response' }),
    ]);
  });

  it('finalizes a provisional Hermes assistant message instead of appending a duplicate', () => {
    const session = {
      ...baseSession(),
      activeConversationId: 'chat-1',
      messageHistory: [
        {
          id: 'message-1',
          role: 'user',
          content: 'hello',
          createdAt: '2026-05-16T00:00:01.000Z',
          status: 'SENT',
        },
        {
          id: 'hermes-runtime-1-assistant-13',
          role: 'assistant',
          content: 'Hello from the lead agent.',
          createdAt: '2026-05-16T00:00:02.000Z',
          status: 'TYPING',
        },
      ],
      conversations: [
        {
          id: 'chat-1',
          title: 'hello',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:02.000Z',
          messageHistory: [
            {
              id: 'message-1',
              role: 'user',
              content: 'hello',
              createdAt: '2026-05-16T00:00:01.000Z',
              status: 'SENT',
            },
            {
              id: 'hermes-runtime-1-assistant-13',
              role: 'assistant',
              content: 'Hello from the lead agent.',
              createdAt: '2026-05-16T00:00:02.000Z',
              status: 'TYPING',
            },
          ],
        },
      ],
    };

    const updated = service.upsertRuntimeMessage(session, {
      id: 'final-assistant-1',
      role: 'assistant',
      content: 'Hello from the lead agent.',
      createdAt: '2026-05-16T00:00:03.000Z',
      status: 'IDLE',
    });

    expect(updated.filter((message: any) => message.role === 'assistant')).toHaveLength(1);
    expect(updated).toContainEqual(
      expect.objectContaining({
        id: 'hermes-runtime-1-assistant-13',
        role: 'assistant',
        content: 'Hello from the lead agent.',
        status: 'IDLE',
      }),
    );
  });
});

describe('ProjectsService runtime polling state', () => {
  const service = new ProjectsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
    {} as never,
  ) as any;

  const config = {
    enabled: true,
    strategy: 'IDLE_ONLY',
    intervalMinutes: 5,
    message: 'keep working',
  };

  it('does not treat session bookkeeping writes as a completed polling response', () => {
    const state = {
      lastConversationId: 'poll-1',
      lastRunAt: '2026-05-17T04:51:00.000Z',
      lastCompletedAt: null,
      nextRunAt: null,
    };
    const session = {
      status: 'IDLE',
      activeConversationId: 'poll-1',
      updatedAt: '2026-05-17T04:57:00.000Z',
      lastResponseAt: '2026-05-17T04:57:00.000Z',
      conversations: [
        {
          id: 'poll-1',
          updatedAt: '2026-05-17T04:57:00.000Z',
          messageHistory: [
            {
              role: 'user',
              content: 'keep working',
              createdAt: '2026-05-17T04:51:00.000Z',
            },
          ],
        },
      ],
    };

    expect(service.completedPollingState(session, config, state)).toBe(state);
  });

  it('schedules the next polling run after the polling conversation receives a response', () => {
    const state = {
      lastConversationId: 'poll-1',
      lastRunAt: '2026-05-17T04:51:00.000Z',
      lastCompletedAt: null,
      nextRunAt: null,
    };
    const session = {
      status: 'IDLE',
      activeConversationId: 'poll-1',
      updatedAt: '2026-05-17T04:57:00.000Z',
      conversations: [
        {
          id: 'poll-1',
          updatedAt: '2026-05-17T04:57:00.000Z',
          messageHistory: [
            {
              role: 'user',
              content: 'keep working',
              createdAt: '2026-05-17T04:51:00.000Z',
            },
            {
              role: 'assistant',
              content: 'Done.',
              createdAt: '2026-05-17T04:52:30.000Z',
            },
          ],
        },
      ],
    };

    expect(service.completedPollingState(session, config, state)).toEqual({
      ...state,
      lastCompletedAt: '2026-05-17T04:52:30.000Z',
      nextRunAt: '2026-05-17T04:57:30.000Z',
      lastError: null,
    });
  });

  it('treats non-terminal active runtime requests and typing assistant turns as ongoing conversations', () => {
    expect(service.runtimeHasOngoingConversation({ status: 'TYPING' })).toBe(true);
    expect(service.runtimeHasOngoingConversation({ status: 'STARTING', activeRequestId: 'request-1' })).toBe(true);
    expect(service.runtimeHasOngoingConversation({ status: 'IDLE', activeRequestId: 'request-1' })).toBe(false);
    expect(service.runtimeHasOngoingConversation({ status: 'IDLE', activeRequestConversationId: 'conversation-1' })).toBe(false);
    expect(service.runtimeHasOngoingConversation({
      status: 'STARTING',
      conversations: [
        {
          id: 'conversation-1',
          messageHistory: [
            { role: 'assistant', status: 'TYPING', createdAt: '2026-05-17T04:51:00.000Z' },
          ],
        },
      ],
    })).toBe(true);
    expect(service.runtimeHasOngoingConversation({
      status: 'IDLE',
      conversations: [
        {
          id: 'conversation-1',
          messageHistory: [
            { role: 'assistant', status: 'TYPING', createdAt: '2026-05-17T04:51:00.000Z' },
          ],
        },
      ],
    })).toBe(false);
    expect(service.runtimeHasOngoingConversation({
      status: 'IDLE',
      conversations: [
        {
          id: 'conversation-1',
          messageHistory: [
            { role: 'assistant', status: 'IDLE', createdAt: '2026-05-17T04:51:00.000Z' },
          ],
        },
      ],
    })).toBe(false);
  });

  it('deduplicates concurrent polling ticks for the same agent', async () => {
    const localService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    let releaseFirstTick: any = null;
    localService.tickAgentRuntimePollingUnlocked = jest.fn(
      () => new Promise((resolve) => {
        releaseFirstTick = () => resolve({ memberId: 'member-1', triggered: true });
      }),
    );

    const firstTick = localService.tickAgentRuntimePolling('project-1', 'member-1', 'user-1');
    const secondTick = await localService.tickAgentRuntimePolling('project-1', 'member-1', 'user-1');

    expect(secondTick).toEqual({
      memberId: 'member-1',
      triggered: false,
      reason: 'Polling tick already in progress.',
    });
    expect(localService.tickAgentRuntimePollingUnlocked).toHaveBeenCalledTimes(1);

    releaseFirstTick?.();
    await expect(firstTick).resolves.toEqual({ memberId: 'member-1', triggered: true });
  });

  it('runs scheduled coordinator ticks as the project owner when a worker triggers the wake', async () => {
    jest.useFakeTimers();
    try {
      const localService = new ProjectsService(
        {
          project: {
            findFirst: jest.fn().mockResolvedValue({
              ownerId: 'owner-user',
              leadAgentUserId: 'lead-user',
            }),
          },
        } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { get: () => undefined } as never,
        {} as never,
      ) as any;
      localService.tickProjectCoordinator = jest.fn().mockResolvedValue({ dispatched: [], blocked: [] });

      localService.scheduleCoordinatorTick('project-1', 'worker-user', 'worker completed reviewable item', 0);
      await jest.runOnlyPendingTimersAsync();

      expect(localService.tickProjectCoordinator).toHaveBeenCalledWith('project-1', 'owner-user');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not send another automatic polling message right after a recent tick', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-06T10:00:10.000Z'));
    const session = {
      id: 'runtime-1',
      status: 'IDLE',
      pollingState: {
        lastRunAt: '2026-06-06T10:00:00.000Z',
        lastCompletedAt: null,
        nextRunAt: null,
      },
    };
    const localService = new ProjectsService(
      {
        projectMember: {
          findFirst: jest.fn().mockResolvedValue({ id: 'member-1', role: 'LEAD_AGENT', permissions: {} }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    localService.ensureProjectAccess = jest.fn().mockResolvedValue({});
    localService.readRuntimeSession = jest.fn().mockReturnValue(session);
    localService.recoverPersistedRuntimeSession = jest.fn((value) => value);
    localService.readAgentPollingConfig = jest.fn().mockReturnValue(null);
    localService.agentPollingConfigForRole = jest.fn().mockResolvedValue(config);
    localService.agentRuntimeLauncher = { inspect: jest.fn().mockResolvedValue(session) };
    localService.writeRuntimeSession = jest.fn();
    localService.createAgentRuntimeConversation = jest.fn();
    localService.sendAgentRuntimeMessage = jest.fn();

    const result = await localService.tickAgentRuntimePolling('project-1', 'member-1', 'owner-1');

    expect(result).toEqual(expect.objectContaining({
      memberId: 'member-1',
      role: 'LEAD_AGENT',
      triggered: false,
      reason: 'Polling was recently triggered.',
    }));
    expect(localService.createAgentRuntimeConversation).not.toHaveBeenCalled();
    expect(localService.sendAgentRuntimeMessage).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('runs a forced polling tick even when timed polling is disabled', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-06T10:00:00.000Z'));
    const disabledConfig = {
      ...config,
      enabled: false,
      message: 'manual run only',
    };
    const session = {
      id: 'runtime-1',
      runtimeId: 'runtime-1',
      role: 'LEAD_AGENT',
      status: 'IDLE',
      rolePrompt: 'large prompt body',
      activeConversationId: 'main',
      pollingState: {},
      conversations: [{ id: 'main', messageHistory: [] }],
    };
    const messageSession = {
      ...session,
      activeConversationId: 'poll-1',
      conversations: [
        ...session.conversations,
        { id: 'poll-1', messageHistory: [{ role: 'user', content: disabledConfig.message }] },
      ],
    };
    const localService = new ProjectsService(
      {
        projectMember: {
          findFirst: jest.fn().mockResolvedValue({ id: 'member-1', role: 'LEAD_AGENT', permissions: {} }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    localService.ensureProjectAccess = jest.fn().mockResolvedValue({});
    localService.readRuntimeSession = jest.fn().mockReturnValue(session);
    localService.recoverPersistedRuntimeSession = jest.fn((value) => value);
    localService.readAgentPollingConfig = jest.fn().mockReturnValue(disabledConfig);
    localService.agentPollingConfigForRole = jest.fn().mockResolvedValue(disabledConfig);
    localService.agentRuntimeLauncher = { inspect: jest.fn().mockResolvedValue(session) };
    localService.writeRuntimeSession = jest.fn();
    localService.createAgentRuntimeConversation = jest.fn().mockResolvedValue({
      conversation: { id: 'poll-1', title: 'polling 10:00' },
    });
    localService.sendAgentRuntimeMessage = jest.fn().mockResolvedValue({ session: messageSession });
    localService.latestRuntimeSessionForMember = jest.fn().mockResolvedValue(null);

    const result = await localService.tickAgentRuntimePolling('project-1', 'member-1', 'owner-1', { force: true, summary: true });

    expect(result).toEqual(expect.objectContaining({
      memberId: 'member-1',
      role: 'LEAD_AGENT',
      triggered: true,
      config: expect.objectContaining({ enabled: false, message: disabledConfig.message }),
      session: expect.objectContaining({
        runtimeId: 'runtime-1',
        role: 'LEAD_AGENT',
        status: 'IDLE',
        pollingConfig: expect.objectContaining({ enabled: false }),
        pollingState: expect.objectContaining({ lastConversationId: 'poll-1', nextRunAt: null }),
      }),
    }));
    expect(JSON.stringify(result.session)).not.toContain('rolePrompt');
    expect(JSON.stringify(result.session)).not.toContain('messageHistory');
    expect(localService.sendAgentRuntimeMessage).toHaveBeenCalledWith('project-1', 'member-1', 'owner-1', {
      message: disabledConfig.message,
      conversationId: 'poll-1',
    });
    expect(localService.writeRuntimeSession).toHaveBeenLastCalledWith(
      'member-1',
      expect.objectContaining({
        pollingConfig: expect.objectContaining({ enabled: false }),
        pollingState: expect.objectContaining({ lastConversationId: 'poll-1', nextRunAt: null }),
      }),
    );
    jest.useRealTimers();
  });

  it('reconnects a stopped local runtime before running a forced polling tick', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-06T10:00:00.000Z'));
    try {
      const stoppedSession = {
        id: 'runtime-1',
        runtimeId: 'runtime-1',
        provider: 'local-docker',
        role: 'LEAD_AGENT',
        status: 'STOPPED',
        pollingState: {},
      };
      const reconnectedSession = {
        ...stoppedSession,
        status: 'IDLE',
        activeConversationId: 'main',
        conversations: [{ id: 'main', messageHistory: [] }],
      };
      const messageSession = {
        ...reconnectedSession,
        activeConversationId: 'poll-1',
        conversations: [
          ...reconnectedSession.conversations,
          { id: 'poll-1', messageHistory: [{ role: 'user', content: config.message }] },
        ],
      };
      const localService = new ProjectsService(
        {
          projectMember: {
            findFirst: jest.fn().mockResolvedValue({ id: 'member-1', role: 'LEAD_AGENT', permissions: {} }),
          },
        } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { get: () => undefined } as never,
        {} as never,
      ) as any;
      localService.ensureProjectAccess = jest.fn().mockResolvedValue({});
      localService.readRuntimeSession = jest.fn().mockReturnValue(stoppedSession);
      localService.recoverPersistedRuntimeSession = jest.fn((value) => value);
      localService.readAgentPollingConfig = jest.fn().mockReturnValue(config);
      localService.agentPollingConfigForRole = jest.fn().mockResolvedValue(config);
      localService.agentRuntimeLauncher = {
        inspect: jest.fn()
          .mockResolvedValueOnce(stoppedSession)
          .mockResolvedValueOnce(reconnectedSession),
      };
      localService.reconnectAgentRuntime = jest.fn().mockResolvedValue({ session: reconnectedSession });
      localService.latestRuntimeSessionForMember = jest.fn().mockResolvedValue(null);
      localService.writeRuntimeSession = jest.fn();
      localService.createAgentRuntimeConversation = jest.fn().mockResolvedValue({
        conversation: { id: 'poll-1', title: 'polling 10:00' },
      });
      localService.sendAgentRuntimeMessage = jest.fn().mockResolvedValue({ session: messageSession });

      const result = await localService.tickAgentRuntimePolling(
        'project-1',
        'member-1',
        'owner-1',
        { force: true, summary: true },
      );

      expect(localService.reconnectAgentRuntime).toHaveBeenCalledWith('project-1', 'member-1', 'owner-1');
      expect(localService.agentRuntimeLauncher.inspect).toHaveBeenCalledTimes(2);
      expect(localService.sendAgentRuntimeMessage).toHaveBeenCalledWith('project-1', 'member-1', 'owner-1', {
        message: config.message,
        conversationId: 'poll-1',
      });
      expect(result).toEqual(expect.objectContaining({
        memberId: 'member-1',
        role: 'LEAD_AGENT',
        triggered: true,
      }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('reconnects a stopped lead runtime before sending a lead wake message', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-06T10:00:00.000Z'));
    try {
      const stoppedSession = {
        id: 'runtime-1',
        runtimeId: 'runtime-1',
        provider: 'local-docker',
        role: 'LEAD_AGENT',
        status: 'STOPPED',
        pollingState: {},
      };
      const reconnectedSession = {
        ...stoppedSession,
        status: 'IDLE',
        activeConversationId: 'main',
        conversations: [{ id: 'main', messageHistory: [] }],
      };
      const messageSession = {
        ...reconnectedSession,
        activeConversationId: 'poll-1',
        conversations: [
          ...reconnectedSession.conversations,
          { id: 'poll-1', messageHistory: [{ role: 'user', content: config.message }] },
        ],
      };
      const localService = new ProjectsService(
        {
          projectMember: {
            findFirst: jest.fn().mockResolvedValue({ id: 'member-1', role: 'LEAD_AGENT', permissions: {} }),
          },
        } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { get: () => undefined } as never,
        {} as never,
      ) as any;
      localService.ensureProjectAccess = jest.fn().mockResolvedValue({});
      localService.readRuntimeSession = jest.fn().mockReturnValue(stoppedSession);
      localService.recoverPersistedRuntimeSession = jest.fn((value) => value);
      localService.readAgentPollingConfig = jest.fn().mockReturnValue(config);
      localService.agentPollingConfigForRole = jest.fn().mockResolvedValue(config);
      localService.agentRuntimeLauncher = {
        inspect: jest.fn()
          .mockResolvedValueOnce(stoppedSession)
          .mockResolvedValueOnce(reconnectedSession),
      };
      localService.reconnectAgentRuntime = jest.fn().mockResolvedValue({ session: reconnectedSession });
      localService.latestRuntimeSessionForMember = jest.fn().mockResolvedValue(null);
      localService.writeRuntimeSession = jest.fn();
      localService.createAgentRuntimeConversation = jest.fn().mockResolvedValue({
        conversation: { id: 'poll-1', title: 'polling 10:00' },
      });
      localService.sendAgentRuntimeMessage = jest.fn().mockResolvedValue({ session: messageSession });

      const result = await localService.wakeLeadPolling('project-1', 'owner-1', 'resource request completed');

      expect(localService.reconnectAgentRuntime).toHaveBeenCalledWith('project-1', 'member-1', 'owner-1');
      expect(localService.agentRuntimeLauncher.inspect).toHaveBeenCalledTimes(2);
      expect(localService.sendAgentRuntimeMessage).toHaveBeenCalledWith('project-1', 'member-1', 'owner-1', {
        message: config.message,
        conversationId: 'poll-1',
      });
      expect(result).toEqual(expect.objectContaining({
        memberId: 'member-1',
        role: 'LEAD_AGENT',
        triggered: true,
        reason: 'resource request completed',
      }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not send another lead wake message right after a recent lead tick', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-06T10:00:10.000Z'));
    const session = {
      id: 'runtime-1',
      status: 'IDLE',
      pollingState: {
        lastRunAt: '2026-06-06T10:00:00.000Z',
        lastCompletedAt: null,
        nextRunAt: null,
      },
    };
    const localService = new ProjectsService(
      {
        projectMember: {
          findFirst: jest.fn().mockResolvedValue({ id: 'member-1', role: 'LEAD_AGENT', permissions: {} }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    localService.ensureProjectAccess = jest.fn().mockResolvedValue({});
    localService.readRuntimeSession = jest.fn().mockReturnValue(session);
    localService.recoverPersistedRuntimeSession = jest.fn((value) => value);
    localService.readAgentPollingConfig = jest.fn().mockReturnValue(null);
    localService.agentPollingConfigForRole = jest.fn().mockResolvedValue(config);
    localService.agentRuntimeLauncher = { inspect: jest.fn().mockResolvedValue(session) };
    localService.writeRuntimeSession = jest.fn();
    localService.createAgentRuntimeConversation = jest.fn();
    localService.sendAgentRuntimeMessage = jest.fn();

    const result = await localService.wakeLeadPolling('project-1', 'owner-1', 'resource update');

    expect(result).toEqual({
      memberId: 'member-1',
      role: 'LEAD_AGENT',
      triggered: false,
      reason: 'Lead polling was recently triggered.',
    });
    expect(localService.createAgentRuntimeConversation).not.toHaveBeenCalled();
    expect(localService.sendAgentRuntimeMessage).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('ProjectsService project role prompt overrides', () => {
  const service = new ProjectsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
    {} as never,
  ) as any;

  it('applies project-level prompt overrides on top of template role config', async () => {
    const config = await service.projectRoleConfigForRole('LEGAL_CLAUSE_AGENT', {
      projectTemplateRoles: [
        {
          role: 'LEGAL_CLAUSE_AGENT',
          label: 'Clause Analyst',
          initialPrompt: 'Template prompt',
          skillBundleRefs: ['skill://agent-workspace'],
        },
      ],
      projectRoleOverrides: {
        LEGAL_CLAUSE_AGENT: {
          initialPrompt: 'Project instance prompt',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      },
    });

    expect(config.label).toBe('Clause Analyst');
    expect(config.initialPrompt).toBe('Project instance prompt');
  });

  it('refreshes saved template roles and applies current prompts to runtime sessions', async () => {
    const prisma = {
      project: {
        update: jest.fn().mockResolvedValue({}),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'lead-member',
            role: 'LEAD_AGENT',
            permissions: {
              runtimeSession: {
                runtimeId: 'lead-runtime',
                status: 'IDLE',
                localRunnerJob: {
                  id: 'lead-job',
                  rolePrompt: 'Lead prompt v1',
                  files: [
                    {
                      path: 'AGENT_WORKSPACE_CONTEXT.json',
                      content: JSON.stringify({ rolePrompt: 'Lead prompt v1' }),
                    },
                  ],
                },
              },
            },
          },
          {
            id: 'worker-member',
            role: 'WORKER_AGENT',
            permissions: {
              runtimeSession: {
                runtimeId: 'worker-runtime',
                status: 'IDLE',
                localRunnerJob: {
                  id: 'worker-job',
                  rolePrompt: 'Worker prompt v1',
                  files: [],
                },
              },
            },
          },
        ]),
      },
    };
    const agentWorkspaceClient = {
      updateProject: jest.fn().mockResolvedValue({}),
    };
    const projectTemplatesService = {
      getTemplate: jest.fn().mockResolvedValue({
        id: 'hackerone-opportunity-research',
        label: 'HackerOne',
        version: '2',
        roles: [
          {
            role: 'LEAD_AGENT',
            label: 'Lead',
            initialPrompt: 'Lead prompt v2',
            skillBundleRefs: ['skill://agent-workspace'],
          },
          {
            role: 'WORKER_AGENT',
            label: 'Worker',
            initialPrompt: 'Worker prompt v2',
            skillBundleRefs: ['skill://agent-workspace'],
          },
        ],
        projectGlobals: [
          {
            key: 'max_active_items',
            label: 'Max Active Items',
            value: '300',
            isSecret: false,
            required: false,
            createTaskOnMissing: false,
            category: 'project-limits',
          },
        ],
      }),
    };
    const localService = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      projectTemplatesService as never,
    ) as any;
    localService.ensureProjectManager = jest.fn().mockResolvedValue({
      id: 'project-1',
      ownerId: 'owner-1',
      settings: {
        projectTemplateId: 'hackerone-opportunity-research',
        projectTemplateRoles: [
          {
            role: 'LEAD_AGENT',
            label: 'Lead',
            initialPrompt: 'Lead prompt v1',
            skillBundleRefs: ['skill://agent-workspace'],
          },
        ],
        projectRoleOverrides: {
          WORKER_AGENT: {
            initialPrompt: 'Project worker prompt',
          },
        },
        projectGlobals: [
          {
            key: 'HACKERONE_USERNAME',
            label: 'HackerOne Username',
            value: 'totol',
            isSecret: false,
            required: true,
          },
        ],
      },
    });
    localService.resolveProjectGlobalVariables = jest.fn().mockResolvedValue([]);
    localService.publishAgentRuntimeSessionEvent = jest.fn();
    localService.writeRuntimeSession = jest.fn();

    const result = await localService.refreshProjectTemplate('project-1', 'owner-1', { applyToRunning: true });

    expect(projectTemplatesService.getTemplate).toHaveBeenCalledWith('hackerone-opportunity-research', 'owner-1');
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: {
        settings: expect.objectContaining({
          projectTemplateRoles: expect.arrayContaining([
            expect.objectContaining({ role: 'LEAD_AGENT', initialPrompt: 'Lead prompt v2' }),
            expect.objectContaining({ role: 'WORKER_AGENT', initialPrompt: 'Worker prompt v2' }),
          ]),
          projectGlobals: expect.arrayContaining([
            expect.objectContaining({ key: 'max_active_items', value: '300' }),
            expect.objectContaining({ key: 'HACKERONE_USERNAME', value: 'totol' }),
          ]),
        }),
      },
    });
    expect(agentWorkspaceClient.updateProject).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        settings: expect.objectContaining({
          projectTemplateId: 'hackerone-opportunity-research',
        }),
      }),
    );
    expect(localService.writeRuntimeSession).toHaveBeenCalledTimes(2);
    const leadSession = localService.writeRuntimeSession.mock.calls[0][1];
    const workerSession = localService.writeRuntimeSession.mock.calls[1][1];
    expect(leadSession.rolePrompt).toBe('Lead prompt v2');
    expect(workerSession.rolePrompt).toBe('Project worker prompt');
    expect(leadSession.localRunnerJob.rolePrompt).toBe('Lead prompt v2');
    expect(JSON.parse(leadSession.localRunnerJob.files[0].content).rolePrompt).toBe('Lead prompt v2');
    expect(result.updatedRuntimeMemberIds).toEqual(['lead-member', 'worker-member']);
  });

  it('defaults runtime-launched agents to the production-safe local runner mode on agentcraft.work', () => {
    const productionService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: (key: string) => key === 'AIFACTORY_PUBLIC_API_BASE_URL' ? 'https://api.agentcraft.work/api' : undefined } as never,
      {} as never,
    ) as any;

    expect(productionService.defaultAgentRuntimeLaunchMode()).toBe('local-runner');
    expect(productionService.defaultAgentRuntimeLaunchMode({ provider: 'aws-agentcore' })).toBe('aws-agentcore');
  });

  it('uses explicit runtime launch environment defaults before url heuristics', () => {
    const prodService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        get: (key: string) => key === 'AIFACTORY_RUNTIME_LAUNCH_ENVIRONMENT' ? 'production' : undefined,
      } as never,
      {} as never,
    ) as any;
    const localService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        get: (key: string) => {
          if (key === 'AIFACTORY_RUNTIME_LAUNCH_ENVIRONMENT') return 'local';
          if (key === 'AIFACTORY_PUBLIC_API_BASE_URL') return 'https://api.agentcraft.work/api';
          return undefined;
        },
      } as never,
      {} as never,
    ) as any;

    expect(prodService.defaultAgentRuntimeLaunchMode()).toBe('local-runner');
    expect(localService.defaultAgentRuntimeLaunchMode()).toBe('local-docker');
  });

  it('maps template local-docker coordinator rules to local-runner on agentcraft.work', () => {
    const productionService = new ProjectsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: (key: string) => key === 'AIFACTORY_PUBLIC_API_BASE_URL' ? 'https://api.agentcraft.work/api' : undefined } as never,
      {} as never,
    ) as any;

    const flow = productionService.resolveProjectWorkItemStatusFlow({
      workItemStatusFlow: {
        dispatchRules: [
          {
            statuses: ['READY'],
            workTypes: ['PLANNING'],
            role: 'PLANNER_AGENT',
            launchMode: 'local-docker',
            agentType: 'pi',
          },
        ],
        coordinator: {
          enabled: true,
          launchMode: 'local-docker',
          agentType: 'pi',
        },
      },
    });

    expect(productionService.effectiveAgentRuntimeLaunchMode('local-docker')).toBe('local-runner');
    expect(flow.coordinator.launchMode).toBe('local-runner');
    expect(flow.dispatchRules[0].launchMode).toBe('local-runner');
  });

  it('enables coordinator and lead polling when activating a project', async () => {
    const project = {
      id: 'project-1',
      ownerId: 'owner-1',
      leadAgentUserId: null,
      settings: {
        coordinator: { enabled: false, maxDispatchesPerTick: 2, launchMode: 'local-runner' },
      },
    };
    const leadPermissions = {
      agentPollingConfig: {
        enabled: false,
        strategy: 'IDLE_ONLY',
        intervalMinutes: 15,
        message: 'lead loop',
      },
    };
    const prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue(project),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...project, ...data })),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lead-member', role: 'LEAD_AGENT', permissions: leadPermissions },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const agentWorkspaceClient = {
      updateProject: jest.fn().mockResolvedValue({}),
    };
    const service = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    service.agentPollingConfigForRole = jest.fn(async (_role: string, value: any) => ({
      enabled: Boolean(value?.enabled),
      strategy: value?.strategy || 'IDLE_ONLY',
      intervalMinutes: value?.intervalMinutes || 15,
      message: value?.message || 'lead loop',
    }));
    service.scheduleCoordinatorTick = jest.fn();
    service.scheduleLeadPollingWake = jest.fn();

    await service.setProjectStatus('project-1', 'owner-1', 'ACTIVE');

    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'project-1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        settings: expect.objectContaining({
          workItemStatusFlow: expect.objectContaining({
            coordinator: expect.objectContaining({
              enabled: true,
              launchMode: 'local-runner',
              maxDispatchesPerTick: 2,
              updatedById: 'owner-1',
            }),
          }),
        }),
      }),
    }));
    expect(agentWorkspaceClient.updateProject).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'ACTIVE',
        settings: expect.objectContaining({
          workItemStatusFlow: expect.objectContaining({
            coordinator: expect.objectContaining({ enabled: true }),
          }),
        }),
      }),
    );
    expect(prisma.projectMember.update).toHaveBeenCalledWith({
      where: { id: 'lead-member' },
      data: {
        permissions: expect.objectContaining({
          agentPollingConfig: expect.objectContaining({ enabled: true }),
        }),
      },
    });
    expect(service.scheduleCoordinatorTick).toHaveBeenCalledWith('project-1', 'owner-1', 'project activated', 250);
    expect(service.scheduleLeadPollingWake).toHaveBeenCalledWith('project-1', 'owner-1', 'project activated');
  });

  it('disables coordinator and lead polling when pausing a project', async () => {
    const project = {
      id: 'project-1',
      ownerId: 'owner-1',
      leadAgentUserId: null,
      settings: {
        workItemStatusFlow: {
          coordinator: { enabled: true, maxDispatchesPerTick: 2 },
        },
      },
    };
    const leadPermissions = {
      agentPollingConfig: {
        enabled: true,
        strategy: 'IDLE_ONLY',
        intervalMinutes: 15,
        message: 'lead loop',
      },
      runtimeSession: {
        id: 'runtime-1',
        status: 'IDLE',
        pollingConfig: { enabled: true, strategy: 'IDLE_ONLY', intervalMinutes: 15, message: 'lead loop' },
        pollingState: { nextRunAt: '2026-06-06T10:15:00.000Z', lastError: 'old' },
        conversations: [],
      },
    };
    const prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue(project),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...project, ...data })),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lead-member', role: 'LEAD_AGENT', permissions: leadPermissions },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const agentWorkspaceClient = {
      updateProject: jest.fn().mockResolvedValue({}),
    };
    const service = new ProjectsService(
      prisma as never,
      agentWorkspaceClient as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    ) as any;
    service.agentPollingConfigForRole = jest.fn(async (_role: string, value: any) => ({
      enabled: Boolean(value?.enabled),
      strategy: value?.strategy || 'IDLE_ONLY',
      intervalMinutes: value?.intervalMinutes || 15,
      message: value?.message || 'lead loop',
    }));
    service.publishAgentRuntimeSessionEvent = jest.fn();
    const coordinatorTimer = setTimeout(() => undefined, 10_000);
    const leadPollingTimer = setTimeout(() => undefined, 10_000);
    service.coordinatorTickTimers.set('project-1', coordinatorTimer);
    service.leadPollingWakeTimers.set('project-1', leadPollingTimer);

    await service.setProjectStatus('project-1', 'owner-1', 'PAUSED');

    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PAUSED',
        settings: expect.objectContaining({
          workItemStatusFlow: expect.objectContaining({
            coordinator: expect.objectContaining({ enabled: false }),
          }),
        }),
      }),
    }));
    expect(prisma.projectMember.update).toHaveBeenCalledWith({
      where: { id: 'lead-member' },
      data: {
        permissions: expect.objectContaining({
          agentPollingConfig: expect.objectContaining({ enabled: false }),
          runtimeSession: expect.objectContaining({
            pollingConfig: expect.objectContaining({ enabled: false }),
            pollingState: expect.objectContaining({ nextRunAt: null, lastError: null }),
          }),
        }),
      },
    });
    expect(agentWorkspaceClient.updateProject).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ status: 'PAUSED' }),
    );
    expect(service.coordinatorTickTimers.has('project-1')).toBe(false);
    expect(service.leadPollingWakeTimers.has('project-1')).toBe(false);
  });
});
