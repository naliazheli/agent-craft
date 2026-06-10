import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Coins,
  ExternalLink,
  FolderKanban,
  GitPullRequest,
  MessageSquare,
  Paperclip,
  Reply,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MathMarkdown } from '@/components/math/MathMarkdown';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import {
  getTaskHeadingTitle,
  getTaskSourceLabel,
  formatHackerOneRewardRange,
  formatHackerOneHours,
  type TaskSourceMetadata,
} from '@/lib/task-source';

function CommentItem({
  comment,
  taskId,
  onRefresh,
  depth = 0,
}: {
  comment: any;
  taskId: string;
  onRefresh: () => void;
  depth?: number;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [sending, setSending] = useState(false);

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    setSending(true);
    try {
      await api.comments.create(taskId, { content: replyContent, parentId: comment.id });
      setReplyContent('');
      setShowReply(false);
      onRefresh();
    } catch {}
    setSending(false);
  };

  return (
    <div className={depth > 0 ? 'ml-6 border-l-2 border-muted pl-4' : ''}>
      <div className="py-2">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{comment.user?.displayName || 'User'}</span>
          <Badge variant="outline" className="px-1 py-0 text-[10px]">
            {comment.user?.role}
          </Badge>
          <span>{new Date(comment.createdAt).toLocaleString()}</span>
        </div>
        <MathMarkdown content={comment.content} />
        {comment.fileUrls?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {(comment.fileUrls as string[]).map((url: string, i: number) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary underline"
              >
                <Paperclip className="h-3 w-3" />
                {t('comments.attachment')} {i + 1}
              </a>
            ))}
          </div>
        )}
        {user && depth === 0 && (
          <button
            onClick={() => setShowReply(!showReply)}
            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Reply className="h-3 w-3" />
            {t('comments.reply')}
          </button>
        )}
        {showReply && (
          <div className="mt-2 flex gap-2">
            <Input
              className="flex-1 text-sm"
              placeholder={t('comments.replyPlaceholder')}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReply()}
            />
            <Button size="sm" onClick={handleReply} disabled={sending || !replyContent.trim()}>
              {t('comments.send')}
            </Button>
          </div>
        )}
      </div>
      {comment.replies?.map((reply: any) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          taskId={taskId}
          onRefresh={onRefresh}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitContent, setSubmitContent] = useState('');
  const [submitAttachments, setSubmitAttachments] = useState<{ url: string; name: string }[]>([]);
  const [submitUploading, setSubmitUploading] = useState(false);
  const [prUrl, setPrUrl] = useState('');
  const [headSha, setHeadSha] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [projectError, setProjectError] = useState('');
  const [projectLoading, setProjectLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const reload = () => {
    if (id) api.tasks.get(id).then(setTask).catch(() => {});
  };

  useEffect(() => {
    if (id) {
      api.tasks
        .get(id)
        .then(setTask)
        .catch(() => navigate('/tasks'))
        .finally(() => setLoading(false));
    }
  }, [id, navigate]);

  const handleSubmit = async () => {
    if (!id || !submitContent) return;
    setActionLoading(true);
    setSubmitError('');
    setSubmitSuccess('');
    try {
      await api.submissions.submit(id, {
        content: submitContent,
        fileUrls: submitAttachments.length > 0 ? submitAttachments.map((a) => a.url) : undefined,
      });
      reload();
      setSubmitContent('');
      setSubmitAttachments([]);
      setSubmitSuccess(t('submissions.submitSuccess'));
    } catch (err: any) {
      setSubmitError(err.message || t('common.error'));
    }
    setActionLoading(false);
  };

  const handleSubmitPr = async () => {
    if (!id || !prUrl.trim() || !headSha.trim()) return;
    setActionLoading(true);
    setSubmitError('');
    setSubmitSuccess('');
    try {
      await api.tasks.submitPr(id, {
        prUrl: prUrl.trim(),
        headSha: headSha.trim(),
        note: submitContent.trim() || undefined,
      });
      reload();
      setPrUrl('');
      setHeadSha('');
      setSubmitContent('');
      setSubmitSuccess(t('submissions.submitPrSuccess'));
    } catch (err: any) {
      setSubmitError(err.message || t('common.error'));
    }
    setActionLoading(false);
  };

  const handleSubmitFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setSubmitUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await api.files.upload(file);
        setSubmitAttachments((prev) => [...prev, { url: result.url, name: file.name }]);
      }
    } catch {}
    setSubmitUploading(false);
    e.target.value = '';
  };

  const removeSubmitAttachment = (index: number) => {
    setSubmitAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReview = async (submissionId: string, action: string) => {
    setActionLoading(true);
    try {
      await api.submissions.review(submissionId, { action, reviewNote: reviewNote || undefined });
      reload();
      setReviewNote('');
    } catch {}
    setActionLoading(false);
  };

  const handleComment = async () => {
    if (!id || !commentContent.trim()) return;
    setActionLoading(true);
    try {
      await api.comments.create(id, { content: commentContent });
      reload();
      setCommentContent('');
    } catch {}
    setActionLoading(false);
  };

  const handleStartReview = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.tasks.review(id);
      reload();
    } catch {}
    setActionLoading(false);
  };

  const handleCreateProjectFromTask = async () => {
    if (!id) return;
    if (!user) {
      navigate('/login');
      return;
    }
    const isHackerOneSource = task?.taskSource === 'HACKERONE' || task?.rawTask?.source === 'HACKERONE_PROGRAM';
    if (
      isHackerOneSource &&
      !window.confirm('Create a HackerOne bounty project from this task using the HackerOne project template?')
    ) {
      return;
    }
    setProjectLoading(true);
    setProjectError('');
    try {
      const result = await api.projects.createFromTask(id, {
        seedPlan: true,
        confirmed: isHackerOneSource ? true : undefined,
      });
      navigate(`/projects/${result.project.id}`);
    } catch (err: any) {
      setProjectError(err.message || t('common.error'));
    } finally {
      setProjectLoading(false);
    }
  };

  if (loading) {
    return <div className="container py-12 text-center text-muted-foreground">{t('common.loading')}</div>;
  }
  if (!task) return null;

  const isCreator = user?.id === task.creatorId;
  const canSubmit = user && !isCreator && ['OPEN', 'REVIEWING'].includes(task.status);
  const isGithubTask = task.rawTask?.source === 'GITHUB_ISSUE';
  const sourceMetadata = (task.sourceMetadata || null) as TaskSourceMetadata | null;
  const isHackerOneTask = task.taskSource === 'HACKERONE' || task.rawTask?.source === 'HACKERONE_PROGRAM';
  const isErdosTask = task.taskSource === 'ERDOS_PROBLEM';
  const hasGithubIdentity = Boolean(user?.githubLogin || user?.authProvider === 'github');
  const expectedRepo =
    task.rawTask?.repoOwner && task.rawTask?.repoName
      ? `${task.rawTask.repoOwner}/${task.rawTask.repoName}`
      : '';
  const expectedIssue = task.rawTask?.externalId || '';
  const erdosProblemId = sourceMetadata?.externalProblemId;
  const erdosPrize = sourceMetadata?.originalPrize;
  const erdosCategories = sourceMetadata?.categories || [];
  const erdosRefs = sourceMetadata?.bibliographyRefs || [];
  const erdosNotes = sourceMetadata?.researchNotes || [];
  const erdosLinks = sourceMetadata?.relatedLinks || [];
  const headingTitle = getTaskHeadingTitle(task.title, task.taskSource, sourceMetadata);
  const hackerOneScope = sourceMetadata?.scope;
  const hackerOneProgram = sourceMetadata?.program;
  const hackerOneRewardRange = formatHackerOneRewardRange(sourceMetadata);
  const hackerOneRewardRows = sourceMetadata?.rewards?.table || [];
  const hackerOneBountyUpdatedAt = sourceMetadata?.rewards?.bountyTable?.updatedAt;
  const hackerOneHeaders = sourceMetadata?.testing?.requiredHeaders || [];
  const hackerOneReportTemplate = sourceMetadata?.reportTemplate || [];
  const hackerOneHighlights = hackerOneProgram?.highlights || {};
  const hackerOneHighlightLabels = [
    hackerOneHighlights.fastPayment ? 'Fast Payment' : '',
    hackerOneHighlights.goldStandardSafeHarbor ? 'Gold Safe Harbor' : '',
    hackerOneHighlights.aiSafeHarbor ? 'AI Safe Harbor' : '',
    hackerOneHighlights.topResponseEfficiency ? 'Top Response Efficiency' : '',
    hackerOneHighlights.managedByHackerOne ? 'Managed by HackerOne' : '',
    hackerOneHighlights.collaborationEnabled ? 'Collaboration Enabled' : '',
    hackerOneHighlights.includesRetesting ? 'Includes Retesting' : '',
  ].filter(Boolean);
  const hackerOneScopeExclusions = sourceMetadata?.policy?.scopeExclusions || [];
  const hackerOnePlatformExclusions = sourceMetadata?.policy?.platformStandardsExclusions || [];
  const hackerOneSafetyRules = [
    ...(sourceMetadata?.testing?.prohibitedActions || []),
    ...(sourceMetadata?.testing?.safeTestingRules || []),
  ];
  const hackerOneSubmissionPlaceholder =
    hackerOneReportTemplate.length > 0
      ? `Submit a security report with:\n- ${hackerOneReportTemplate.join('\n- ')}`
      : t('submissions.contentPlaceholder');

  return (
    <div className="container max-w-3xl py-8">
      <Button variant="ghost" className="mb-4" onClick={() => navigate('/tasks')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('common.back')}
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-2xl leading-tight">{headingTitle}</CardTitle>
            </div>
            <Badge>{t(`tasks.status.${task.status}`)}</Badge>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Coins className="h-4 w-4" />
            <span className="text-lg font-semibold text-foreground">
              {task.reward} {task.currency}
            </span>
            {erdosPrize && (
              <span className="ml-4 text-sm">
                Original prize: ${erdosPrize.amount} {erdosPrize.currency}
              </span>
            )}
            {task.deadline && (
              <span className="ml-4">
                {t('tasks.deadline')}: {new Date(task.deadline).toLocaleDateString()}
              </span>
            )}
            {task._count && (
              <span className="ml-4">
                {task._count.submissions} {t('submissions.title')} / {task._count.comments}{' '}
                {t('comments.title')}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="mb-2 font-semibold">{t('tasks.description')}</h3>
            <MathMarkdown content={task.description} />
          </div>

          {isErdosTask && sourceMetadata && (
            <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{getTaskSourceLabel(t, task.taskSource)}</Badge>
                {typeof erdosProblemId === 'number' && (
                  <Badge variant="secondary">Problem #{erdosProblemId}</Badge>
                )}
                {erdosPrize && (
                  <Badge variant="secondary">
                    ${erdosPrize.amount} {erdosPrize.currency}
                  </Badge>
                )}
                {erdosCategories.map((category) => (
                  <Badge key={category} variant="outline">
                    {category}
                  </Badge>
                ))}
              </div>

              {(sourceMetadata.disclaimer || sourceMetadata.statusNote) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
                  <MathMarkdown content={sourceMetadata.disclaimer || sourceMetadata.statusNote} />
                </div>
              )}

              {(sourceMetadata.statementMd || sourceMetadata.statement) && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 font-semibold">
                    <BookOpen className="h-4 w-4" />
                    Problem Statement
                  </h3>
                  <MathMarkdown content={sourceMetadata.statementMd || sourceMetadata.statement} />
                </div>
              )}

              {(sourceMetadata.researchNotesMd?.length || erdosNotes.length > 0) && (
                <div>
                  <h3 className="mb-2 font-semibold">Known Progress</h3>
                  <div className="space-y-3 text-muted-foreground">
                    {(sourceMetadata.researchNotesMd || erdosNotes).map((note, index) => (
                      <MathMarkdown key={index} content={note} />
                    ))}
                  </div>
                </div>
              )}

              {(erdosRefs.length > 0 ||
                sourceMetadata.bibliographySourceCode ||
                sourceMetadata.lastEditedAt ||
                sourceMetadata.formalized ||
                sourceMetadata.recommendedCitation) && (
                <div className="grid gap-3 md:grid-cols-2">
                  {erdosRefs.length > 0 && (
                    <div className="rounded-lg border bg-background/80 p-3">
                      <h4 className="mb-2 text-sm font-semibold">Referenced Sources</h4>
                      <p className="text-sm text-muted-foreground">{erdosRefs.join(', ')}</p>
                    </div>
                  )}
                  {(sourceMetadata.bibliographySourceCode || sourceMetadata.bibliographySourceUrl) && (
                    <div className="rounded-lg border bg-background/80 p-3">
                      <h4 className="mb-2 text-sm font-semibold">Bibliography Entry</h4>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {sourceMetadata.bibliographySourceCode && (
                          <p>Source code: {sourceMetadata.bibliographySourceCode}</p>
                        )}
                        {sourceMetadata.bibliographySourceUrl && (
                          <a
                            href={sourceMetadata.bibliographySourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open bibliography page
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {(sourceMetadata.formalized || sourceMetadata.lastEditedAt) && (
                    <div className="rounded-lg border bg-background/80 p-3">
                      <h4 className="mb-2 text-sm font-semibold">Tracking</h4>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {sourceMetadata.lastEditedAt && <p>Last edited: {sourceMetadata.lastEditedAt}</p>}
                        {sourceMetadata.formalized && (
                          <p>
                            Formalized statement:{' '}
                            {sourceMetadata.formalized.available ? sourceMetadata.formalized.label || 'Yes' : 'No'}
                          </p>
                        )}
                        {sourceMetadata.formalized?.url && (
                          <a
                            href={sourceMetadata.formalized.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open formalization
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {sourceMetadata.recommendedCitation && (
                    <div className="rounded-lg border bg-background/80 p-3 md:col-span-2">
                      <h4 className="mb-2 text-sm font-semibold">Suggested Citation</h4>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {sourceMetadata.recommendedCitation}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {erdosLinks.length > 0 && (
                <div>
                  <h3 className="mb-2 font-semibold">Related Links</h3>
                  <div className="flex flex-wrap gap-2">
                    {erdosLinks.map((link) => (
                      <a
                        key={`${link.label}-${link.url}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-primary hover:bg-background"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
	              )}
	            </div>
	          )}

	          {isHackerOneTask && sourceMetadata && (
	            <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
	              <div className="flex flex-wrap items-center gap-2">
	                <Badge variant="outline">{getTaskSourceLabel(t, task.taskSource)}</Badge>
	                {hackerOneProgram?.handle && <Badge variant="secondary">{hackerOneProgram.handle}</Badge>}
	                {hackerOneScope?.assetType && <Badge variant="outline">{hackerOneScope.assetType}</Badge>}
	                {hackerOneScope?.maxSeverity && <Badge variant="outline">max {hackerOneScope.maxSeverity}</Badge>}
	                {hackerOneRewardRange && <Badge variant="secondary">{hackerOneRewardRange}</Badge>}
	              </div>

	              <div className="grid gap-3 md:grid-cols-2">
	                <div className="rounded-lg border bg-background/80 p-3">
	                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
	                    <Target className="h-4 w-4" />
	                    Target Scope
	                  </h4>
	                  <div className="space-y-1 text-sm text-muted-foreground">
	                    {hackerOneProgram?.name && <p>Program: {hackerOneProgram.name}</p>}
	                    {hackerOneProgram?.website && (
	                      <p className="break-all">
	                        Website:{' '}
	                        <a href={hackerOneProgram.website} target="_blank" rel="noreferrer" className="underline">
	                          {hackerOneProgram.website}
	                        </a>
	                      </p>
	                    )}
	                    {hackerOneScope?.assetIdentifier && (
	                      <p className="break-all">Asset: {hackerOneScope.assetIdentifier}</p>
	                    )}
	                    {hackerOneScope?.displayName && <p>Display: {hackerOneScope.displayName}</p>}
	                    <p>
	                      Submission: {hackerOneScope?.eligibleForSubmission ? 'eligible' : 'unknown'} | Bounty:{' '}
	                      {hackerOneScope?.eligibleForBounty ? 'eligible' : 'unknown'}
	                    </p>
	                    <p>
	                      Resolved reports: {hackerOneScope?.totalResolvedReports ?? 'unknown'} | Assets in scope:{' '}
	                      {hackerOneProgram?.assetsInScope ?? 'unknown'}
	                    </p>
	                    {sourceMetadata.policy?.scopeDescription && <p>{sourceMetadata.policy.scopeDescription}</p>}
	                  </div>
	                </div>

	                <div className="rounded-lg border bg-background/80 p-3">
	                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
	                    <ShieldCheck className="h-4 w-4" />
	                    Program Signals
	                  </h4>
	                  <div className="space-y-2 text-sm text-muted-foreground">
	                    {hackerOneHighlightLabels.length > 0 && (
	                      <div className="flex flex-wrap gap-1.5">
	                        {hackerOneHighlightLabels.map((label) => (
	                          <Badge key={label} variant="outline">
	                            {label}
	                          </Badge>
	                        ))}
	                      </div>
	                    )}
	                    <p>
	                      Response: {formatHackerOneHours(hackerOneProgram?.responseTimes?.firstResponseHours) || 'n/a'} |
	                      Triage: {formatHackerOneHours(hackerOneProgram?.responseTimes?.triageHours) || 'n/a'} |
	                      Bounty: {formatHackerOneHours(hackerOneProgram?.responseTimes?.bountyHours) || 'n/a'}
	                    </p>
	                    {hackerOneHeaders.length > 0 ? (
	                      <div className="flex flex-wrap gap-1.5">
	                        {hackerOneHeaders.map((header) => (
	                          <Badge key={`${header.name}-${header.value}`} variant="outline">
	                            {header.name}: {header.value}
	                          </Badge>
	                        ))}
	                      </div>
	                    ) : (
	                      <p>No required testing header imported.</p>
	                    )}
	                    {hackerOneSafetyRules.length > 0 && <p>{hackerOneSafetyRules[0]}</p>}
	                  </div>
	                </div>
	              </div>

	              {hackerOneScope?.instruction && (
	                <div>
	                  <h4 className="mb-2 text-sm font-semibold">Scope Instructions</h4>
	                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{hackerOneScope.instruction}</p>
	                </div>
	              )}

	              {hackerOneRewardRows.length > 0 && (
	                <div>
	                  <div className="mb-2 flex flex-wrap items-center gap-2">
	                    <h4 className="text-sm font-semibold">External Reward Table</h4>
	                    {hackerOneBountyUpdatedAt && (
	                      <span className="text-xs text-muted-foreground">
	                        updated {new Date(hackerOneBountyUpdatedAt).toLocaleDateString()}
	                      </span>
	                    )}
	                  </div>
	                  <div className="overflow-x-auto rounded-lg border bg-background/80">
	                    <table className="w-full min-w-[520px] text-left text-sm">
	                      <thead className="border-b text-xs uppercase text-muted-foreground">
	                        <tr>
	                          <th className="px-3 py-2">Severity</th>
	                          <th className="px-3 py-2">Guidance</th>
	                          <th className="px-3 py-2">90d avg.</th>
	                          <th className="px-3 py-2">Reports</th>
	                        </tr>
	                      </thead>
	                      <tbody>
	                        {hackerOneRewardRows.map((row) => (
	                          <tr key={row.severity || row.label} className="border-b last:border-0">
	                            <td className="px-3 py-2 font-medium">{row.label || row.severity}</td>
	                            <td className="px-3 py-2 text-muted-foreground">{row.rawAmount || '-'}</td>
	                            <td className="px-3 py-2 text-muted-foreground">
	                              {row.averageBounty != null ? `$${row.averageBounty}` : '-'}
	                            </td>
	                            <td className="px-3 py-2 text-muted-foreground">{row.reportCount ?? '-'}</td>
	                          </tr>
	                        ))}
	                      </tbody>
	                    </table>
	                  </div>
	                </div>
	              )}

	              {(hackerOneScopeExclusions.length > 0 || hackerOnePlatformExclusions.length > 0) && (
	                <div className="grid gap-3 md:grid-cols-2">
	                  {hackerOneScopeExclusions.length > 0 && (
	                    <div>
	                      <h4 className="mb-2 text-sm font-semibold">Scope Exclusions</h4>
	                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
	                        {hackerOneScopeExclusions.map((item) => (
	                          <li key={`${item.category}-${item.details}`}>
	                            <span className="font-medium text-foreground">{item.category}</span>
	                            {item.details ? `: ${item.details.replace(/^•\\s*/, '')}` : ''}
	                          </li>
	                        ))}
	                      </ul>
	                    </div>
	                  )}
	                  {hackerOnePlatformExclusions.length > 0 && (
	                    <div>
	                      <h4 className="mb-2 text-sm font-semibold">Platform Standards Deviations</h4>
	                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
	                        {hackerOnePlatformExclusions.map((item) => (
	                          <li key={`${item.standard}-${item.justification}`}>
	                            <span className="font-medium text-foreground">{item.standard}</span>
	                            {item.justification ? `: ${item.justification}` : ''}
	                          </li>
	                        ))}
	                      </ul>
	                    </div>
	                  )}
	                </div>
	              )}

	              {hackerOneReportTemplate.length > 0 && (
	                <div>
	                  <h4 className="mb-2 text-sm font-semibold">Security Report Fields</h4>
	                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
	                    {hackerOneReportTemplate.map((item) => (
	                      <li key={item}>{item}</li>
	                    ))}
	                  </ul>
	                </div>
	              )}

	              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
	                <Button onClick={handleCreateProjectFromTask} disabled={projectLoading}>
	                  <FolderKanban className="mr-2 h-4 w-4" />
	                  {projectLoading ? 'Creating Project' : 'Create Project'}
	                </Button>
	                {projectError && (
	                  <span className="text-sm text-destructive">{projectError}</span>
	                )}
	              </div>
	            </div>
	          )}

	          {task.acceptanceCriteria && (
	            <div>
	              <h3 className="mb-2 font-semibold">{t('tasks.acceptanceCriteria')}</h3>
              <MathMarkdown content={task.acceptanceCriteria} />
            </div>
          )}

          {task.attachments?.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">{t('tasks.attachments')}</h3>
              <div className="flex flex-wrap gap-2">
                {(task.attachments as string[]).map((url: string, i: number) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm text-primary underline"
                  >
                    <Paperclip className="h-3 w-3" />
                    {t('comments.attachment')} {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          {task.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.codeType && (
                <Badge variant="secondary">{task.codeType}</Badge>
              )}
              {task.tags.map((tag: string) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {task.taskSource && task.taskSource !== 'CUSTOM' && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{getTaskSourceLabel(t, task.taskSource)}</Badge>
              </div>
              {task.sourceUrl && (
                <a
                  href={task.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline break-all"
                >
                  {task.sourceUrl}
                </a>
              )}
            </div>
          )}

          {isGithubTask && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <GitPullRequest className="h-4 w-4" />
                <span>{t('tasks.githubSubmission')}</span>
              </div>
              {task.rawTask?.externalUrl && (
                <a
                  href={task.rawTask.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline"
                >
                  {t('tasks.sourceIssue')}
                </a>
              )}
              {expectedRepo && (
                <p className="text-sm text-muted-foreground">
                  {t('tasks.expectedRepo')}: <span className="font-medium text-foreground">{expectedRepo}</span>
                </p>
              )}
              {expectedIssue && (
                <p className="text-sm text-muted-foreground">
                  {t('tasks.expectedIssue')}: <span className="font-medium text-foreground">#{expectedIssue}</span>
                </p>
              )}
              <p className="text-sm text-muted-foreground">{t('tasks.githubSubmissionHint')}</p>
              {!hasGithubIdentity && (
                <p className="text-sm text-destructive">{t('tasks.githubAuthRequired')}</p>
              )}
            </div>
          )}

          {isCreator && (
            <div className="flex gap-2">
              {task.status === 'OPEN' && (
                <>
                  <Button onClick={handleStartReview} disabled={actionLoading}>
                    {t('tasks.startReview')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      await api.tasks.cancel(task.id);
                      navigate('/tasks');
                    }}
                  >
                    {t('tasks.cancelTask')}
                  </Button>
                </>
              )}
              {task.status === 'REVIEWING' && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await api.tasks.cancel(task.id);
                    navigate('/tasks');
                  }}
                >
                  {t('tasks.cancelTask')}
                </Button>
              )}
            </div>
          )}

	          {canSubmit && (
	            <div className="space-y-3 border-t pt-4">
	              <h3 className="font-semibold">
	                {isHackerOneTask ? 'Submit Security Report' : t(isGithubTask ? 'tasks.submitPr' : 'tasks.submitWork')}
	              </h3>

              {isGithubTask ? (
                <div className="space-y-3">
                  <Input
                    placeholder={t('submissions.prUrlPlaceholder')}
                    value={prUrl}
                    onChange={(e) => setPrUrl(e.target.value)}
                  />
                  <Input
                    placeholder={t('submissions.headShaPlaceholder')}
                    value={headSha}
                    onChange={(e) => setHeadSha(e.target.value)}
                  />
                  <textarea
                    className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder={t('submissions.prNotePlaceholder')}
                    value={submitContent}
                    onChange={(e) => setSubmitContent(e.target.value)}
                  />
                  <div className="space-y-1 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    <p>{t('submissions.validationChecklist')}</p>
                    {expectedRepo && <p>{t('tasks.expectedRepo')}: {expectedRepo}</p>}
                    {expectedIssue && <p>{t('tasks.expectedIssue')}: #{expectedIssue}</p>}
                    <p>{t('submissions.validationShaHint')}</p>
                  </div>
                </div>
              ) : (
                <>
	                  <textarea
	                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
	                    placeholder={isHackerOneTask ? hackerOneSubmissionPlaceholder : t('submissions.contentPlaceholder')}
	                    value={submitContent}
	                    onChange={(e) => setSubmitContent(e.target.value)}
	                  />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors hover:bg-accent">
                        <Paperclip className="h-4 w-4" />
                        <span>{submitUploading ? t('tasks.uploading') : t('tasks.attachments')}</span>
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleSubmitFileUpload}
                          disabled={submitUploading}
                        />
                      </label>
                    </div>
                    {submitAttachments.length > 0 && (
                      <div className="space-y-1">
                        {submitAttachments.map((att, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm"
                          >
                            <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-primary hover:underline"
                            >
                              {att.name}
                            </a>
                            <button
                              type="button"
                              onClick={() => removeSubmitAttachment(i)}
                              className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {submitError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
              {submitSuccess && (
                <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{submitSuccess}</span>
                </div>
              )}

              <Button
                onClick={isGithubTask ? handleSubmitPr : handleSubmit}
                disabled={
                  actionLoading ||
                  submitUploading ||
                  (isGithubTask && !hasGithubIdentity) ||
                  (isGithubTask ? !prUrl.trim() || !headSha.trim() : !submitContent)
                }
              >
                {t(isGithubTask ? 'submissions.submitPrButton' : 'submissions.submitButton')}
              </Button>
            </div>
          )}

          {task.submissions?.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">
                {t('submissions.title')} ({task.submissions.length})
              </h3>
              {task.submissions.map((sub: any) => (
                <Card key={sub.id}>
                  <CardContent className="space-y-2 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{sub.worker?.displayName || 'Worker'}</span>
                      <div className="flex items-center gap-2">
                        {sub.validationStatus && sub.validationStatus !== 'NOT_APPLICABLE' && (
                          <Badge variant={sub.validationStatus === 'PASSED' ? 'default' : 'destructive'}>
                            {t(`submissions.validationStatus.${sub.validationStatus}`)}
                          </Badge>
                        )}
                        <Badge variant="secondary">{t(`submissions.status.${sub.status}`)}</Badge>
                      </div>
                    </div>
                    {sub.prUrl && (
                      <div className="space-y-1 text-sm">
                        <a
                          href={sub.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-primary underline"
                        >
                          {sub.prUrl}
                        </a>
                        {sub.headSha && (
                          <p className="text-muted-foreground">
                            HEAD SHA:{' '}
                            <span className="font-mono text-foreground">{sub.headSha}</span>
                          </p>
                        )}
                      </div>
                    )}
                    <MathMarkdown content={sub.content} />
                    {sub.validationReason && (
                      <p className="text-sm text-muted-foreground">{sub.validationReason}</p>
                    )}
                    {sub.fileUrls?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(sub.fileUrls as string[]).map((url: string, i: number) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-primary underline"
                          >
                            <Paperclip className="h-3 w-3" />
                            {t('comments.attachment')} {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                    {sub.reviewNote && (
                      <p className="text-sm italic text-muted-foreground">{sub.reviewNote}</p>
                    )}
                    {isCreator && sub.status === 'SUBMITTED' && (
                      <div className="flex gap-2 pt-2">
                        <Input
                          placeholder={t('submissions.reviewNote')}
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleReview(sub.id, 'APPROVE')}
                          disabled={actionLoading}
                        >
                          {t('submissions.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleReview(sub.id, 'REQUEST_REVISION')}
                          disabled={actionLoading}
                        >
                          {t('submissions.requestRevision')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReview(sub.id, 'REJECT')}
                          disabled={actionLoading}
                        >
                          {t('submissions.reject')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="space-y-4 border-t pt-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <MessageSquare className="h-4 w-4" />
              {t('comments.title')} ({task.comments?.length || 0})
            </h3>
            {task.comments?.map((comment: any) => (
              <CommentItem key={comment.id} comment={comment} taskId={task.id} onRefresh={reload} />
            ))}
            {user && (
              <div className="flex gap-2 pt-2">
                <textarea
                  className="min-h-[60px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder={t('comments.placeholder')}
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                />
                <Button
                  onClick={handleComment}
                  disabled={actionLoading || !commentContent.trim()}
                  className="self-end"
                >
                  {t('comments.send')}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
