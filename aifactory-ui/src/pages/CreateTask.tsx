import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Play, Square, CheckCircle, XCircle, RotateCw, ChevronDown, ChevronRight,
  Loader2, Trash2, ShieldCheck, Paperclip, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { getTaskSourceLabel } from '@/lib/task-source';
import { useAuthStore } from '@/store/auth';
import { useLlmStore } from '@/store/llm';
import { useReviewAgentStore, type ReviewExecution, type ReviewLog } from '@/store/review-agent';
import { startReviewAgent, stopReviewAgent } from '@/lib/review-agent';

const REVIEW_STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle }> = {
  evaluating: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: Loader2 },
  approved: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle },
  rejected: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: XCircle },
  revision: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: RotateCw },
  skipped: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', icon: ChevronRight },
  error: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: XCircle },
};

function ReviewLogLine({ log }: { log: ReviewLog }) {
  return (
    <div className={`flex gap-2 ${
      log.type === 'error' ? 'text-red-500' :
      log.type === 'success' ? 'text-green-600 dark:text-green-400' :
      log.type === 'warn' ? 'text-yellow-600 dark:text-yellow-400' :
      'text-foreground'
    }`}>
      <span className="text-muted-foreground shrink-0">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>
      <span className="break-all">{log.message}</span>
    </div>
  );
}

