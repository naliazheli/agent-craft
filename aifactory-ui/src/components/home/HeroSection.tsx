import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  FileText,
  FileSearch,
  GitMerge,
  MousePointer2,
  Plus,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import { SectionContainer, CTAButtons, TagChip } from './shared';

export function HeroSection() {
  const c = homeContent.hero;
  return (
    <SectionContainer size="wide" className="pt-28 md:pt-32 lg:pt-36">
      <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
        <div className="flex min-w-0 flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-700">
            <Sparkles className="h-3.5 w-3.5" />
            {c.eyebrow}
          </span>

          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-slate-950 sm:text-5xl md:text-6xl lg:text-7xl">
            {c.title}
          </h1>

          <p className="text-lg font-medium text-slate-700 md:text-xl">
            {c.subtitle}
          </p>

          <p className="max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            {c.description}
          </p>

          <CTAButtons primary={c.primaryCta} secondary={c.secondaryCta} className="mt-2" />

          <div className="mt-3 flex flex-wrap gap-2">
            {c.tags.map((t) => (
              <TagChip key={t} label={t} />
            ))}
          </div>
        </div>

        <HeroVisual />
      </div>
    </SectionContainer>
  );
}

function HeroVisual() {
  const steps = useMemo(
    () => [
      {
        label: 'Create project',
        cursor: { left: '91%', top: '9%' },
        cursorLabel: 'Click create',
        cursorLabelSide: 'left',
        projectStatus: 'Drafting project',
        activity: 'Owner creates a legal contract review workspace.',
        focus: 'create',
      },
      {
        label: 'Choose template',
        cursor: { left: '36%', top: '38%' },
        cursorLabel: 'Select template',
        cursorLabelSide: 'right',
        projectStatus: 'Template selected',
        activity: 'Legal Contract Review template seeds roles and shared folders.',
        focus: 'template',
      },
      {
        label: 'Start lead',
        cursor: { left: '91%', top: '28%' },
        cursorLabel: 'Start lead agent',
        cursorLabelSide: 'left',
        projectStatus: 'Lead agent running',
        activity: 'Lead agent reads contract files and identifies review stages.',
        focus: 'lead',
      },
      {
        label: 'Dispatch agents',
        cursor: { left: '68%', top: '48%' },
        cursorLabel: 'Dispatch specialists',
        cursorLabelSide: 'right',
        projectStatus: 'Specialists working',
        activity: 'Clause, risk, compliance, obligations, and recommendations agents split the review.',
        focus: 'agents',
      },
      {
        label: 'Review report',
        cursor: { left: '86%', top: '84%' },
        cursorLabel: 'Open report',
        cursorLabelSide: 'left',
        projectStatus: 'Owner report ready',
        activity: 'Final report is written to shared project files with risks and next actions.',
        focus: 'report',
      },
    ],
    [],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const activeStep = steps[stepIndex];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % steps.length);
    }, 2300);
    return () => window.clearInterval(timer);
  }, [steps.length]);

  const agents = [
    { label: 'Clause', icon: FileSearch, done: stepIndex >= 3 },
    { label: 'Risk', icon: ShieldCheck, done: stepIndex >= 3 },
    { label: 'Compliance', icon: Scale, done: stepIndex >= 3 },
    { label: 'Terms', icon: ClipboardCheck, done: stepIndex >= 4 },
  ];

  return (
    <div className="relative min-h-[560px] min-w-0 overflow-visible lg:min-h-[620px]">
      <div className="relative mx-auto max-w-[620px]">
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 text-slate-950 shadow-xl shadow-slate-200/70 md:p-5">
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <div className="text-2xl font-semibold tracking-tight md:text-3xl">
                Legal Contract Review
              </div>
              <div className="mt-1 text-xs font-medium text-slate-500 md:text-sm">
                real project workspace · multi-agent review
              </div>
            </div>
            <button
              type="button"
              className={`inline-flex h-11 w-11 items-center justify-center rounded-md bg-slate-950 text-slate-50 shadow-sm transition-transform ${
                activeStep.focus === 'create' ? 'scale-110 ring-4 ring-cyan-200' : ''
              }`}
              aria-label="Create a project task"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
            <div
              className={`min-w-0 rounded-md border bg-white p-4 shadow-sm transition ${
                activeStep.focus === 'template' || activeStep.focus === 'create'
                  ? 'border-cyan-300 shadow-cyan-100'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Plus className="h-3.5 w-3.5" />
                Create Project
              </div>
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase text-slate-500">Project Goal</div>
                <p className="mt-1 text-sm font-semibold leading-5">
                  Review SaaS master service agreement for renewal, data, liability, and termination risk.
                </p>
              </div>
              <div
                className={`mt-3 rounded-md border px-3 py-2 transition ${
                  activeStep.focus === 'template' ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="text-[11px] font-semibold uppercase text-slate-500">Project Template</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-sm font-semibold">
                  <span className="truncate">Legal Contract Review</span>
                  <ChevronRight className="h-4 w-4 text-cyan-600" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-50">
                <span>待审核/MSA-renewal.pdf</span>
                <span className="rounded-md bg-cyan-300 px-2 py-0.5 text-slate-950">uploaded</span>
              </div>
            </div>

            <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <Bot className="h-4 w-4 text-cyan-600" />
                    <span className="truncate">Lead Agent</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    identifies queues, files, and specialist roles
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    stepIndex >= 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {stepIndex >= 2 ? 'running' : 'queued'}
                </span>
              </div>
              <div
                className={`mt-3 rounded-md border px-3 py-3 transition ${
                  activeStep.focus === 'lead' ? 'border-cyan-300 bg-cyan-50/80' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="text-sm font-medium leading-5">
                  “Found one source contract. Creating first-pass review for LEGAL_CLAUSE_AGENT, then second-pass recommendations.”
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {agents.map((agent) => {
                  const Icon = agent.icon;
                  return (
                    <div
                      key={agent.label}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        agent.done
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{agent.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Workflow className="h-4 w-4 text-cyan-600" />
                {activeStep.projectStatus}
              </div>
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                {activeStep.label}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {activeStep.activity}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {['clause-inventory.md', 'risk-matrix.csv', '审核报告/MSA-review.md'].map((file, index) => (
                <div
                  key={file}
                  className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                    stepIndex >= index + 2
                      ? 'border-cyan-100 bg-cyan-50 text-cyan-900'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                  <span className="truncate">{file}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-600">
            <StatusPill icon={<CircleDot className="h-3.5 w-3.5" />} label="Goal" />
            <StatusPill icon={<Activity className="h-3.5 w-3.5" />} label="Runtime" />
            <StatusPill icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Report" />
          </div>

          <div
            className={`mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-slate-950 shadow-sm transition ${
              activeStep.focus === 'report' ? 'ring-4 ring-emerald-200' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <GitMerge className="h-4 w-4 text-emerald-700" />
                Contract review report
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-700">
                <Activity className="h-3 w-3" />
                ready
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-cyan-700" />
                5 legal agents synced
              </span>
              <span className="inline-flex items-center gap-2">
                Owner action list
                <ArrowRight className="h-3.5 w-3.5 text-cyan-700" />
              </span>
            </div>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute z-20"
            style={{
              left: activeStep.cursor.left,
              top: activeStep.cursor.top,
              transform: 'translate(-8px, -6px)',
            }}
          >
            <div className="relative">
              <span className="absolute -left-3 -top-3 h-10 w-10 animate-ping rounded-full bg-cyan-300/35" />
              <span
                className={`absolute top-7 hidden whitespace-nowrap rounded-full border border-cyan-200/70 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 shadow-lg shadow-black/15 sm:inline-flex ${
                  activeStep.cursorLabelSide === 'left' ? 'right-5' : 'left-7'
                }`}
              >
                {activeStep.cursorLabel}
              </span>
              <MousePointer2 className="relative h-10 w-10 -rotate-12 fill-white text-slate-900 drop-shadow-[0_8px_18px_rgba(15,23,42,0.28)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
      {icon}
      <span>{label}</span>
    </div>
  );
}
