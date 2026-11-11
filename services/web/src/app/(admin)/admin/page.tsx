"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Inbox,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { keccak256, stringToHex, zeroHash } from "viem";
import { useAccount, useChains, useReadContract, useSwitchChain } from "wagmi";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { AdminEventsTab } from "@/components/admin/AdminEventsTab";
import { EmptyState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { TransactionStatus } from "@/components/TransactionStatus";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAdminEvents } from "@/hooks/useAdminEvents";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useTransaction } from "@/hooks/useTransaction";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import {
  displayNameInitial,
  formatRequestDate,
  organizerAccountName,
  organizerDisplayName,
  ORGANIZERS_PATH,
  ORGANIZER_REQUESTS_PATH,
  organizerPath,
  pendingOrganizerRequests,
  recentOrganizerDecisions,
  rejectOrganizerRequestPath,
  type Organizer,
  type OrganizerRequest,
} from "@/lib/admin-organizers";
import { apiClient } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { getTransactionErrorMessage } from "@/lib/transactions/errors";
import { cn } from "@/lib/utils";

// keccak256("ORGANIZER_ROLE"), the same constant the contract exposes
const ORGANIZER_ROLE = keccak256(stringToHex("ORGANIZER_ROLE"));
// OpenZeppelin's DEFAULT_ADMIN_ROLE is bytes32(0)
const DEFAULT_ADMIN_ROLE = zeroHash;

const ADMIN_ROLE_ERROR =
  "This wallet doesn't have the platform's admin role, so it can't approve or revoke organizers or change event settings. Use the platform's admin wallet.";
const ADMIN_ACCOUNT_ERROR = "This account isn't an admin. Sign in with the platform's admin wallet.";

type Tab = "requests" | "organizers" | "events";
type Notice = { tone: "success" | "warning" | "error"; title: string; message?: string };
type ActiveAction = { type: "approve" | "reject" | "revoke"; id: string };

