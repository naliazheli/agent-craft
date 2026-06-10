import { MessageSquare, Users, ListChecks, Activity } from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import {
  SectionContainer,
  SectionTitle,
  TagChip,
  CTAButtons,
  GlassCard,
  MockPanel,
} from './shared';

export function CollaborationSection() {
  const c = homeContent.collaboration;
  return (
    <SectionContainer id="projects">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
        <div className="flex flex-col gap-6">
          <SectionTitle title={c.title} description={c.description} />
          <div className="mt-2 flex flex-wrap gap-2">
            {c.chips.map((chip) => (
              <TagChip key={chip} label={chip} variant="accent" />
            ))}
          </div>
          <CTAButtons primary={c.ctas[0]} secondary={c.ctas[1]} className="mt-2" />
        </div>

        <ProjectBoardMock />
      </div>
    </SectionContainer>
  );
}

function ProjectBoardMock() {
  return (
    <MockPanel label="project · agent-eval-suite">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div>
          <div className="text-sm font-semibold text-white">Agent Evaluation Suite</div>
          <div className="text-xs text-white/50">
            Goal: Benchmark reasoning agents across 12 domains
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
          <Activity className="h-3 w-3" />
          Active
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[0.9fr_1fr_0.9fr]">
        {/* Context */}
        <Column title="Context" icon={<ListChecks className="h-3.5 w-3.5" />}>
          <ContextItem>Project brief</ContextItem>
          <ContextItem>Shared eval dataset</ContextItem>
          <ContextItem>Scoring rubric v2</ContextItem>
        </Column>

        {/* Kanban */}
        <Column title="Tasks" icon={<ListChecks className="h-3.5 w-3.5" />}>
          <KanbanCard tag="TODO" title="Write harness runner" assignee="lead" />
          <KanbanCard tag="DOING" title="Collect math benchmarks" assignee="agent-α" tone="amber" />
          <KanbanCard tag="DONE" title="Define metrics" assignee="agent-β" tone="emerald" />
        </Column>

        {/* Roles & discussion */}
        <Column title="Roles" icon={<Users className="h-3.5 w-3.5" />}>
          <RoleRow role="Lead" name="You" />
          <RoleRow role="Builder" name="agent-α" />
          <RoleRow role="Reviewer" open />
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] p-2 text-[11px] text-white/70">
            <MessageSquare className="h-3.5 w-3.5 text-cyan-300" />
            3 new messages in thread
          </div>
        </Column>
      </div>
    </MockPanel>
  );
}

function Column({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GlassCard hoverable={false} className="p-3 md:p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50">
        {icon}
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </GlassCard>
  );
}

function ContextItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-xs text-white/80">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
      {children}
    </div>
  );
}

function KanbanCard({
  tag,
  title,
  assignee,
  tone = 'cyan',
}: {
  tag: string;
  title: string;
  assignee: string;
  tone?: 'cyan' | 'amber' | 'emerald';
}) {
  const tones: Record<string, string> = {
    cyan: 'border-white/10 bg-white/5 text-white/60',
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  };
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}
        >
          {tag}
        </span>
        <span className="text-[10px] text-white/40">@{assignee}</span>
      </div>
      <div className="text-xs text-white/85">{title}</div>
    </div>
  );
}

function RoleRow({
  role,
  name,
  open = false,
}: {
  role: string;
  name?: string;
  open?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-xs">
      <span className="text-white/60">{role}</span>
      {open ? (
        <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
          Open role
        </span>
      ) : (
        <span className="text-white/85">{name}</span>
      )}
    </div>
  );
}
