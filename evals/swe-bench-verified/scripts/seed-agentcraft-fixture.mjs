#!/usr/bin/env node
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);

try {
  const dotenv = require(path.join(rootDir, "aifactory-server/node_modules/dotenv"));
  dotenv.config({ path: path.join(rootDir, "aifactory-server/.env"), quiet: true });
} catch {
  // dotenv is optional for this script; DATABASE_URL may already be exported.
}

const { PrismaClient } = require(path.join(rootDir, "aifactory-server/node_modules/@prisma/client"));
const bcrypt = require(path.join(rootDir, "aifactory-server/node_modules/bcryptjs"));

const prisma = new PrismaClient();

function argValue(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function ensureUser({ email, displayName, role, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {
      displayName,
      role,
      isEmailVerified: true,
    },
    create: {
      email,
      displayName,
      role,
      passwordHash,
      isEmailVerified: true,
      balance: 0,
    },
  });
}

async function ensureProjectMember(projectId, userId, role) {
  const existing = await prisma.projectMember.findFirst({
    where: { projectId, userId, role, removedAt: null },
  });
  if (existing) return existing;
  return prisma.projectMember.create({
    data: {
      id: randomUUID(),
      projectId,
      userId,
      role,
    },
  });
}

async function nextProjectSeq(projectId) {
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM project_events WHERE projectId = ${projectId}
  `;
  const value = Number(rows?.[0]?.maxSeq ?? 0);
  return value + 1;
}

async function appendProjectEvent({ projectId, type, refType, refId, actorUserId, payload }) {
  await prisma.$executeRaw`
    INSERT INTO project_events (id, projectId, seq, type, refType, refId, payload, actorUserId, createdAt)
    VALUES (${randomUUID()}, ${projectId}, ${await nextProjectSeq(projectId)}, ${type}, ${refType}, ${refId}, ${JSON.stringify(payload ?? {})}, ${actorUserId}, NOW(3))
  `;
}

async function ensureApiConfig(userId, model) {
  const apiKey =
    process.env.EVAL_OPENAI_API_KEY ||
    process.env.MIMO_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "set-openai-api-key";
  const apiUrl = process.env.EVAL_OPENAI_API_URL || process.env.MIMO_API_URL || "https://api.openai.com/v1";
  const existing = await prisma.apiConfig.findFirst({
    where: { userId, name: "SWE-bench eval OpenAI" },
  });
  if (existing) {
    return prisma.apiConfig.update({
      where: { id: existing.id },
      data: {
        apiType: "openai",
        apiUrl,
        apiKey,
        modelName: model,
        isActive: true,
      },
    });
  }
  return prisma.apiConfig.create({
    data: {
      name: "SWE-bench eval OpenAI",
      apiType: "openai",
      apiUrl,
      apiKey,
      modelName: model,
      userId,
      isActive: true,
    },
  });
}

async function main() {
  const prefix = argValue("prefix", "swebench");
  const model = argValue("model", process.env.MIMO_MODEL || process.env.CODEX_MODEL || "gpt-4o-mini");
  const password = argValue("password", "agentcraft-swebench-dev");
  const slug = argValue("project-slug", "agentcraft-swebench-eval");
  const writePath = argValue(
    "write",
    path.join(rootDir, "evals/swe-bench-verified/runs/agentcraft-fixture.json"),
  );

  const owner = await ensureUser({
    email: `${prefix}.owner@agentcraft.local`,
    displayName: "SWE-bench Eval Owner",
    role: "HUMAN",
    password,
  });
  const leadAgent = await ensureUser({
    email: `${prefix}.lead@agentcraft.local`,
    displayName: "SWE-bench Eval Lead",
    role: "AI_AGENT",
    password,
  });
  const workerAgent = await ensureUser({
    email: `${prefix}.worker@agentcraft.local`,
    displayName: "SWE-bench Eval Worker",
    role: "AI_AGENT",
    password,
  });

  const project = await prisma.project.upsert({
    where: { slug },
    update: {
      name: "SWE-bench Verified Evaluation",
      summary: "Local benchmark fixture for AgentCraft projects-mode SWE-bench runs.",
      status: "ACTIVE",
      visibility: "private",
      ownerId: owner.id,
      leadAgentUserId: leadAgent.id,
      settings: {
        eval: "swe-bench-verified",
        runner: "agentcraft-projects",
      },
    },
    create: {
      name: "SWE-bench Verified Evaluation",
      slug,
      summary: "Local benchmark fixture for AgentCraft projects-mode SWE-bench runs.",
      brief: "Compare AgentCraft projects mode with a single-agent Codex baseline on SWE-bench Verified.",
      status: "ACTIVE",
      visibility: "private",
      ownerId: owner.id,
      leadAgentUserId: leadAgent.id,
      budgetAmount: 0,
      budgetCurrency: "AIC",
      settings: {
        eval: "swe-bench-verified",
        runner: "agentcraft-projects",
      },
    },
  });

  const ownerMember = await ensureProjectMember(project.id, owner.id, "OWNER");
  const leadMember = await ensureProjectMember(project.id, leadAgent.id, "LEAD_AGENT");
  const workerMember = await ensureProjectMember(project.id, workerAgent.id, "WORKER_AGENT");

  const goal = await prisma.projectGoal.upsert({
    where: { id: `${project.id}:swebench-goal` },
    update: {
      status: "IN_PROGRESS",
      priority: 10,
    },
    create: {
      id: `${project.id}:swebench-goal`,
      projectId: project.id,
      title: "Run SWE-bench Verified comparison",
      description: "Generate and evaluate patches from baseline Codex and AgentCraft projects mode.",
      status: "IN_PROGRESS",
      priority: 10,
      sortOrder: 0,
      createdById: owner.id,
    },
  });

  const feature = await prisma.projectFeature.upsert({
    where: { id: `${project.id}:swebench-feature` },
    update: {
      status: "READY",
      priority: 10,
    },
    create: {
      id: `${project.id}:swebench-feature`,
      projectId: project.id,
      goalId: goal.id,
      title: "SWE-bench smoke-run harness",
      description: "First pass for one SWE-bench Verified task.",
      status: "READY",
      priority: 10,
      sortOrder: 0,
      createdById: owner.id,
    },
  });

  const workItem = await prisma.projectWorkItem.upsert({
    where: { id: `${project.id}:swebench-smoke-work-item` },
    update: {
      status: "READY",
    },
    create: {
      id: `${project.id}:swebench-smoke-work-item`,
      projectId: project.id,
      goalId: goal.id,
      featureId: feature.id,
      title: "Solve one SWE-bench Verified instance",
      description: "The runner will inject the specific instance statement into project context.",
      workType: "BENCHMARK",
      status: "READY",
      priority: 10,
      scopeBrief: "Generate a focused repository patch for the assigned SWE-bench Verified instance.",
      acceptanceCriteria: "1. Produce a git diff patch.\n2. Keep the patch focused.\n3. Preserve metadata needed for SWE-bench harness evaluation.",
      inputPacket: {
        benchmark: "SWE-bench Verified",
        dataset: "SWE-bench/SWE-bench_Verified",
        split: "test",
      },
      outputContract: {
        format: "swebench_prediction_jsonl",
      },
      dependsOn: [],
      concurrencyMode: "SINGLE",
      createdById: owner.id,
      ownerId: owner.id,
    },
  });

  const existingAssignment = await prisma.projectAssignment.findFirst({
    where: {
      projectId: project.id,
      workItemId: workItem.id,
      assigneeUserId: workerAgent.id,
      status: { in: ["PROPOSED", "ACTIVE", "PAUSED"] },
    },
  });
  const assignment =
    existingAssignment ||
    (await prisma.projectAssignment.create({
      data: {
        id: `${project.id}:swebench-smoke-assignment`,
        projectId: project.id,
        workItemId: workItem.id,
        assigneeUserId: workerAgent.id,
        assignedByUserId: leadAgent.id,
        role: "WORKER_AGENT",
        status: "PROPOSED",
        objective: "Solve the current SWE-bench Verified smoke instance and produce a patch.",
        contextPacket: {
          benchmark: "SWE-bench Verified",
          runner: "agentcraft-projects",
        },
      },
    }));

  const apiConfig = await ensureApiConfig(owner.id, model);

  await appendProjectEvent({
    projectId: project.id,
    type: "EVAL_FIXTURE_READY",
    refType: "PROJECT",
    refId: project.id,
    actorUserId: owner.id,
    payload: {
      benchmark: "SWE-bench Verified",
      model,
      workItemId: workItem.id,
      assignmentId: assignment.id,
    },
  });

  const fixture = {
    ownerEmail: owner.email,
    password,
    ownerUserId: owner.id,
    leadAgentUserId: leadAgent.id,
    workerAgentUserId: workerAgent.id,
    projectId: project.id,
    projectSlug: project.slug,
    ownerMemberId: ownerMember.id,
    leadMemberId: leadMember.id,
    workerMemberId: workerMember.id,
    workItemId: workItem.id,
    assignmentId: assignment.id,
    apiConfigId: apiConfig.id,
    model,
  };

  if (!hasFlag("no-write")) {
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
    fs.writeFileSync(writePath, JSON.stringify(fixture, null, 2));
  }

  process.stdout.write(JSON.stringify(fixture, null, 2) + "\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
