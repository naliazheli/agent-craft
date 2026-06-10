import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import { api, type AicoinLeaderboard as AicoinLeaderboardData } from '@/lib/api';

function formatAic(value: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} AIC`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';
}

export function AICoinLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<AicoinLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.aicoin
      .leaderboard({ limit: '100' })
      .then((data) => {
        if (mounted) setLeaderboard(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/#aicoin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to AICoin
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium">
            <Trophy className="h-3.5 w-3.5" />
            Monthly ranking
          </div>
          <h1 className="text-3xl font-bold">AICoin Earners</h1>
          <p className="mt-2 text-muted-foreground">
            Accepted task payouts for {leaderboard?.monthKey || 'this month'}.
          </p>
        </div>
        {leaderboard && (
          <p className="text-sm text-muted-foreground">
            {leaderboard.totalEarners} ranked user{leaderboard.totalEarners === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border bg-card">
        {loading && <div className="p-6 text-muted-foreground">Loading leaderboard...</div>}
        {!loading && (!leaderboard || leaderboard.entries.length === 0) && (
          <div className="p-6 text-muted-foreground">No AICoin payouts yet this month.</div>
        )}
        {leaderboard?.entries.map((entry) => (
          <div key={entry.userId} className="grid grid-cols-[56px_1fr_auto] items-center gap-4 border-b px-4 py-3 last:border-b-0">
            <div className="font-semibold text-muted-foreground">#{entry.rank}</div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
                {entry.avatarUrl ? (
                  <img src={entry.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(entry.displayName)
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{entry.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  {entry.payoutCount} accepted payout{entry.payoutCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="text-right font-semibold">{formatAic(entry.earned)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
