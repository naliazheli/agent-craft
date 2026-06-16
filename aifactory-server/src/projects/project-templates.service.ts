import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AgentWorkspaceClient } from './agent-workspace.client';

export type ProjectTemplateRoleEntry = {
  role: string;
  ref?: string;
  auto?: 'OWNER' | 'ON_CREATE' | null;
  launchable?: boolean;
  label?: string | null;
  description?: string | null;
  skills?: Array<{
    ref: string;
    name?: string | null;
    source?: 'external' | 'role' | 'template' | 'project' | null;
    path?: string | null;
    description?: string | null;
  }>;
  skillBundleRefs?: string[];
  capabilityBundleRefs?: string[];
  capabilityBundles?: ProjectTemplateCapabilityBundleRef[];
  runtimeCompatibility?: ProjectTemplateRuntimeCompatibility | null;
  initialPrompt?: string | null;
  scopes?: string[];
  polling?: Record<string, any> | null;
};

export type ProjectTemplateCapabilityBundleRef = {
  ref: string;
  required?: boolean;
  purpose?: string | null;
  requiredScopes?: string[];
  requiredProjectGlobals?: string[];
  surfaces?: string[];
  runtimeCompatibility?: ProjectTemplateRuntimeCompatibility | null;
};

export type ProjectTemplateRuntimeCompatibility = {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  agentTypes?: Record<string, {
    status?: 'native' | 'degraded' | 'unsupported';
    notes?: string[];
    unsupportedFeatures?: string[];
  }>;
};

export type ProjectTemplateGlobalVariable = {
  key: string;
  label?: string | null;
  description?: string | null;
  value?: string | null;
  isSecret?: boolean;
  required?: boolean;
  createTaskOnMissing?: boolean;
  category?: string | null;
};

export type ProjectTemplateConfig = {
  id: string;
  label: string;
  description?: string;
  version?: string;
  settings?: Record<string, any>;
  workItemStatusFlow?: Record<string, any>;
  roleLaunchProfiles?: Array<Record<string, any>>;
  projectFileFolders: string[];
  roles: ProjectTemplateRoleEntry[];
  projectGlobals: ProjectTemplateGlobalVariable[];
};

const DEFAULT_TEMPLATE_ID = 'default';
const DEFAULT_OWNER_TEMPLATE_ROLE: ProjectTemplateRoleEntry = {
  role: 'OWNER',
  ref: 'role://owner',
  auto: 'OWNER',
  launchable: false,
};
const DEFAULT_LEAD_TEMPLATE_ROLE: ProjectTemplateRoleEntry = {
  role: 'LEAD_AGENT',
  ref: 'role://lead-agent',
  auto: 'ON_CREATE',
  launchable: false,
};

function cleanStringList(value: any): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

function normalizeCapabilityBundles(value: any): ProjectTemplateCapabilityBundleRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const bundles = value
    .map((entry): ProjectTemplateCapabilityBundleRef | null => {
      const ref = typeof entry?.ref === 'string' ? entry.ref.trim() : '';
      if (!ref) return null;
      return {
        ref,
        required: entry?.required !== false,
        purpose: typeof entry?.purpose === 'string' && entry.purpose.trim() ? entry.purpose.trim() : null,
        requiredScopes: cleanStringList(entry?.requiredScopes),
        requiredProjectGlobals: cleanStringList(entry?.requiredProjectGlobals),
        surfaces: cleanStringList(entry?.surfaces),
        runtimeCompatibility: normalizeRuntimeCompatibility(entry?.runtimeCompatibility),
      };
    })
    .filter((entry): entry is ProjectTemplateCapabilityBundleRef => Boolean(entry));
  return bundles.length ? bundles : undefined;
}

function normalizeRuntimeCompatibility(value: any): ProjectTemplateRuntimeCompatibility | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const agentTypes = value.agentTypes && typeof value.agentTypes === 'object' && !Array.isArray(value.agentTypes)
    ? Object.fromEntries(
        Object.entries(value.agentTypes)
          .filter(([agentType]) => agentType.trim())
          .map(([agentType, policy]: [string, any]) => [
            agentType.trim(),
            {
              status: ['native', 'degraded', 'unsupported'].includes(policy?.status) ? policy.status : undefined,
              notes: cleanStringList(policy?.notes),
              unsupportedFeatures: cleanStringList(policy?.unsupportedFeatures),
            },
          ]),
      )
    : undefined;
  return {
    requiredFeatures: cleanStringList(value.requiredFeatures),
    optionalFeatures: cleanStringList(value.optionalFeatures),
    ...(agentTypes && Object.keys(agentTypes).length ? { agentTypes } : {}),
  };
}