function ReviewExecutionCard({ exec, isActive }: { exec: ReviewExecution; isActive: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(isActive);
  const cfg = REVIEW_STATUS_CONFIG[exec.status] || REVIEW_STATUS_CONFIG.error;
  const Icon = cfg.icon;
  const isAnimating = exec.status === 'evaluating';

  return (
    <Card className={`transition-all duration-200 ${isActive ? 'border-primary/60 shadow-md' : 'border-border/50'}`}>
      <button className="w-full text-left" onClick={() => setExpanded(!expanded)}>
        <CardHeader className="py-2 px-3">
          <div className="flex items-center gap-2">
            <div className="shrink-0">
              {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  to={`/tasks/${exec.taskId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-xs truncate hover:text-primary hover:underline transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {exec.taskTitle}
                </Link>
                <span className="text-xs text-muted-foreground">by {exec.workerName}</span>
              </div>
              <p className="text-xs text-muted-foreground">{new Date(exec.startedAt).toLocaleTimeString()}</p>
            </div>
            <Badge className={`shrink-0 text-xs gap-1 ${cfg.color}`}>
              <Icon className={`h-3 w-3 ${isAnimating ? 'animate-spin' : ''}`} />
              {t(`review.execStatus.${exec.status}`)}
            </Badge>
          </div>
        </CardHeader>
      </button>
      {expanded && (
        <CardContent className="pt-0 px-3 pb-2">
          <div className="bg-muted/30 rounded-md p-2 font-mono text-xs space-y-1 max-h-[200px] overflow-y-auto">
            {exec.logs.map((log, i) => <ReviewLogLine key={i} log={log} />)}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function CreateTask() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const defaultDeadline = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  };
  const [form, setForm] = useState({
    title: '',
    description: '',
    reward: '1',
    deadline: defaultDeadline(),
    tags: '',
    taskSource: 'CUSTOM',
    sourceUrl: '',
    sourceRepo: '',
    sourceIssueNumber: '',
  });
  const [autoReview, setAutoReview] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const user = useAuthStore((s) => s.user);
  const {
    apiType, modelName, history, currentConfigId,
    loadFromStorage, isConfigured, loadFromHistory, markCurrentConfigUsed,
  } = useLlmStore();
  const {
    status: reviewStatus, executions, activeSubmissionId, globalLogs: reviewGlobalLogs,
    stats: reviewStats, clearLogs: clearReviewLogs, syncUser: syncReviewUser,
  } = useReviewAgentStore();
  const [reviewLogExpanded, setReviewLogExpanded] = useState(false);

  useEffect(() => { syncReviewUser(user?.id ?? null); }, [user?.id]);
  useEffect(() => { loadFromStorage(); }, []);

  const configured = isConfigured();
  const isReviewing = reviewStatus === 'reviewing';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const task = await api.tasks.create({
        title: form.title,
        description: form.description,
        reward: parseFloat(form.reward),
        deadline: form.deadline || undefined,
        tags: form.tags ? form.tags.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        attachments: attachments.length > 0 ? attachments.map((a) => a.url) : undefined,
        autoReview,
        taskSource: form.taskSource,
        sourceUrl: form.sourceUrl || undefined,
        sourceRepo: form.taskSource === 'GITHUB_ISSUE' ? form.sourceRepo || undefined : undefined,
        sourceIssueNumber:
          form.taskSource === 'GITHUB_ISSUE' && form.sourceIssueNumber
            ? parseInt(form.sourceIssueNumber, 10)
            : undefined,
      });
      navigate(`/tasks/${task.id}`);
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await api.files.upload(file);
        setAttachments((prev) => [...prev, { url: result.url, name: file.name }]);
      }
    } catch (err: any) {
      setError(err.message || t('tasks.uploadFailed'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartReview = () => {
    if (!configured) return;
    markCurrentConfigUsed();
    startReviewAgent();
  };

  const handleReviewConfigChange = (id: string) => {
    if (!id || id === '__current__') return;
    loadFromHistory(id);
  };

  const handleClearReviewLogs = () => {
    if (window.confirm(t('review.confirmClearLogs') || 'Clear all review logs?')) {
      clearReviewLogs();
    }
  };

  return (
    <div className="container py-8">
      {/* Create Task Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t('tasks.createTitle')}</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && <div className="text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tasks.title')}</label>
              <Input value={form.title} onChange={(e) => update('title', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tasks.sourceType')}</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.taskSource}
                onChange={(e) => update('taskSource', e.target.value)}
              >
                {['CUSTOM', 'GITHUB_ISSUE', 'HACKERONE', 'UPWORK', 'FREELANCER', 'ISSUEHUNT', 'BOUNTYSOURCE', 'ERDOS_PROBLEM'].map((source) => (
                  <option key={source} value={source}>
                    {getTaskSourceLabel(t, source)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t('tasks.sourceHint')}</p>
            </div>
            {form.taskSource !== 'CUSTOM' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('tasks.sourceUrl')}</label>
                <Input
                  value={form.sourceUrl}
                  onChange={(e) => update('sourceUrl', e.target.value)}
                  placeholder={form.taskSource === 'GITHUB_ISSUE' ? 'https://github.com/owner/repo/issues/123' : 'https://example.com/task/123'}
                />
              </div>
            )}
            {form.taskSource === 'GITHUB_ISSUE' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('tasks.sourceRepo')}</label>
                  <Input
                    value={form.sourceRepo}
                    onChange={(e) => update('sourceRepo', e.target.value)}
                    placeholder="owner/repo"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('tasks.sourceIssueNumber')}</label>
                  <Input
                    type="number"
                    min="1"
                    value={form.sourceIssueNumber}
                    onChange={(e) => update('sourceIssueNumber', e.target.value)}
                    placeholder="123"
                    required
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tasks.attachments')}</label>
              <p className="text-xs text-muted-foreground">{t('tasks.attachmentsHint')}</p>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors">
                  <Paperclip className="h-4 w-4" />
                  <span>{uploading ? t('tasks.uploading') : t('tasks.attachments')}</span>
                  <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              </div>
              {attachments.length > 0 && (
                <div className="space-y-1">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted/40 rounded-md px-2 py-1">
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline text-primary">{att.name}</a>
                      <button type="button" onClick={() => removeAttachment(i)} className="ml-auto shrink-0 text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tasks.description')}</label>
              <textarea className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.description} onChange={(e) => update('description', e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('tasks.rewardAmount')}</label>
                <Input type="number" min="0" step="0.01" value={form.reward} onChange={(e) => update('reward', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('tasks.deadlineLabel')}</label>
                <Input type="date" value={form.deadline} onChange={(e) => update('deadline', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tasks.tagsLabel')}</label>
              <Input value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="frontend, react, design" />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={autoReview}
                onClick={() => setAutoReview(!autoReview)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  autoReview ? 'bg-primary' : 'bg-input'
                }`}
              >
                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  autoReview ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
              <label className="text-sm font-medium cursor-pointer" onClick={() => setAutoReview(!autoReview)}>
                {t('tasks.autoReview')}
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={loading || uploading}>
              {loading ? t('common.loading') : t('tasks.createButton')}
            </Button>
          </CardContent>
        </form>
      </Card>

      {/* Auto-Review Section */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t('review.title')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t('review.subtitle')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border p-2">
              <p className="text-xs text-muted-foreground">{t('review.statsReviewed')}</p>
              <p className="font-semibold text-sm">{reviewStats.reviewed}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-xs text-muted-foreground">{t('review.statsApproved')}</p>
              <p className="font-semibold text-sm text-green-600">{reviewStats.approved}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-xs text-muted-foreground">{t('review.statsRejected')}</p>
              <p className="font-semibold text-sm text-red-600">{reviewStats.rejected}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {!isReviewing ? (
              <Button onClick={handleStartReview} disabled={!configured} size="sm">
                <Play className="h-4 w-4 mr-1" />
                {t('review.start')}
              </Button>
            ) : (
              <Button onClick={stopReviewAgent} variant="destructive" size="sm">
                <Square className="h-4 w-4 mr-1" />
                {t('review.stop')}
              </Button>
            )}
            <div className="flex-1 min-w-0">
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs"
                value={currentConfigId ?? '__current__'}
                onChange={(e) => handleReviewConfigChange(e.target.value)}
                disabled={isReviewing || history.length === 0}
                title={t('agent.currentLlm', 'Current LLM Configuration')}
              >
                {!currentConfigId && (
                  <option value="__current__">
                    {`${t('agent.currentLlmPrefix', 'Current')}: ${apiType === 'openai' ? 'OpenAI' : 'Claude'} • ${modelName}`}
                  </option>
                )}
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.name} (${item.config.apiType === 'openai' ? 'OpenAI' : 'Claude'} • ${item.config.modelName})`}
                  </option>
                ))}
              </select>
            </div>
            {(executions.length > 0 || reviewGlobalLogs.length > 0) && (
              <Button variant="ghost" size="sm" onClick={handleClearReviewLogs}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          {!configured && (
            <span className="text-xs text-muted-foreground">
              {t('agent.configRequired')}{' '}
              <Link to="/agent/config" className="text-primary underline">{t('agent.config.title')}</Link>
            </span>
          )}

          {/* Review Execution Timeline */}
          {executions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                {t('review.execTimeline')} ({executions.length})
              </h3>
              <div className="space-y-1">
                {executions.map((exec) => (
                  <ReviewExecutionCard
                    key={exec.submissionId + exec.startedAt}
                    exec={exec}
                    isActive={exec.submissionId === activeSubmissionId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Global Review Log */}
          {reviewGlobalLogs.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground mb-1"
                onClick={() => setReviewLogExpanded(!reviewLogExpanded)}
              >
                {reviewLogExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {t('review.globalLog')} ({reviewGlobalLogs.length})
              </button>
              {reviewLogExpanded && (
                <div className="h-[150px] overflow-y-auto bg-muted/30 rounded-md p-2 font-mono text-xs space-y-1">
                  {reviewGlobalLogs.map((log, i) => <ReviewLogLine key={i} log={log} />)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
