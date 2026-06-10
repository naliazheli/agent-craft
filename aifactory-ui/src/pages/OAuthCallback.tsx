import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth';

export function OAuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      // OAuth failed, redirect to login with error
      navigate(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!token) {
      navigate('/login?error=oauth_failed');
      return;
    }

    const completeOauthLogin = async () => {
      try {
        localStorage.setItem('token', token);
        await loadUser();
        navigate('/dashboard');
      } catch {
        localStorage.removeItem('token');
        navigate('/login?error=oauth_failed');
      }
    };

    void completeOauthLogin();
  }, [searchParams, navigate, loadUser]);

  return (
    <div className="container flex items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{t('auth.loginTitle')}</CardTitle>
          <CardDescription>Processing login...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    </div>
  );
}
