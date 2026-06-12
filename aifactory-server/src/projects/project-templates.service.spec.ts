import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { ProjectTemplatesService } from './project-templates.service';

describe('ProjectTemplatesService', () => {
  it('adds owner and lead roles to every normalized project template', () => {
    const service = new ProjectTemplatesService({ get: () => undefined } as never) as any;

    const template = service.normalizeTemplate('custom', {
      label: 'Custom Template',
      roles: [
        {
          role: 'WORKER_AGENT',
          ref: 'role://worker-agent',
          launchable: true,
        },
      ],
    });

    expect(template.roles.map((entry: { role: string }) => entry.role)).toEqual([
      'OWNER',
      'LEAD_AGENT',
      'WORKER_AGENT',
    ]);
    expect(template.roles[1]).toEqual(
      expect.objectContaining({
        role: 'LEAD_AGENT',
        auto: 'ON_CREATE',
        launchable: false,
      }),
    );
  });

  it('keeps the HackerOne template on local Docker Pi launch profiles', async () => {
    const service = new ProjectTemplatesService({
      get: (key: string) =>
        key === 'AGENT_WORKSPACE_PROJECT_TEMPLATES_PATH'
          ? resolve(process.cwd(), '..', 'agent-workspace', 'project-templates')
          : undefined,
    } as never);

    const template = await service.getTemplate('hackerone-opportunity-research');

    expect(template.projectFileFolders).toEqual(expect.arrayContaining(['analysed', 'opportunities']));
    expect(template.workItemStatusFlow?.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'REPORT_READY', label: '发送' }),
      ]),
    );
    expect(template.workItemStatusFlow?.dispatchRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'INTEGRATOR_AGENT', statuses: ['REPORT_READY'] }),
        expect.objectContaining({ role: 'PLANNER_AGENT', workTypes: expect.arrayContaining(['OPPORTUNITY_DISCOVERY']) }),
      ]),
    );
    expect(template.workItemStatusFlow?.coordinator).toEqual(
      expect.objectContaining({ enabled: true, launchMode: 'local-docker', agentType: 'pi' }),
    );
    expect(template.roleLaunchProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'LEAD_AGENT', launchMode: 'local-docker', agentType: 'pi' }),
        expect.objectContaining({ role: 'PLANNER_AGENT', launchMode: 'local-docker', agentType: 'pi' }),
        expect.objectContaining({ role: 'WORKER_AGENT', launchMode: 'local-docker', agentType: 'pi' }),
      ]),
    );
    const lead = template.roles.find((entry) => entry.role === 'LEAD_AGENT');
    expect(lead?.initialPrompt).toContain('prefer local-docker Pi workers');
    expect(lead?.initialPrompt).toContain('On every polling tick');
    expect(lead?.initialPrompt).toContain('analysed/project-addresses.jsonl');
    expect(lead?.initialPrompt).toContain('coordination/lead-goal-ledger.jsonl');
    expect(lead?.initialPrompt).toContain('statusDigest');
    expect(lead?.initialPrompt).toContain('skip any candidate whose normalized HackerOne project/program URL');
    expect(lead?.initialPrompt).toContain('parse runtime comments for claimed evidence/coverage paths');
    expect(lead?.initialPrompt).toContain('regenerate bounded Phase 1 evidence from public/passive sources');
    expect(lead?.initialPrompt).toContain('inputPacket.requiredGlobals set to those exact keys');
    expect(lead?.initialPrompt).toContain('The coordinator will hold the continuation while requiredGlobals are missing');
    expect(lead?.polling?.message).toContain('analysed/ project-address records');
    expect(lead?.polling?.message).toContain('do not create a new generic HackerOne Opportunity Discovery/Ongoing Target goal');
    expect(lead?.polling).toEqual(
      expect.objectContaining({
        enabled: true,
        strategy: 'IDLE_ONLY',
        intervalMinutes: 10,
      }),
    );
    const planner = template.roles.find((entry) => entry.role === 'PLANNER_AGENT');
    expect(planner?.initialPrompt).toContain('HackerOne opportunity discovery');
    expect(planner?.initialPrompt).toContain('When any unfinished goal other than that explicit meta goal exists');
    expect(planner?.initialPrompt).toContain('create the smallest linked READY SECURITY_TEST Phase 1 work item');
    expect(planner?.initialPrompt).toContain('/goals/runtime-create');
    expect(planner?.initialPrompt).toContain('/work-items/runtime-create');
    expect(planner?.initialPrompt).toContain('linked READY SECURITY_TEST Phase 1 work item');
    expect(planner?.initialPrompt).toContain('planner creates analysis records, target goals, and the first dispatchable item');
    expect(planner?.initialPrompt).toContain('read all project shared files under analysed/');
    expect(planner?.initialPrompt).toContain('append a concise JSONL exclusion record under analysed/project-addresses.jsonl');
    expect(planner?.initialPrompt).toContain('top-level outputProjectFiles with exact per-program paths');
    const worker = template.roles.find((entry) => entry.role === 'WORKER_AGENT');
    expect(worker?.initialPrompt).toContain('Never mention an evidence/coverage path in your handoff unless');
    expect(worker?.initialPrompt).toContain('rerun only the bounded passive/public Phase 1 steps');
    expect(worker?.initialPrompt).toContain('create exactly one linked READY SECURITY_TEST continuation item');
    expect(worker?.initialPrompt).toContain('inputPacket.phase to "phase2-authenticated-validation"');
    expect(worker?.capabilityBundles || []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requiredProjectGlobals: expect.arrayContaining(['hackerone_api_token']),
        }),
      ]),
    );
    const auditor = template.roles.find((entry) => entry.role === 'SECURITY_AUDITOR');
    expect(auditor?.initialPrompt).toContain('reuse their exact inputPacket.resourceRequest.key values');
    expect(auditor?.initialPrompt).toContain('h1_goal_<program>_account_a_email');
    expect(auditor?.initialPrompt).toContain('Never create broad bundled account keys');
    expect(auditor?.initialPrompt).toContain('each resourceRequest maps to exactly one project global');
  });

  it('ships the default template with explicit coordinator dispatch rules', async () => {
    const service = new ProjectTemplatesService({
      get: (key: string) =>
        key === 'AGENT_WORKSPACE_PROJECT_TEMPLATES_PATH'
          ? resolve(process.cwd(), '..', 'agent-workspace', 'project-templates')
          : undefined,
    } as never);

    const template = await service.getTemplate('default');

    expect(template.roles.map((entry) => entry.role)).toEqual(
      expect.arrayContaining(['COORDINATOR', 'LEAD_AGENT', 'WORKER_AGENT', 'REVIEW_AGENT']),
    );
    expect(template.workItemStatusFlow?.coordinator).toEqual(
      expect.objectContaining({ enabled: true, maxDispatchesPerTick: 3 }),
    );
    expect(template.workItemStatusFlow?.dispatchRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'PLANNER_AGENT', workTypes: ['INTAKE', 'PLANNING'] }),
        expect.objectContaining({ role: 'REVIEW_AGENT', statuses: ['IN_REVIEW'] }),
        expect.objectContaining({ role: 'WORKER_AGENT', statuses: ['READY', 'NEEDS_REVISION'] }),
      ]),
    );
  });

  it('routes legal contract review items through legal specialist coordinator rules', async () => {
    const service = new ProjectTemplatesService({
      get: (key: string) =>
        key === 'AGENT_WORKSPACE_PROJECT_TEMPLATES_PATH'
          ? resolve(process.cwd(), '..', 'agent-workspace', 'project-templates')
          : undefined,
    } as never);

    const template = await service.getTemplate('legal-contract-review');

    expect(template.roles.map((entry) => entry.role)).toEqual(
      expect.arrayContaining(['COORDINATOR', 'LEGAL_CLAUSE_AGENT', 'LEGAL_RECOMMENDATIONS_AGENT']),
    );
    expect(template.workItemStatusFlow?.coordinator).toEqual(
      expect.objectContaining({ enabled: true, maxAgents: 8 }),
    );
    expect(template.workItemStatusFlow?.dispatchRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'LEGAL_CLAUSE_AGENT',
          workTypes: expect.arrayContaining(['LEGAL_CLAUSE_REVIEW']),
        }),
        expect.objectContaining({
          role: 'LEGAL_RECOMMENDATIONS_AGENT',
          workTypes: expect.arrayContaining(['LEGAL_RECOMMENDATIONS']),
        }),
      ]),
    );
    const lead = template.roles.find((entry) => entry.role === 'LEAD_AGENT');
    expect(lead?.initialPrompt).toContain('treat the COORDINATOR as the primary dispatcher');
    expect(lead?.initialPrompt).toContain('use runtime-dispatch as a fallback');
  });
});

