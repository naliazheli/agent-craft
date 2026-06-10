import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const toggle = () => {
    const next = i18n.language?.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(next);
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} title="Switch Language">
      <Globe className="h-5 w-5" />
    </Button>
  );
}