// Admin page (#198): organizer requests and organizer access, built from the
// Figma "Admin/Requests page" and "Admin/Organizer Page" (#282). Approval and
// revocation are on-chain from the admin's wallet; the API only records them.
// The Events tab (#296) lists every event and lets the admin change its sale settings.
export default function AdminPage() {
  const hasMounted = useHasMounted();
  const { address, isConnected, chainId } = useAccount();
  const { user, isLoading: signingIn, signIn } = useWalletAuth();
  const chains = useChains();
  const contractChain = chains.find((chain) => chain.id === TICKET_NFT_CHAIN_ID);
  const { switchChain, isPending: switchingNetwork } = useSwitchChain();

  const [tab, setTab] = useState<Tab>("requests");
  const [requests, setRequests] = useState<OrganizerRequest[]>([]);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [syncing, setSyncing] = useState(false);
  const adminEvents = useAdminEvents(user?.role === "ADMIN");

  const transaction = useTransaction({
    getErrorMessage: (err) =>
      getTransactionErrorMessage(err, {
        // OpenZeppelin v5 custom error, included in the contract ABI
        customErrors: {
          AccessControlUnauthorizedAccount: ADMIN_ROLE_ERROR,
        },
      }),
  });

  // Read the contract's admin role before showing the actions, so a non-admin
  // wallet gets the explanation before it opens a transaction that would revert.
  const {
    data: hasOnChainAdminRole,
    isPending: checkingAdminRole,
    error: adminRoleError,
  } = useReadContract({
    address: TICKET_NFT_ADDRESS,
    abi: ticketNftAbi,
    functionName: "hasRole",
    args: [DEFAULT_ADMIN_ROLE, address ?? TICKET_NFT_ADDRESS],
    chainId: TICKET_NFT_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const onChainAdminRole = typeof hasOnChainAdminRole === "boolean" ? hasOnChainAdminRole : undefined;
  const onContractChain = chainId === TICKET_NFT_CHAIN_ID;
  const canActOnChain = onChainAdminRole === true && !checkingAdminRole && !adminRoleError && onContractChain;
  const networkName = contractChain?.name ?? "the contract's network";

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [nextRequests, nextOrganizers] = await Promise.all([
        apiClient<OrganizerRequest[]>(ORGANIZER_REQUESTS_PATH),
        apiClient<Organizer[]>(ORGANIZERS_PATH),
      ]);
      setRequests(nextRequests);
      setOrganizers(nextOrganizers);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "ADMIN") void loadData();
  }, [user?.role, loadData]);

  const pending = useMemo(() => pendingOrganizerRequests(requests), [requests]);
  const recentDecisions = useMemo(() => recentOrganizerDecisions(requests), [requests]);

  async function approve(request: OrganizerRequest) {
    if (!onContractChain) {
      setNotice({ tone: "error", title: "Switch network first", message: `Switch to ${networkName} to approve organizers.` });
      return;
    }
    if (!canActOnChain) {
      setNotice({ tone: "error", title: "Admin wallet required", message: ADMIN_ROLE_ERROR });
      return;
    }

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
      await apiClient(organizerPath(request.wallet), { method: "POST", data: {} });
      setNotice({
        tone: "success",
        title: "Organizer approved",
        message: `${organizerDisplayName(request)} can now create events.`,
      });
      await loadData();
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
    transaction.reset();
    setActiveAction({ type: "reject", id: request.id });
    try {
      await apiClient(rejectOrganizerRequestPath(request.id), { method: "POST", data: {} });
      setNotice({
        tone: "success",
        title: "Request rejected",
        message: `${organizerDisplayName(request)} can apply again later.`,
      });
      await loadData();
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

  async function revoke(organizer: Organizer) {
    if (!onContractChain) {
      setNotice({ tone: "error", title: "Switch network first", message: `Switch to ${networkName} to revoke organizer access.` });
      return;
    }
    if (!canActOnChain) {
      setNotice({ tone: "error", title: "Admin wallet required", message: ADMIN_ROLE_ERROR });
      return;
    }
    if (!window.confirm(`Revoke organizer access for ${organizerAccountName(organizer)}?`)) return;

    setNotice(null);
    transaction.reset();
    setActiveAction({ type: "revoke", id: organizer.wallet });

    const revoked = await transaction.run([
      {
        label: `Revoke organizer role from ${organizerAccountName(organizer)}`,
        request: {
          address: TICKET_NFT_ADDRESS,
          abi: ticketNftAbi,
          functionName: "revokeRole",
          args: [ORGANIZER_ROLE, organizer.wallet as `0x${string}`],
        },
      },
    ]);

    if (!revoked) {
      setActiveAction(null);
      return;
    }

    setSyncing(true);
    try {
      await apiClient(organizerPath(organizer.wallet), { method: "DELETE" });
      setNotice({
        tone: "success",
        title: "Organizer access revoked",
        message: `${organizerAccountName(organizer)} can no longer create events.`,
      });
      await loadData();
    } catch (err) {
      // The listener can save the on-chain revoke before this request arrives, so
      // the API reports that the user is already back to attendee. That is the
      // outcome we wanted, not a failed database update.
      if (err instanceof Error && err.message === "User is not an organizer") {
        setNotice({
          tone: "success",
          title: "Organizer access revoked",
          message: `${organizerAccountName(organizer)} can no longer create events.`,
        });
        await loadData();
      } else {
        setNotice({
          tone: "warning",
          title: "Revoked on-chain, but the database was not updated",
          message: "The role was revoked. Refresh in a moment and the listener will save it, or try again.",
        });
      }
    } finally {
      setSyncing(false);
      setActiveAction(null);
    }
  }

  const busy = activeAction !== null || transaction.isBusy || syncing;

  function actionLabel(action: ActiveAction | null, id: string): string | null {
    if (!action || action.id !== id || action.type === "reject") return null;
    if (syncing) return "Saving…";
    switch (transaction.state.phase) {
      case "preparing":
        return "Preparing…";
      case "awaitingWallet":
        return "Confirm in wallet…";
      case "confirming":
        return "Confirming…";
      case "stillPending":
        return "Still pending…";
      default:
        return null;
    }
  }

  if (!hasMounted) {
    return (
      <PageShell>
        <Panel className="items-center py-12">
          <Spinner className="size-6 text-primary" label="Loading admin page" />
        </Panel>
      </PageShell>
    );
  }

  if (!isConnected) {
    return (
      <PageShell>
        <Panel className="items-center py-10 text-center">
          <ShieldCheck className="size-10 text-primary" aria-hidden="true" />
          <h2 className="type-heading-sm text-foreground">Connect your admin wallet</h2>
          <p className="type-body-md text-muted-foreground">Only the wallet with the platform admin role can manage organizers.</p>
          <ConnectWalletButton />
        </Panel>
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell>
        <Panel className="items-center py-10 text-center">
          <ShieldCheck className="size-10 text-primary" aria-hidden="true" />
          <h2 className="type-heading-sm text-foreground">Sign in to continue</h2>
          <p className="type-body-md text-muted-foreground">Sign the message with your admin wallet to open the admin page.</p>
          <Button onClick={() => void signIn()} loading={signingIn}>
            Sign in
          </Button>
        </Panel>
      </PageShell>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <PageShell>
        <Alert tone="error" title="Admin access required">
          {ADMIN_ACCOUNT_ERROR}
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-heading-lg text-foreground">Admin</h1>
          <p className="type-body-md text-secondary-foreground">
            Review organizer requests, manage organizer access and see all events.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadData();
            void adminEvents.reload();
          }}
          loading={loading || adminEvents.loading}
          disabled={busy}
        >
          <RefreshCw aria-hidden="true" /> Refresh
        </Button>
      </div>

      {!onContractChain ? (
        <Alert
          tone="warning"
          title="Switch network to make changes"
          action={
            <Button
              size="sm"
              onClick={() => switchChain({ chainId: TICKET_NFT_CHAIN_ID })}
              loading={switchingNetwork}
            >
              Switch network
            </Button>
          }
        >
          Your wallet is on a different network. Switch to {networkName} to approve or revoke organizers and to change
          event settings.
        </Alert>
      ) : (
        <AdminRoleNotice
          checking={checkingAdminRole && Boolean(address)}
          hasRole={onChainAdminRole}
          error={adminRoleError ? "Could not read your admin role. Check the network and try again." : null}
        />
      )}

      {notice && (
        <Alert tone={notice.tone} title={notice.title}>
          {notice.message}
        </Alert>
      )}

      <TransactionStatus
        state={transaction.state}
        explorerUrl={transaction.explorerUrl}
        successMessage="Role updated on-chain."
        onStopWaiting={transaction.stopWaiting}
      />

      <div role="tablist" aria-label="Admin sections" className="flex gap-3 overflow-x-auto border-b border-border sm:gap-6">
        <TabButton
          active={tab === "requests"}
          onClick={() => setTab("requests")}
          icon={<Inbox aria-hidden="true" />}
          label="Organizer requests"
          count={pending.length}
        />
        <TabButton
          active={tab === "organizers"}
          onClick={() => setTab("organizers")}
          icon={<Users aria-hidden="true" />}
          label="Organizers"
          count={organizers.length}
        />
        <TabButton
          active={tab === "events"}
          onClick={() => setTab("events")}
          icon={<Ticket aria-hidden="true" />}
          label="Events"
          count={adminEvents.allTotal}
        />
      </div>

      {tab === "events" ? (
        <AdminEventsTab events={adminEvents} hasAdminRole={adminRoleError ? undefined : onChainAdminRole} />
      ) : loading ? (
        <Panel className="items-center py-12">
          <Spinner className="size-6 text-primary" label="Loading admin data" />
        </Panel>
      ) : loadError ? (
        <Alert
          tone="error"
          title="Could not load the admin data"
          action={
            <Button size="sm" variant="outline" onClick={() => void loadData()}>
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : tab === "requests" ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="type-heading-sm text-foreground">Pending requests</h2>
              <p className="type-body-sm text-muted-foreground">
                Approving grants the organizer role on-chain. Your wallet will ask you to confirm the transaction, and
                the database updates after it confirms.
              </p>
            </div>

            {pending.length === 0 ? (
              <EmptyState
                icon={<Inbox className="size-8" aria-hidden="true" />}
                title="No pending requests"
                description="New organizer requests will appear here."
              />
            ) : (
              <TableShell>
                <table className="w-full min-w-[780px] text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Name</Th>
                      <Th>Email</Th>
                      <Th>Wallet</Th>
                      <Th>Requested</Th>
                      <Th align="right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((request) => {
                      const approving = activeAction?.type === "approve" && activeAction.id === request.id;
                      const rejecting = activeAction?.type === "reject" && activeAction.id === request.id;
                      const label = actionLabel(activeAction, request.id);

                      return (
                        <tr key={request.id} className="border-b border-border last:border-0">
                          <Td>
                            <NameCell name={organizerDisplayName(request)} wallet={request.wallet}>
                              {request.message && (
                                <span className="line-clamp-1 type-body-sm text-muted-foreground">{request.message}</span>
                              )}
                            </NameCell>
                          </Td>
                          <Td className="type-body-md text-secondary-foreground">{request.user?.email ?? "—"}</Td>
                          <Td>
                            <WalletChip wallet={request.wallet} />
                          </Td>
                          <Td className="type-body-md text-secondary-foreground">{formatRequestDate(request.created_at)}</Td>
                          <Td align="right">
                            {label ? (
                              <span className="inline-flex items-center gap-2 type-body-sm text-primary">
                                <Spinner /> {label}
                              </span>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => void approve(request)}
                                  loading={approving}
                                  disabled={!canActOnChain || busy}
                                >
                                  <Check aria-hidden="true" /> Approve
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => void reject(request)}
                                  loading={rejecting}
                                  disabled={busy}
                                >
                                  <X aria-hidden="true" /> Reject
                                </Button>
                              </div>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableShell>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h2 className="type-heading-sm text-foreground">Recent decisions</h2>
              <Badge tone="neutral">Past 30 days</Badge>
            </div>

            {recentDecisions.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="size-8" aria-hidden="true" />}
                title="No decisions in the past 30 days"
                description="Decisions will appear here after you approve or reject a request."
              />
            ) : (
              <TableShell>
                <table className="w-full min-w-[680px] text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Name</Th>
                      <Th>Wallet</Th>
                      <Th>Decision</Th>
                      <Th>Decided</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDecisions.map((request) => (
                      <tr key={request.id} className="border-b border-border last:border-0">
                        <Td>
                          <NameCell name={organizerDisplayName(request)} wallet={request.wallet}>
                            {request.status === "REJECTED" && request.rejection_reason && (
                              <span className="line-clamp-1 type-body-sm text-muted-foreground">{request.rejection_reason}</span>
                            )}
                          </NameCell>
                        </Td>
                        <Td>
                          <WalletChip wallet={request.wallet} />
                        </Td>
                        <Td>
                          {request.status === "APPROVED" ? (
                            <Badge tone="success">
                              <CheckCircle2 className="size-3" aria-hidden="true" /> Approved
                            </Badge>
                          ) : (
                            <Badge tone="danger">
                              <XCircle className="size-3" aria-hidden="true" /> Rejected
                            </Badge>
                          )}
                        </Td>
                        <Td className="type-body-md text-secondary-foreground">{formatRequestDate(request.reviewed_at)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            )}
          </section>
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="type-heading-sm text-foreground">Organizers</h2>
            <p className="type-body-sm text-muted-foreground">
              Revoking removes the organizer role on-chain. Your wallet will ask you to confirm the transaction.
            </p>
          </div>

          {organizers.length === 0 ? (
            <EmptyState
              icon={<Users className="size-8" aria-hidden="true" />}
              title="No organizers yet"
              description="Approve a request to give someone organizer access."
            />
          ) : (
            <TableShell>
              <table className="w-full min-w-[780px] text-left">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Wallet</Th>
                    <Th>Events</Th>
                    <Th>Approved on</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {organizers.map((organizer) => {
                    const revoking = activeAction?.type === "revoke" && activeAction.id === organizer.wallet;
                    const label = actionLabel(activeAction, organizer.wallet);

                    return (
                      <tr key={organizer.wallet} className="border-b border-border last:border-0">
                        <Td>
                          <NameCell name={organizerAccountName(organizer)} wallet={organizer.wallet} />
                        </Td>
                        <Td className="type-body-md text-secondary-foreground">{organizer.email ?? "—"}</Td>
                        <Td>
                          <WalletChip wallet={organizer.wallet} />
                        </Td>
                        <Td className="type-body-md text-secondary-foreground">{organizer.event_count}</Td>
                        <Td className="type-body-md text-secondary-foreground">{formatRequestDate(organizer.approved_at)}</Td>
                        <Td align="right">
                          {label ? (
                            <span className="inline-flex items-center gap-2 type-body-sm text-primary">
                              <Spinner /> {label}
                            </span>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => void revoke(organizer)}
                              loading={revoking}
                              disabled={!canActOnChain || busy}
                            >
                              <X aria-hidden="true" /> Revoke
                            </Button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
          )}
        </section>
      )}
    </PageShell>
  );
}

function AdminRoleNotice({
  checking,
  hasRole,
  error,
}: {
  checking: boolean;
  hasRole: boolean | undefined;
  error: string | null;
}) {
  if (error) {
    return (
      <Alert tone="error" title="Could not check your admin role" icon={ShieldAlert}>
        {error}
      </Alert>
    );
  }
  if (checking) {
    return (
      <Alert tone="info" title="Checking your admin wallet" icon={null}>
        <span className="inline-flex items-center gap-2">
          <Spinner /> Reading your admin role from the contract.
        </span>
      </Alert>
    );
  }
  if (hasRole === false) {
    return (
      <Alert tone="error" title="This wallet cannot make changes" icon={ShieldAlert}>
        {ADMIN_ROLE_ERROR}
      </Alert>
    );
  }
  return null;
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 border-b-2 pb-3 type-body-md-strong whitespace-nowrap transition-colors",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="hidden sm:inline [&_svg]:size-4">{icon}</span>
      {label}
      <span className={cn("rounded-xs px-1.5 py-0.5 type-label-sm", active ? "bg-primary-tint text-primary" : "bg-muted")}>
        {count}
      </span>
    </button>
  );
}

function NameCell({ name, wallet, children }: { name: string; wallet: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary type-label-md text-primary-foreground tracking-normal"
        aria-hidden="true"
      >
        {displayNameInitial(name, wallet)}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="type-body-md-strong text-foreground">{name}</span>
        {children}
      </div>
    </div>
  );
}

function WalletChip({ wallet }: { wallet: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the address is still visible in the chip.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1.5 rounded-xs border border-border bg-muted px-2 py-1 type-mono-address text-secondary-foreground transition-colors hover:border-border-accent hover:text-foreground"
      title={copied ? "Copied" : `Copy ${wallet}`}
      aria-label={copied ? "Wallet address copied" : `Copy wallet address ${wallet}`}
    >
      {shortAddress(wallet)}
      {copied ? <Check className="size-3 text-success" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
    </button>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col gap-4 rounded-lg border border-border bg-card p-6", className)}>{children}</div>;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-glow flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 px-4 py-10 sm:px-8 md:px-10">{children}</main>
      <Footer />
    </div>
  );
}
