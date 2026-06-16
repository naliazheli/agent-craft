import {
  Bot,
  Brain,
  Clipboard,
  FolderOpen,
  FolderPlus,
  MessageSquareText,
  Network,
  Play,
  Rocket,
  Route,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionContainer, SectionTitle, TagChip } from './shared';

const steps = [
  {
    title: 'Create a project',
    detail: 'Describe the goal. AgentCraft creates the project workspace and a pending Lead Agent.',
    icon: FolderPlus,
  },
  {
    title: 'Open Project Members',
    detail: 'Select the Lead Agent card. Its first state is pending launch.',
    icon: UserRoundCheck,
  },
  {
    title: 'Launch Local Agent',
    detail: 'Click Local Agent and queue a local CLI runtime for the lead.',
    icon: Brain,
  },
  {
    title: 'Copy the command',
    detail: 'Paste the runner command into your terminal so this device can claim the job.',
    icon: Clipboard,
  },
  {
    title: 'Start the conversation',
    detail: 'Send the objective. The lead can split work and bring worker agents into the project.',
    icon: MessageSquareText,
  },
];

const projectMenu = [
  { label: 'Home', detail: 'Overview boards and signals', icon: Workflow },
  { label: 'Project Members', detail: 'Members, roles, and agents', icon: UserRoundCheck, active: true },
  { label: 'Work Items', detail: 'Board, assignments, and runs', icon: Network },
  { label: 'Resources', detail: 'Shared files and references', icon: FolderOpen },
  { label: 'Settings', detail: 'Project profile and resources', icon: ShieldCheck },
];

