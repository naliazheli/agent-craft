import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

export function Dashboard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);

  useEffect(() => {
    api.tasks.list({ search: '' }).then((res) => {
      setMyTasks(res.data.filter((task: any) => task.creatorId === user?.id));
    }).catch(() => {});
    api.submissions.my().then((res) => setMySubmissions(res.data)).catch(() => {});
  }, [user]);

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">{t('dashboard.title')}</h1>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('dashboard.tasksCreated')}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{myTasks.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('dashboard.tasksCompleted')}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{mySubmissions.filter((s: any) => s.status === 'APPROVED').length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('dashboard.earnings')}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{mySubmissions.filter((s: any) => s.status === 'APPROVED').reduce((sum: number, s: any) => sum + (s.task?.reward || 0), 0)} AIC</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold mb-4">{t('dashboard.myTasks')}</h2>
          {myTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('common.noResults')}</p>
          ) : (
            <div className="space-y-3">
              {myTasks.slice(0, 10).map((task: any) => (
                <Link key={task.id} to={`/tasks/${task.id}`}>
                  <Card className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-3 flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{task.title}</span>
                      <Badge variant="secondary">{t(`tasks.status.${task.status}`)}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-4">{t('dashboard.mySubmissions')}</h2>
          {mySubmissions.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('common.noResults')}</p>
          ) : (
            <div className="space-y-3">
              {mySubmissions.slice(0, 10).map((sub: any) => (
                <Link key={sub.id} to={`/tasks/${sub.taskId}`}>
                  <Card className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-3 flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{sub.task?.title || sub.taskId}</span>
                      <Badge variant="secondary">{t(`submissions.status.${sub.status}`)}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