describe('ProjectTemplatesService template-local roles', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'project-templates-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('merges roles from template roles directories over inline template JSON roles', async () => {
    const templateDir = join(root, 'custom-template');
    await mkdir(join(templateDir, 'roles', 'lead-agent'), { recursive: true });
    await mkdir(join(templateDir, 'roles', 'review-agent'), { recursive: true });

    await writeFile(
      join(templateDir, 'template.json'),
      JSON.stringify({
        id: 'custom-template',
        label: 'Custom Template',
        roles: [
          {
            role: 'LEAD_AGENT',
            ref: 'role://lead-agent',
            auto: 'ON_CREATE',
            launchable: false,
            initialPrompt: 'inline prompt',
            skillBundleRefs: ['skill://agent-workspace'],
          },
          {
            role: 'WORKER_AGENT',
            launchable: true,
          },
        ],
      }),
    );
    await writeFile(
      join(templateDir, 'roles', 'lead-agent', 'role.json'),
      JSON.stringify({
        initialPrompt: 'directory prompt',
        skillBundleRefs: [
          'skill://agent-workspace',
          'template-role-skill://custom-template/lead-agent/template-lead',
        ],
        polling: {
          enabled: true,
          strategy: 'IDLE_ONLY',
          intervalMinutes: 15,
          message: 'poll from directory',
        },
      }),
    );
    await writeFile(
      join(templateDir, 'roles', 'review-agent', 'role.json'),
      JSON.stringify({
        label: 'Directory Reviewer',
        launchable: true,
        skillBundleRefs: ['template-role-skill://custom-template/review-agent/template-review'],
      }),
    );

    const service = new ProjectTemplatesService({
      get: (key: string) => (key === 'AGENT_WORKSPACE_PROJECT_TEMPLATES_PATH' ? root : undefined),
    } as never);

    const template = await service.getTemplate('custom-template');
    const lead = template.roles.find((entry) => entry.role === 'LEAD_AGENT');
    const review = template.roles.find((entry) => entry.role === 'REVIEW_AGENT');

    expect(lead).toEqual(
      expect.objectContaining({
        ref: 'role://lead-agent',
        auto: 'ON_CREATE',
        launchable: false,
        initialPrompt: 'directory prompt',
        polling: expect.objectContaining({ message: 'poll from directory' }),
      }),
    );
    expect(lead?.skillBundleRefs).toEqual([
      'skill://agent-workspace',
      'template-role-skill://custom-template/lead-agent/template-lead',
    ]);
    expect(template.roles.map((entry) => entry.role)).toEqual([
      'OWNER',
      'LEAD_AGENT',
      'WORKER_AGENT',
      'REVIEW_AGENT',
    ]);
    expect(review).toEqual(
      expect.objectContaining({
        role: 'REVIEW_AGENT',
        label: 'Directory Reviewer',
        launchable: true,
      }),
    );
  });
});