export function LocalAgentDemoSection() {
  return (
    <SectionContainer id="local-agent-demo" size="wide">
      <SectionTitle
        eyebrow="Product Walkthrough Video"
        title="Follow the same UI flow users see in Projects"
        description="This homepage intro mirrors the real Project Members workflow: create a project, select the pending Lead Agent, launch Local Agent, copy the runner command, then start the conversation that can coordinate worker agents."
        align="center"
        className="mb-12"
      />

      <div className="grid gap-6 lg:grid-cols-[0.74fr_1.26fr] lg:items-stretch">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <TagChip label="Matches the app UI" variant="accent" />
            <span className="inline-flex items-center gap-2 text-xs font-medium text-white/50">
              <Play className="h-3.5 w-3.5 text-cyan-200" />
              First-run guide
            </span>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="agent-demo-step flex gap-3 rounded-xl border border-white/[0.08] bg-black/[0.18] p-3"
                  style={{ animationDelay: `${index * 3.2}s` }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white/40">0{index + 1}</span>
                      <p className="text-sm font-semibold text-white">{step.title}</p>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-white/60">{step.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-cyan-200/15 bg-[#070b14] shadow-2xl shadow-cyan-950/30">
          <div className="flex h-10 items-center justify-between border-b border-white/10 bg-white/[0.045] px-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
            </div>
            <span className="font-mono text-xs text-white/50">AgentCraft intro · Project Members walkthrough</span>
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/50">
              <Play className="h-3 w-3 text-cyan-200" />
              Auto
            </div>
          </div>

          <div className="grid min-h-[560px] gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">Project Menu</p>
              <p className="mb-4 mt-1 px-2 text-sm font-semibold text-white">Open Benchmarks Hub</p>
              <div className="space-y-1.5">
                {projectMenu.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={`rounded-lg px-3 py-2.5 ${item.active ? 'bg-cyan-400/10 text-white' : 'text-white/60'}`}
                    >
                      <div className="flex gap-2.5">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.active ? 'text-cyan-200' : 'text-white/50'}`} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.label}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-white/50">{item.detail}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>

            <div className="rounded-xl border border-white/10 bg-[#0b101c] p-4">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-200" />
                <h3 className="text-lg font-semibold text-white">Team Panel</h3>
              </div>
              <p className="text-sm font-medium text-white/90">Agent Conversations</p>
              <p className="mt-1 text-xs leading-5 text-white/50">
                Select a project member instance to open its chat, launch runtime, or create another role instance.
              </p>

              <div className="mt-4 grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <AgentListCard
                    name="Lead Agent"
                    role="LEAD_AGENT"
                    status="pending launch"
                    selected
                    action="Launch"
                  />
                  <AgentListCard
                    name="Worker Agent"
                    role="WORKER_AGENT"
                    status="idle"
                    action={<Settings2 className="h-3.5 w-3.5" />}
                  />
                  <div className="rounded-lg border border-dashed border-white/[0.12] bg-black/[0.14] px-3 py-3">
                    <div className="flex gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-200">
                        <FolderPlus className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">Add project member</p>
                        <p className="mt-1 text-xs leading-5 text-white/50">
                          Create another role instance with its own runtime and conversation.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-white/10 bg-[#070b14]">
                  <div className="border-b border-white/10 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-white">Lead Agent</p>
                          <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-white/70">
                            pending launch
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-white/70">
                            LEAD_AGENT
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-white/40">agent+c7ef165a-dc4+lead_agent@aifactory.local</p>
                      </div>
                      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 text-sm font-semibold text-cyan-100">
                        <Rocket className="h-4 w-4" />
                        Launch Runtime
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-center">
                      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06]">
                        <Rocket className="h-5 w-5 text-cyan-200" />
                      </div>
                      <p className="text-sm font-medium text-white">This lead agent is ready, but no runtime is running yet.</p>
                      <p className="mt-1 text-xs leading-5 text-white/50">
                        Launch a runtime before opening the chat. Choose Local Agent for a local CLI session.
                      </p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.08] px-3 text-sm text-white/70">
                          <Route className="h-4 w-4" />
                          Local Docker
                        </button>
                        <button className="agent-demo-pulse inline-flex h-9 items-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/14 px-3 text-sm font-semibold text-cyan-100">
                          <Brain className="h-4 w-4" />
                          Local Agent
                        </button>
                        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm text-white/40">
                          Cloud Agent
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.07] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">Local Runner Command</p>
                        <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-200/25 bg-cyan-200/10 px-2.5 text-xs font-semibold text-cyan-100">
                          <Clipboard className="h-3.5 w-3.5" />
                          Copy device runner command
                        </button>
                      </div>
                      <code className="block rounded-md border border-white/10 bg-black/[0.35] p-3 text-[11px] leading-relaxed text-cyan-50/80">
                        node agentcraft-local-codex-runner.mjs --token acu_live_demo --project open-benchmarks
                      </code>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                        <MessageSquareText className="h-4 w-4 text-cyan-200" />
                        Message this agent
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/[0.22] px-3 py-3 text-xs leading-5 text-white/50">
                        Build the leaderboard MVP. Split schema, scoring runner, and results UI into worker tasks.
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-400 px-3 text-sm font-semibold text-black">
                          Send
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">Lead delegation</p>
                        <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[11px] text-emerald-100">
                          Worker Agent idle
                        </span>
                      </div>
                      <p className="text-xs leading-5 text-white/60">
                        Lead Agent assigns implementation and review work to Worker Agent when the project objective is too broad for one turn.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-1.5 bg-white/[0.08]">
            <div className="agent-demo-progress h-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-violet-300" />
          </div>
        </div>
      </div>

      <style>{`
        .agent-demo-step {
          animation: agentDemoStep 16s linear infinite;
        }

        .agent-demo-progress {
          animation: agentDemoProgress 16s linear infinite;
          transform-origin: left;
        }

        .agent-demo-pulse {
          animation: agentDemoPulse 1.8s ease-in-out infinite;
          box-shadow: 0 0 0 0 rgba(103, 232, 249, 0.45);
        }

        @keyframes agentDemoStep {
          0%, 18%, 100% { opacity: 0.56; transform: translateX(0); border-color: rgba(255,255,255,0.08); }
          4%, 14% { opacity: 1; transform: translateX(4px); border-color: rgba(103,232,249,0.32); }
        }

        @keyframes agentDemoProgress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }

        @keyframes agentDemoPulse {
          0% { box-shadow: 0 0 0 0 rgba(103,232,249,0.45); }
          70% { box-shadow: 0 0 0 9px rgba(103,232,249,0); }
          100% { box-shadow: 0 0 0 0 rgba(103,232,249,0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .agent-demo-step,
          .agent-demo-progress,
          .agent-demo-pulse {
            animation: none;
          }

          .agent-demo-progress {
            transform: scaleX(1);
          }
        }
      `}</style>
    </SectionContainer>
  );
}

function AgentListCard({
  name,
  role,
  status,
  selected,
  action,
}: {
  name: string;
  role: string;
  status: string;
  selected?: boolean;
  action: ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${selected ? 'border-cyan-300/40 bg-cyan-300/10' : 'border-white/10 bg-white/[0.025]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-4 w-4 shrink-0 text-cyan-200" />
            <p className="truncate text-sm font-medium text-white">{name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-white/70">
              {role}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status === 'idle' ? 'border-emerald-200/25 bg-emerald-200/10 text-emerald-100' : 'border-white/10 bg-white/[0.06] text-white/70'}`}>
              {status}
            </span>
          </div>
          <p className="truncate text-xs text-white/40">agent+c7ef165a-dc4+{role.toLowerCase()}@...</p>
        </div>
        <span className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-md border border-white/10 px-2 text-xs text-white/60">
          {action}
        </span>
      </div>
    </div>
  );
}