const FALLBACK_DEFAULT_TEMPLATE: ProjectTemplateConfig = {
  id: DEFAULT_TEMPLATE_ID,
  label: 'General Project Template',
  description:
    'Built-in fallback general-purpose project template used when the agent-workspace project-templates directory is unavailable.',
  version: '0.1',
  settings: {
    maxActiveAgents: 10,
    maxActiveGoals: 5,
  },
  roleLaunchProfiles: [
    { role: 'LEAD_AGENT', launchMode: 'local-docker', agentType: 'pi', deploymentDays: 1 },
    { role: 'PLANNER_AGENT', launchMode: 'local-docker', agentType: 'pi', deploymentDays: 1 },
    { role: 'WORKER_AGENT', launchMode: 'local-docker', agentType: 'pi', deploymentDays: 1 },
    { role: 'REVIEW_AGENT', launchMode: 'local-docker', agentType: 'pi', deploymentDays: 1 },
    { role: 'SECURITY_AUDITOR', launchMode: 'local-docker', agentType: 'pi', deploymentDays: 1 },
    { role: 'PM_AGENT', launchMode: 'local-docker', agentType: 'pi', deploymentDays: 1 },
    { role: 'INTEGRATOR_AGENT', launchMode: 'local-docker', agentType: 'pi', deploymentDays: 1 },
  ],
  projectFileFolders: ['inputs', 'research', 'work', 'deliverables', 'reviews', 'coordination', 'scratch'],
  roles: [
    { ...DEFAULT_OWNER_TEMPLATE_ROLE },
    { ...DEFAULT_LEAD_TEMPLATE_ROLE },
    { role: 'PLANNER_AGENT', ref: 'role://planner-agent', launchable: true },
    { role: 'WORKER_AGENT', ref: 'role://worker-agent', launchable: true },
    { role: 'REVIEW_AGENT', ref: 'role://review-agent', launchable: true },
    { role: 'SECURITY_AUDITOR', ref: 'role://security-auditor', launchable: true },
    { role: 'PM_AGENT', ref: 'role://pm-agent', launchable: true },
    { role: 'INTEGRATOR_AGENT', ref: 'role://integrator-agent', launchable: true },
  ],
  projectGlobals: [],
};

function withDefaultProjectRoles(roles: ProjectTemplateRoleEntry[]): ProjectTemplateRoleEntry[] {
  const normalized = roles.map((role) => ({ ...role }));
  const hasOwner = normalized.some((entry) => entry.role === 'OWNER');
  const hasLead = normalized.some((entry) => entry.role === 'LEAD_AGENT');

  if (!hasOwner) {
    normalized.unshift({ ...DEFAULT_OWNER_TEMPLATE_ROLE });
  }

  if (!hasLead) {
    const ownerIndex = normalized.findIndex((entry) => entry.role === 'OWNER');
    normalized.splice(ownerIndex >= 0 ? ownerIndex + 1 : 0, 0, { ...DEFAULT_LEAD_TEMPLATE_ROLE });
  }

  return normalized;
}

@Injectable()
export class ProjectTemplatesService {
  private readonly logger = new Logger(ProjectTemplatesService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma?: PrismaService,
    private readonly agentWorkspaceClient?: AgentWorkspaceClient,
  ) {}

  templatesPath() {
    const configured = this.configService.get<string>('AGENT_WORKSPACE_PROJECT_TEMPLATES_PATH');
    if (configured) return resolve(configured);
    const candidates = [
      '/agent-workspace/project-templates',
      resolve(process.cwd(), 'agent-workspace-bundle', 'project-templates'),
      resolve(process.cwd(), '..', 'agent-workspace', 'project-templates'),
    ];
    return candidates.find((path) => existsSync(path)) || candidates[candidates.length - 1];
  }

