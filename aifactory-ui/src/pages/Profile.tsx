import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Camera, Github, Link as LinkIcon } from 'lucide-react';
import { appEnv } from '@/lib/env';

export function Profile() {
  const { t } = useTranslation();
  const { user, loadUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    bio: '',
    walletAddress: user?.walletAddress || '',
  });

  useEffect(() => {
    // Load full user profile with avatar
    const loadProfile = async () => {
      try {
        const profile = await api.users.me();
        setAvatarUrl(profile.avatarUrl);
        setForm({
          displayName: profile.displayName || '',
          bio: profile.bio || '',
          walletAddress: profile.walletAddress || '',
        });
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };
    loadProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.users.updateProfile(form);
      await loadUser();
    } catch { }
    setLoading(false);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setAvatarLoading(true);
    try {
      const result = await api.users.uploadAvatar(file);
      setAvatarUrl(result.avatarUrl);
      await loadUser();
    } catch (error: any) {
      alert(error.message || 'Failed to upload avatar');
    }
    setAvatarLoading(false);
  };

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const isGithubConnected = Boolean(user?.authProvider === 'github' || user?.githubLogin);

  const handleGithubConnect = () => {
    const redirectPath = appEnv.appBasePath === '/' ? '' : appEnv.appBasePath;
    const redirectUrl = `${window.location.origin}${redirectPath}/oauth/callback`;
    void (async () => {
      const result = await api.auth.getGithubBindUrl(redirectUrl);
      window.location.href = result.url;
    })();
  };

  return (
    <div className="container py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          {user && <p className="text-sm text-muted-foreground">{user.email} &middot; {user.role}</p>}
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Avatar Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Avatar</label>
              <div className="flex items-center gap-4">
                <div 
                  className="relative w-24 h-24 rounded-full overflow-hidden bg-muted cursor-pointer group"
                  onClick={handleAvatarClick}
                >
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Avatar" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Camera className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  {avatarLoading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleAvatarClick}
                    disabled={avatarLoading}
                  >
                    {avatarLoading ? 'Uploading...' : 'Change Avatar'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG, GIF, WebP or SVG. Max 5MB.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.displayName')}</label>
              <Input value={form.displayName} onChange={(e) => update('displayName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.bio')}</label>
              <textarea className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.bio} onChange={(e) => update('bio', e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.walletAddress')}</label>
              <Input value={form.walletAddress} onChange={(e) => update('walletAddress', e.target.value)} placeholder="0x..." />
              <p className="text-xs text-muted-foreground">{t('profile.walletHint')}</p>
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4" />
                <span className="text-sm font-medium">{t('profile.github.title')}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {isGithubConnected
                  ? t('profile.github.connectedDesc')
                  : t('profile.github.disconnectedDesc')}
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('profile.github.statusLabel')}:</span>
                <span className={isGithubConnected ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'}>
                  {isGithubConnected ? t('profile.github.connected') : t('profile.github.notConnected')}
                </span>
              </div>
              {user?.githubLogin && (
                <div className="flex items-center gap-2 text-sm">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">@{user.githubLogin}</span>
                </div>
              )}
              {!isGithubConnected && (
                <>
                  <Button type="button" variant="outline" onClick={handleGithubConnect}>
                    <Github className="mr-2 h-4 w-4" />
                    {t('profile.github.connectButton')}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t('profile.github.connectHint')}</p>
                </>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.loading') : t('profile.saveButton')}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
