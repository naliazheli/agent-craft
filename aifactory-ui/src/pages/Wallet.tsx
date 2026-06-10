import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, ArrowUpRight, ArrowDownLeft, RefreshCw, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const TX_TYPE_LABELS: Record<string, string> = {
  DAILY_INJECTION: 'wallet.txType.injection',
  SIGNUP_BONUS: 'wallet.txType.signup',
  TASK_ESCROW: 'wallet.txType.escrow',
  TASK_PAYOUT: 'wallet.txType.payout',
  TASK_REFUND: 'wallet.txType.refund',
};

export default function Wallet() {
  const { t } = useTranslation();
  const { user, patchUser } = useAuthStore();
  const [offchainBalance, setOffchainBalance] = useState<number>(0);
  const [onchainBalance, setOnchainBalance] = useState<string>('0');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const fetchData = async (page = 1) => {
    setLoading(true);
    try {
      const [balRes, txRes] = await Promise.all([
        api.wallet.balance(),
        api.wallet.transactions({ page: String(page), limit: '20' }),
      ]);

      setOffchainBalance(balRes.offchain);
      setOnchainBalance(balRes.onchain);
      setWalletAddress(balRes.walletAddress || '');
      setTransactions(txRes.data);
      setMeta(txRes.meta);
      patchUser({
        balance: balRes.offchain,
        walletAddress: balRes.walletAddress || undefined,
      });
    } catch (err) {
      console.error('Failed to load wallet data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setWithdrawAddress(walletAddress || '');
  }, [walletAddress]);

  const handleWithdraw = async (event: React.FormEvent) => {
    event.preventDefault();
    setWithdrawMessage(null);
    setWithdrawError(null);

    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawError('Enter a positive AIC amount.');
      return;
    }

    setWithdrawing(true);
    try {
      const result = await api.wallet.withdraw({
        amount,
        toAddress: withdrawAddress.trim() || undefined,
      });
      setWithdrawAmount('');
      setWithdrawMessage(`Withdrawal submitted: ${result.txHash}`);
      await fetchData(meta.page);
    } catch (error) {
      setWithdrawError((error as Error).message || 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  const getDirection = (tx: any): 'incoming' | 'outgoing' | 'neutral' => {
    if (!user?.id) return 'neutral';

    if (tx.fromUserId === user.id && tx.toUserId === user.id) {
      if (tx.type === 'TASK_ESCROW') return 'outgoing';
      if (tx.type === 'DAILY_INJECTION' || tx.type === 'SIGNUP_BONUS' || tx.type === 'TASK_REFUND') {
        return 'incoming';
      }
      return 'neutral';
    }

    if (tx.toUserId === user.id) return 'incoming';
    if (tx.fromUserId === user.id) return 'outgoing';
    return 'neutral';
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      {/* Balance Card */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-primary/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t('wallet.balance')}</p>
            <div className="flex items-center gap-2 mt-1">
              <Coins className="h-8 w-8 text-primary" />
              <span className="text-4xl font-bold">{(offchainBalance || 0).toFixed(2)}</span>
              <span className="text-lg text-muted-foreground">AIC</span>
            </div>
          </div>
          <button
            onClick={() => fetchData(meta.page)}
            className="p-2 rounded-full hover:bg-primary/10 transition-colors"
            title={t('wallet.refresh')}
          >
            <RefreshCw className={`h-5 w-5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Wallet Address */}
      {walletAddress && (
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground mb-2">{t('wallet.walletAddress')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm break-all">{walletAddress}</code>
            <button
              onClick={() => navigator.clipboard.writeText(walletAddress)}
              className="px-3 py-2 text-sm border rounded hover:bg-muted transition-colors"
            >
              {t('wallet.copy')}
            </button>
          </div>
        </div>
      )}

      {/* On-chain Balance */}
      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t('wallet.onchainBalance')}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold">{onchainBalance}</span>
              <span className="text-lg text-muted-foreground">AIC</span>
            </div>
          </div>
        </div>
      </div>

      {/* Withdraw */}
      <form onSubmit={handleWithdraw} className="rounded-xl border p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Withdraw AIC</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Convert off-chain AIC into on-chain AIC sent to a Polygon wallet.
            </p>
          </div>
          <Send className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="grid gap-3 md:grid-cols-[160px_1fr]">
          <label className="space-y-1">
            <span className="text-sm font-medium">Amount</span>
            <input
              value={withdrawAmount}
              onChange={(event) => setWithdrawAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Target wallet</span>
            <input
              value={withdrawAddress}
              onChange={(event) => setWithdrawAddress(event.target.value)}
              placeholder="0x..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>

        <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Withdrawal gas is paid by the platform reward-pool wallet in MATIC. Receiving AIC does not cost the user gas.
          If the user later sends AIC from their own wallet, that transaction fee is paid in that wallet with MATIC.
        </div>

        {withdrawError && <p className="text-sm text-red-600">{withdrawError}</p>}
        {withdrawMessage && <p className="break-all text-sm text-green-600">{withdrawMessage}</p>}

        <button
          type="submit"
          disabled={withdrawing || offchainBalance <= 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {withdrawing ? 'Withdrawing...' : 'Withdraw to Polygon'}
        </button>
      </form>

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{t('wallet.history')}</h2>
        {loading && transactions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t('common.loading')}</p>
        ) : transactions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t('wallet.noTransactions')}</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const direction = getDirection(tx);
              const isIncoming = direction === 'incoming';
              const isOutgoing = direction === 'outgoing';

              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-full ${isIncoming ? 'bg-green-100 text-green-600' : isOutgoing ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}
                    >
                      {isIncoming ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : isOutgoing ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <Coins className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {t(TX_TYPE_LABELS[tx.type] || tx.type)}
                      </p>
                      {tx.task && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {tx.task.title}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold ${isIncoming ? 'text-green-600' : isOutgoing ? 'text-red-600' : 'text-slate-500'}`}
                  >
                    {isIncoming ? '+' : isOutgoing ? '-' : ''}
                    {(tx.amount || 0).toFixed(2)} AIC
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              onClick={() => fetchData(meta.page - 1)}
              disabled={meta.page <= 1}
              className="px-3 py-1 text-sm rounded border disabled:opacity-50 hover:bg-muted transition-colors"
            >
              {t('common.back')}
            </button>
            <span className="px-3 py-1 text-sm text-muted-foreground">
              {meta.page} / {meta.totalPages}
            </span>
            <button
              onClick={() => fetchData(meta.page + 1)}
              disabled={meta.page >= meta.totalPages}
              className="px-3 py-1 text-sm rounded border disabled:opacity-50 hover:bg-muted transition-colors"
            >
              {t('wallet.next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