  async listTemplates(userId?: string | null): Promise<ProjectTemplateConfig[]> {
    const root = this.templatesPath();
    let ids: string[] = [];
    try {
      const entries = await readdir(root, { withFileTypes: true });
      ids = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
      ids = [];
    }

    const templates: ProjectTemplateConfig[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const template = await this.tryReadTemplate(id);
      if (template) {
        templates.push(template);
        seen.add(template.id);
      }
    }

    if (!seen.has(DEFAULT_TEMPLATE_ID)) {
      templates.unshift(FALLBACK_DEFAULT_TEMPLATE);
    } else {
      templates.sort((a, b) => {
        if (a.id === DEFAULT_TEMPLATE_ID) return -1;
        if (b.id === DEFAULT_TEMPLATE_ID) return 1;
        return a.label.localeCompare(b.label);
      });
    }
    if (userId && this.prisma) {
      const personalTemplates = await this.prisma.projectPersonalTemplate.findMany({
        where: { ownerId: userId },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }).catch(() => []);
      templates.push(...personalTemplates.map((template: any) => ({
        id: `personal:${template.id}`,
        label: template.name,
        description: template.description || 'Personal project template saved from one of your projects.',
        version: 'personal',
        settings: template.snapshotSummary?.settings &&
          typeof template.snapshotSummary.settings === 'object' &&
          !Array.isArray(template.snapshotSummary.settings)
          ? template.snapshotSummary.settings
          : undefined,
        workItemStatusFlow: template.snapshotSummary?.workItemStatusFlow &&
          typeof template.snapshotSummary.workItemStatusFlow === 'object' &&
          !Array.isArray(template.snapshotSummary.workItemStatusFlow)
          ? template.snapshotSummary.workItemStatusFlow
          : undefined,
        projectFileFolders: Array.isArray(template.snapshotSummary?.projectFileFolders)
          ? template.snapshotSummary.projectFileFolders
          : [],
        roles: Array.isArray(template.snapshotSummary?.roles) ? template.snapshotSummary.roles : [],
        projectGlobals: Array.isArray(template.snapshotSummary?.projectGlobals)
          ? template.snapshotSummary.projectGlobals
          : [],
      })));
    }
    return templates;
  }

  async getTemplate(id?: string | null, userId?: string | null): Promise<ProjectTemplateConfig> {
    const targetId = (id || DEFAULT_TEMPLATE_ID).trim() || DEFAULT_TEMPLATE_ID;
    if (targetId.startsWith('personal:')) {
      const personalId = targetId.replace(/^personal:/, '').trim();
      const template = await this.getPersonalTemplate(personalId, userId);
      if (template) return template;
    }
    const template = await this.tryReadTemplate(targetId);
    if (template) return template;

    if (targetId === DEFAULT_TEMPLATE_ID) {
      return FALLBACK_DEFAULT_TEMPLATE;
    }
    throw new NotFoundException(`Project template "${targetId}" not found`);
  }

  private async getPersonalTemplate(id: string, userId?: string | null): Promise<ProjectTemplateConfig | null> {
    if (!this.prisma || !this.agentWorkspaceClient || !userId || !id) return null;
    const record = await this.prisma.projectPersonalTemplate.findFirst({
      where: { id, ownerId: userId },
    });
    if (!record?.sourceProjectId || !record.templateKey) return null;
    const response = await this.agentWorkspaceClient.readProjectFile(record.sourceProjectId, record.templateKey, 'text');
    const parsed = JSON.parse(String(response.content || '{}'));
    return this.normalizeTemplate(record.id, {
      ...parsed,
      id: `personal:${record.id}`,
      label: record.name,
      description: record.description || parsed.description,
    });
  }

