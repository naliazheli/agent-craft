import { Trophy, Github, Briefcase } from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import { SectionContainer, SectionTitle, FeatureCard } from './shared';

const icons = [
  <Trophy key="1" className="h-5 w-5" />,
  <Github key="2" className="h-5 w-5" />,
  <Briefcase key="3" className="h-5 w-5" />,
];

export function SourcesSection() {
  const c = homeContent.sources;
  return (
    <SectionContainer>
      <SectionTitle
        title={c.title}
        description={c.description}
        align="center"
        className="mb-14"
      />
      <div className="grid gap-6 md:grid-cols-3">
        {c.cards.map((card, i) => (
          <FeatureCard
            key={card.title}
            icon={icons[i]}
            title={card.title}
            description={card.description}
          />
        ))}
      </div>
    </SectionContainer>
  );
}
