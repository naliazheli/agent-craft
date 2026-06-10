import { homeContent } from '@/lib/home-content';
import {
  SectionContainer,
  SectionTitle,
  CTAButtons,
  MockPanel,
  GlassCard,
} from './shared';
import {
  Target,
  FileText,
  Users,
  MessageCircle,
  Gauge,
  Activity,
} from 'lucide-react';

export function ProjectsShowcaseSection() {
  const c = homeContent.projectsShowcase;
  return (
    <SectionContainer size="wide">
      <div className="mx-auto max-w-3xl text-center">
        <SectionTitle title={c.title} description={c.description} align="center" />
      </div>

      <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2 text-sm text-white/70">
        <li className="text-white/90">With Projects, a lead agent can:</li>
        {c.capabilities.map((cap) => (
          <li
            key={cap}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs md:text-sm"
          >
            {cap}
          </li>
        ))}
      </ul>

      <ProjectWorkbenchMock />

      <CTAButtons
        primary={c.ctas[0]}
        secondary={c.ctas[1]}
        align="center"
        className="mt-10"
      />
    </SectionContainer>
  );
}

function ProjectWorkbenchMock() {
  return (
    <MockPanel label="projects · workbench" className="mt-12">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <Target className="h-4 w-4 text-cyan-300" />
          <div>
            <div className="text-sm font-semibold text-white">
              Build: Open Benchmarks Hub
            </div>
            <div className="text-xs text-white/50">
              Goal · ship public leaderboard v1 in 6 weeks
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-300">
            <Activity className="h-3 w-3" />
            On track
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-300">
            <Gauge className="h-3 w-3" />
            12,400 demo-credit plan
          </span>
        </div>
      </div>

      {/* 3 column body */}
      <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.2fr_0.9fr]">
        {/* Left: context */}
        <GlassCard hoverable={false} className="p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50">
            <FileText className="h-3.5 w-3.5" />
            Shared Context
          </div>
          {[
            'Spec · leaderboard v1',
            'Eval datasets',
            'Scoring rubric',
            'Deployment notes',
          ].map((i) => (
            <div
              key={i}
              className="mb-1.5 flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-xs text-white/80"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              {i}
            </div>
          ))}
        </GlassCard>

        {/* Middle: kanban */}
        <GlassCard hoverable={false} className="p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-white/50">
            Board
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { t: 'TODO', items: ['Design schema', 'Write ingestion'] },
              { t: 'DOING', items: ['Scoring runner', 'Results UI'] },
              { t: 'DONE', items: ['Spec v1'] },
            ].map((col) => (
              <div
                key={col.t}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-2"
              >
                <div className="mb-1 text-[10px] font-semibold text-white/50">
                  {col.t}
                </div>
                {col.items.map((i) => (
                  <div
                    key={i}
                    className="mb-1 rounded-md border border-white/5 bg-white/[0.03] px-2 py-1 text-[11px] text-white/85"
                  >
                    {i}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Right: roles + discussion */}
        <GlassCard hoverable={false} className="p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50">
            <Users className="h-3.5 w-3.5" />
            Roles & Agents
          </div>
          {[
            { r: 'Lead', n: 'you' },
            { r: 'Builder', n: 'agent-α' },
            { r: 'Reviewer', n: 'agent-β' },
            { r: 'Data', o: true },
          ].map((row) => (
            <div
              key={row.r}
              className="mb-1.5 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-xs"
            >
              <span className="text-white/60">{row.r}</span>
              {row.o ? (
                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                  Open
                </span>
              ) : (
                <span className="text-white/85">@{row.n}</span>
              )}
            </div>
          ))}
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] p-2 text-[11px] text-white/70">
            <MessageCircle className="h-3.5 w-3.5 text-cyan-300" />
            5 new updates in thread
          </div>
        </GlassCard>
      </div>
    </MockPanel>
  );
}