  private async tryReadTemplate(id: string): Promise<ProjectTemplateConfig | null> {
    const slug = id.trim();
    if (!slug) return null;
    const templateDir = resolve(this.templatesPath(), slug);
    const file = resolve(templateDir, 'template.json');
    try {
      const raw = await readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      const directoryRoles = await this.loadTemplateDirectoryRoles(slug, templateDir);
      return this.normalizeTemplate(slug, parsed, directoryRoles);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.warn(`Failed to read project template ${slug}: ${(err as Error).message}`);
      }
      return null;
    }
  }

  private async loadTemplateDirectoryRoles(slug: string, templateDir: string): Promise<ProjectTemplateRoleEntry[]> {
    const rolesDir = resolve(templateDir, 'roles');
    const entries = await readdir(rolesDir, { withFileTypes: true }).catch(() => []);
    const roles: ProjectTemplateRoleEntry[] = [];
    for (const entry of entries) {
      const roleFile = entry.isDirectory()
        ? resolve(rolesDir, entry.name, 'role.json')
        : entry.isFile() && entry.name.toLowerCase().endsWith('.json')
          ? resolve(rolesDir, entry.name)
          : null;
      if (!roleFile) continue;
      const inferredRole = entry.isDirectory() ? entry.name : basename(entry.name, '.json');
      try {
        const raw = await readFile(roleFile, 'utf8');
        const role = this.normalizeRoleEntry(JSON.parse(raw), inferredRole);
        if (role) roles.push(role);
      } catch (err) {
        this.logger.warn(`Failed to read project template role ${slug}/${inferredRole}: ${(err as Error).message}`);
      }
    }
    return roles;
  }

  private inferRoleFromSlug(slug?: string | null) {
    return (slug || '')
      .trim()
      .replace(/\.json$/i, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  }

  private normalizeRoleEntry(entry: any, inferredSlug?: string | null): ProjectTemplateRoleEntry | null {
    const role =
      typeof entry?.role === 'string' && entry.role.trim()
        ? entry.role.trim()
        : this.inferRoleFromSlug(inferredSlug);
    if (!role) return null;
    const auto = entry?.auto === 'OWNER' || entry?.auto === 'ON_CREATE' ? entry.auto : undefined;
    const skills = Array.isArray(entry?.skills)
      ? entry.skills
          .map((skill: any) => {
            const ref = typeof skill?.ref === 'string' ? skill.ref.trim() : '';
            if (!ref) return null;
            return {
              ref,
              name: typeof skill?.name === 'string' && skill.name.trim() ? skill.name.trim() : null,
              source:
                skill?.source === 'external' || skill?.source === 'role' || skill?.source === 'template' || skill?.source === 'project'
                  ? skill.source
                  : null,
              path: typeof skill?.path === 'string' && skill.path.trim() ? skill.path.trim() : null,
              description:
                typeof skill?.description === 'string' && skill.description.trim()
                  ? skill.description.trim()
                  : null,
            };
          })
          .filter(
            (
              skill: NonNullable<ProjectTemplateRoleEntry['skills']>[number] | null,
            ): skill is NonNullable<ProjectTemplateRoleEntry['skills']>[number] => Boolean(skill),
          )
      : undefined;
    const skillBundleRefs = cleanStringList(entry?.skillBundleRefs);
    const capabilityBundleRefs = cleanStringList(entry?.capabilityBundleRefs);
    const capabilityBundles = normalizeCapabilityBundles(entry?.capabilityBundles);
    const runtimeCompatibility = normalizeRuntimeCompatibility(entry?.runtimeCompatibility);
    const scopes = cleanStringList(entry?.scopes);
    const polling = entry?.polling && typeof entry.polling === 'object' && !Array.isArray(entry.polling)
      ? entry.polling
      : undefined;
    const normalized: ProjectTemplateRoleEntry = { role };
    if (typeof entry?.ref === 'string' && entry.ref.trim()) normalized.ref = entry.ref.trim();
    if (auto) normalized.auto = auto;
    if (typeof entry?.launchable === 'boolean') normalized.launchable = entry.launchable;
    if (typeof entry?.label === 'string' && entry.label.trim()) normalized.label = entry.label.trim();
    if (typeof entry?.description === 'string' && entry.description.trim()) normalized.description = entry.description.trim();
    if (skills?.length) normalized.skills = skills;
    if (skillBundleRefs.length) normalized.skillBundleRefs = skillBundleRefs;
    if (capabilityBundleRefs.length) normalized.capabilityBundleRefs = capabilityBundleRefs;
    if (capabilityBundles?.length) normalized.capabilityBundles = capabilityBundles;
    if (runtimeCompatibility) normalized.runtimeCompatibility = runtimeCompatibility;
    if (typeof entry?.initialPrompt === 'string' && entry.initialPrompt.trim()) {
      normalized.initialPrompt = entry.initialPrompt.trim();
    }
    if (scopes.length) normalized.scopes = scopes;
    if (polling) normalized.polling = polling;
    return normalized;
  }

  private mergeTemplateRoleEntries(
    base: ProjectTemplateRoleEntry,
    override: ProjectTemplateRoleEntry,
  ): ProjectTemplateRoleEntry {
    return {
      ...base,
      ...override,
      role: override.role || base.role,
      ref: override.ref ?? base.ref,
      auto: override.auto ?? base.auto,
      launchable: override.launchable ?? base.launchable,
      label: override.label ?? base.label,
      description: override.description ?? base.description,
      skills: override.skills?.length ? override.skills : base.skills,
      skillBundleRefs: override.skillBundleRefs?.length ? override.skillBundleRefs : base.skillBundleRefs,
      capabilityBundleRefs: override.capabilityBundleRefs?.length
        ? override.capabilityBundleRefs
        : base.capabilityBundleRefs,
      capabilityBundles: override.capabilityBundles?.length ? override.capabilityBundles : base.capabilityBundles,
      runtimeCompatibility: override.runtimeCompatibility ?? base.runtimeCompatibility,
      initialPrompt: override.initialPrompt ?? base.initialPrompt,
      scopes: override.scopes?.length ? override.scopes : base.scopes,
      polling: override.polling ?? base.polling,
    };
  }

  private mergeTemplateRoles(
    inlineRoles: ProjectTemplateRoleEntry[],
    directoryRoles: ProjectTemplateRoleEntry[],
  ): ProjectTemplateRoleEntry[] {
    const orderedRoles: string[] = [];
    const byRole = new Map<string, ProjectTemplateRoleEntry>();
    const put = (entry: ProjectTemplateRoleEntry, override = false) => {
      if (!byRole.has(entry.role)) orderedRoles.push(entry.role);
      const existing = byRole.get(entry.role);
      byRole.set(entry.role, override && existing ? this.mergeTemplateRoleEntries(existing, entry) : entry);
    };
    inlineRoles.forEach((entry) => put(entry));
    directoryRoles.forEach((entry) => put(entry, true));
    return orderedRoles.map((role) => byRole.get(role)).filter((entry): entry is ProjectTemplateRoleEntry => Boolean(entry));
  }

  private normalizeTemplate(
    slug: string,
    parsed: any,
    directoryRoles: ProjectTemplateRoleEntry[] = [],
  ): ProjectTemplateConfig {
    const id = typeof parsed?.id === 'string' && parsed.id.trim() ? parsed.id.trim() : slug;
    const label = typeof parsed?.label === 'string' && parsed.label.trim() ? parsed.label.trim() : id;
    const description =
      typeof parsed?.description === 'string' && parsed.description.trim() ? parsed.description.trim() : undefined;
    const version =
      typeof parsed?.version === 'string' && parsed.version.trim() ? parsed.version.trim() : undefined;
    const settings = parsed?.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)
      ? parsed.settings
      : {};
    const workItemStatusFlow =
      parsed?.workItemStatusFlow && typeof parsed.workItemStatusFlow === 'object' && !Array.isArray(parsed.workItemStatusFlow)
        ? parsed.workItemStatusFlow
        : undefined;
    const roleLaunchProfiles = Array.isArray(parsed?.roleLaunchProfiles) ? parsed.roleLaunchProfiles : [];
    const inlineRoles = Array.isArray(parsed?.roles)
      ? parsed.roles
          .map((entry: any): ProjectTemplateRoleEntry | null => this.normalizeRoleEntry(entry))
          .filter((entry: ProjectTemplateRoleEntry | null): entry is ProjectTemplateRoleEntry => Boolean(entry))
      : [];
    const roles = this.mergeTemplateRoles(inlineRoles, directoryRoles);
    const projectGlobals = Array.isArray(parsed?.projectGlobals)
      ? parsed.projectGlobals
          .map((entry: any): ProjectTemplateGlobalVariable | null => {
            const key = typeof entry?.key === 'string' ? entry.key.trim() : '';
            if (!key) return null;
            return {
              key,
              label: typeof entry?.label === 'string' ? entry.label.trim() : null,
              description: typeof entry?.description === 'string' ? entry.description.trim() : null,
              value: typeof entry?.value === 'string' ? entry.value : null,
              isSecret: Boolean(entry?.isSecret),
              required: entry?.required !== false,
              createTaskOnMissing: entry?.createTaskOnMissing !== false,
              category: typeof entry?.category === 'string' ? entry.category.trim() : null,
            };
          })
          .filter((entry: ProjectTemplateGlobalVariable | null): entry is ProjectTemplateGlobalVariable => Boolean(entry))
      : [];
    const projectFileFolders = cleanStringList(parsed?.projectFileFolders)
      .map((folder) => folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);
    return {
      id,
      label,
      description,
      version,
      settings,
      workItemStatusFlow,
      roleLaunchProfiles,
      projectFileFolders,
      roles: withDefaultProjectRoles(roles),
      projectGlobals,
    };
  }
}

export { DEFAULT_TEMPLATE_ID };
