"use client";

import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { keccak256, stringToHex } from "viem";
import { useAccount } from "wagmi";

import { Navbar } from "@/components/Navbar";
import { TransactionStatus } from "@/components/TransactionStatus";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useTransaction } from "@/hooks/useTransaction";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import {
  formatRequestDate,
  organizerDisplayName,
  PENDING_ORGANIZER_REQUESTS_PATH,
  promoteOrganizerPath,
  rejectOrganizerRequestPath,
  type OrganizerRequest,
} from "@/lib/admin-organizers";
import { apiClient } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { TICKET_NFT_ADDRESS, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { getTransactionErrorMessage } from "@/lib/transactions/errors";

// keccak256("ORGANIZER_ROLE"), the same constant the contract exposes
const ORGANIZER_ROLE = keccak256(stringToHex("ORGANIZER_ROLE"));

type Notice = { tone: "success" | "warning" | "error"; title: string; message?: string };
type ActiveAction = { type: "approve" | "reject"; id: string };

// Admin page (#198): approve organizer requests. Approval has two steps because the
// backend holds no private keys: the admin grants ORGANIZER_ROLE from their own wallet,
// then the API records the role and closes the request.
export default function AdminPage() {
  const hasMounted = useHasMounted();
  const { isConnected } = useAccount();
  const { user, isLoading: signingIn, signIn } = useWalletAuth();

  const [requests, setRequests] = useState<OrganizerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [syncing, setSyncing] = useState(false);

  const transaction = useTransaction({
    getErrorMessage: (err) =>
      getTransactionErrorMessage(err, {
        revertReasons: {
          "AccessControl: account": "This wallet does not have the on-chain admin role, so it cannot approve organizers.",
        },
      }),
  });

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRequests(await apiClient<OrganizerRequest[]>(PENDING_ORGANIZER_REQUESTS_PATH));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load organizer requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "ADMIN") void loadRequests();
  }, [user?.role, loadRequests]);

  async function approve(request: OrganizerRequest) {
    setNotice(null);
    transaction.reset();
    setActiveAction({ type: "approve", id: request.id });

    const granted = await transaction.run([
      {
        label: `Grant organizer role to ${organizerDisplayName(request)}`,
        request: {
          address: TICKET_NFT_ADDRESS,
          abi: ticketNftAbi,
          functionName: "grantRole",
          args: [ORGANIZER_ROLE, request.wallet as `0x${string}`],
        },
      },
    ]);

    if (!granted) {
      setActiveAction(null);
      return;
    }

    // The transaction is confirmed, so save the new role now instead of waiting for the listener
    setSyncing(true);
    try {
      await apiClient(promoteOrganizerPath(request.wallet), { method: "POST", data: {} });
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setNotice({
        tone: "success",
        title: "Organizer approved",
        message: `${organizerDisplayName(request)} can now create events.`,
      });
    } catch {
      setNotice({
        tone: "warning",
        title: "Approved on-chain, but the database was not updated",
        message: "The role was granted. Refresh in a moment and the listener will save it, or try again.",
      });
    } finally {
      setSyncing(false);
      setActiveAction(null);
    }
  }

  async function reject(request: OrganizerRequest) {
    if (!window.confirm(`Reject ${organizerDisplayName(request)}'s organizer request?`)) return;

    setNotice(null);
    setActiveAction({ type: "reject", id: request.id });
    try {
      await apiClient(rejectOrganizerRequestPath(request.id), { method: "POST", data: {} });
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setNotice({
        tone: "success",
        title: "Request rejected",
        message: `${organizerDisplayName(request)} can apply again later.`,
      });
    } catch (err) {
      setNotice({
        tone: "error",
        title: "Could not reject the request",
        message: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setActiveAction(null);
    }
  }

  const busy = activeAction !== null || transaction.isBusy || syncing;

  if (!hasMounted) {
    return (
      <PageShell>
        <Card className="items-center py-12">
          <Spinner className="size-6 text-primary" label="Loading admin page" />
        </Card>
      </PageShell>
    );
  }

  if (!isConnected) {
    return (
      <PageShell>
        <Card className="items-center py-10 text-center">
          <ShieldCheck className="size-10 text-primary" aria-hidden="true" />
          <CardTitle>Connect your admin wallet</CardTitle>
          <CardDescription>Only the wallet with the platform admin role can approve organizers.</CardDescription>
          <ConnectWalletButton />
        </Card>
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell>
        <Card className="items-center py-10 text-center">
          <ShieldCheck className="size-10 text-primary" aria-hidden="true" />
          <CardTitle>Sign in to continue</CardTitle>
          <CardDescription>Sign the message with your admin wallet to open the admin page.</CardDescription>
          <Button onClick={() => void signIn()} loading={signingIn}>
            Sign in
          </Button>
        </Card>
      </PageShell>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <PageShell>
        <Alert tone="error" title="Admin access required">
          This account is not an admin. Sign in with the wallet configured in <code>ADMIN_WALLET</code>.
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-heading-lg text-foreground">Admin</h1>
          <p className="type-body-md text-secondary-foreground">Review organizer requests and approve access.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadRequests()} loading={loading} disabled={busy}>
          <RefreshCw aria-hidden="true" /> Refresh
        </Button>
      </div>

      {notice && (
        <Alert tone={notice.tone} title={notice.title}>
          {notice.message}
        </Alert>
      )}

      <TransactionStatus
        state={transaction.state}
        explorerUrl={transaction.explorerUrl}
        successMessage="Organizer role granted on-chain."
        onStopWaiting={transaction.stopWaiting}
      />

      {loading ? (
        <Card className="items-center py-12">
          <Spinner className="size-6 text-primary" label="Loading organizer requests" />
        </Card>
      ) : loadError ? (
        <Alert
          tone="error"
          title="Could not load organizer requests"
          action={
            <Button size="sm" variant="outline" onClick={() => void loadRequests()}>
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : requests.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <Check className="size-9 text-success" aria-hidden="true" />
          <CardTitle>No pending requests</CardTitle>
          <CardDescription>New organizer requests will appear here.</CardDescription>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((request) => {
            const approving = activeAction?.type === "approve" && activeAction.id === request.id;
            const rejecting = activeAction?.type === "reject" && activeAction.id === request.id;
            const name = organizerDisplayName(request);

            return (
              <Card key={request.id}>
                <CardHeader>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{name}</CardTitle>
                      <Badge tone="highlight">Pending review</Badge>
                    </div>
                    <CardDescription>
                      {request.user?.email ?? "No email"} · <span className="type-mono-address">{shortAddress(request.wallet)}</span>
                    </CardDescription>
                  </div>
                  <p className="shrink-0 type-body-sm text-muted-foreground">{formatRequestDate(request.created_at)}</p>
                </CardHeader>

                {request.message && <p className="type-body-md text-secondary-foreground">{request.message}</p>}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void approve(request)} loading={approving} disabled={busy && !approving}>
                    <Check aria-hidden="true" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void reject(request)}
                    loading={rejecting}
                    disabled={busy && !rejecting}
                  >
                    <X aria-hidden="true" /> Reject
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}
