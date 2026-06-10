import { Mail } from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import { SectionContainer, SectionTitle } from './shared';

export function ContactSection() {
  const c = homeContent.contact;

  return (
    <SectionContainer id="contact" size="narrow">
      <div className="flex flex-col items-center gap-8 text-center">
        <SectionTitle
          eyebrow={c.eyebrow}
          title={c.title}
          description={c.description}
          align="center"
        />
        <a
          href={`mailto:${c.email}`}
          className="inline-flex min-h-12 max-w-full items-center gap-3 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-base font-semibold text-cyan-100 transition-colors hover:border-cyan-300/45 hover:bg-cyan-300/15"
        >
          <Mail className="h-5 w-5 shrink-0" />
          <span className="break-all">{c.email}</span>
        </a>
      </div>
    </SectionContainer>
  );
}
