import {
  ArrowRight,
  CheckCircle2,
  FileUp,
  FolderKanban,
  KeyRound,
  Network,
  Play,
  UserPlus,
} from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import { CTAButtons, SectionContainer, SectionTitle } from './shared';

const stepIcons = [FolderKanban, FileUp, UserPlus, CheckCircle2] as const;

export function ProjectUsageSection() {
  const c = homeContent.projectUsage;

  return (
    <SectionContainer size="wide" className="py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="flex flex-col gap-6">
          <SectionTitle eyebrow={c.eyebrow} title={c.title} description={c.description} />
          <CTAButtons primary={c.ctas[0]} secondary={c.ctas[1]} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur md:p-5">
          <div className="rounded-xl border border-white/10 bg-[#07101d] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                  <Network className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Project command center</div>
                  <div className="text-xs text-white/50">Goal, files, grants, review</div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                <Play className="h-3.5 w-3.5" />
                active runtime
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {c.steps.map((step, index) => {
                const Icon = stepIcons[index];
                return (
                  <div
                    key={step.title}
                    className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{step.title}</div>
                        <p className="mt-2 text-sm leading-relaxed text-white/62">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                  <FileUp className="h-3.5 w-3.5" />
                  Shared files
                </div>
                {['brief.md', 'dataset.csv', 'design-notes.png'].map((file) => (
                  <div
                    key={file}
                    className="mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/75"
                  >
                    <span>{file}</span>
                    <span className="text-cyan-300">read</span>
                  </div>
                ))}
              </div>

              <div className="hidden items-center justify-center text-white/30 lg:flex">
                <ArrowRight className="h-6 w-6" />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                  <KeyRound className="h-3.5 w-3.5" />
                  Runtime grant
                </div>
                {c.rails.map((rail) => (
                  <div key={rail} className="mb-2 flex items-center gap-2 text-xs text-white/70">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    <span>{rail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
