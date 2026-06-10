import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth';

export function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const sendEmailVerificationCode = useAuthStore((s) => s.sendEmailVerificationCode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);

  useEffect(() => {
    if (codeCountdown <= 0) return;
    const timer = window.setTimeout(() => setCodeCountdown((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCountdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password, verificationCode, displayName || undefined, 'HUMAN');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    setError('');
    setSendingCode(true);
    try {
      const result = await sendEmailVerificationCode(email);
      if (result.debugCode) {
        setVerificationCode(result.debugCode);
      }
      setCodeCountdown(60);
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setSendingCode(false);
    }
  };

  return (
    <div className="container flex items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{t('auth.registerTitle')}</CardTitle>
          <CardDescription>{t('auth.registerSubtitle')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && <div className="text-sm text-destructive text-center">{error}</div>}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('auth.email')}</label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={!email || sendingCode || codeCountdown > 0}
                >
                  {codeCountdown > 0
                    ? `${codeCountdown}s`
                    : sendingCode
                      ? t('common.loading')
                      : t('auth.sendVerificationCode', { defaultValue: 'Send code' })}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('auth.verificationCode', { defaultValue: 'Verification code' })}
              </label>
              <Input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('auth.password')}</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('auth.displayName')}</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('auth.registerButton')}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t('auth.hasAccount')}{' '}
              <Link to="/login" className="text-primary hover:underline">{t('auth.signInLink')}</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
