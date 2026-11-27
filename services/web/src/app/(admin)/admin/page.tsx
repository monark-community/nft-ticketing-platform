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
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type FocusEvent } from "react";
import { keccak256, stringToHex, zeroHash } from "viem";
import { useAccount, useChains, useReadContract, useSwitchChain } from "wagmi";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { AdminEventsTab } from "@/components/admin/AdminEventsTab";
import { EmptyState, MotionRows, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { CopyLiftOff, DrawnCheck, FoldAway, RollingNumber, Stamp } from "@/components/motion";
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
import { animate, EASE } from "@/lib/motion";
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
const TABS: Tab[] = ["requests", "organizers", "events"];
type Notice = { tone: "success" | "warning" | "error"; title: string; message?: string };
// How long a confirmation and its receipt stay before they fold away. Warnings and errors stay.
const NOTICE_MS = 6000;
type ActiveAction = { type: "approve" | "reject" | "revoke"; id: string };
// A request just approved or rejected (#374): stamped on its row, which then folds away
type Decided = { request: OrganizerRequest; status: "APPROVED" | "REJECTED"; index: number; folding: boolean };

const STAMP_HOLD_MS = 800; // the stamp lands (220 ms) and stays about half a second
const ROW_FOLD_MS = 260; // the row folds (200 ms), then the decision prints in Recent decisions

// Admin page (#198): organizer requests and organizer access, built from the
// Figma "Admin/Requests page" and "Admin/Organizer Page" (#282). Approval and
// revocation are on-chain from the admin's wallet; the API only records them.
// The Events tab (#296) lists every event and lets the admin change its sale settings.
// Motion (#374): tabs share a sliding underline and their panels slide in from the side you moved
// towards; counts roll. A decision is stamped on its row, which folds away before the decision
// prints into Recent decisions. Refresh turns its arrows once, then says "Updated".
export default function AdminPage() {
  const hasMounted = useHasMounted();
  const { address, isConnected, chainId } = useAccount();
  const { user, isLoading: signingIn, signIn } = useWalletAuth();
  const chains = useChains();
  const contractChain = chains.find((chain) => chain.id === TICKET_NFT_CHAIN_ID);
  const { switchChain, isPending: switchingNetwork } = useSwitchChain();

  const [tab, setTabState] = useState<{ id: Tab; dir: number }>({ id: "requests", dir: 0 });
  const [requests, setRequests] = useState<OrganizerRequest[]>([]);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false); // the requests and organizers came at least once
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [decided, setDecided] = useState<Decided | null>(null);
  const [printed, setPrinted] = useState<string | null>(null); // the decision that last reached Recent decisions
  const reduced = useReducedMotion();
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

  // What the last action left above the tabs, its notice and its receipt, goes when the next action
  // starts and when the admin moves to another tab. A confirmation and its receipt also fold away by
  // themselves NOTICE_MS after they show, or after the pointer or the focus leaves them, so the
  // receipt's explorer link can be opened. A transaction still in progress always stays (reset() keeps it).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const holdOutcome = {
    onPointerEnter: () => setHovered(true),
    onPointerLeave: () => setHovered(false),
    onFocus: () => setFocused(true),
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    },
  };
  function clearOutcome() {
    setNotice(null);
    transaction.reset();
    // Gone from under the pointer and the focus, so the next confirmation's timer runs
    setHovered(false);
    setFocused(false);
  }
  const confirmationShown = useEffectEvent(() => clearOutcome());
  const held = hovered || focused;
  useEffect(() => {
    if (notice?.tone !== "success" || held) return;
    const timer = window.setTimeout(() => confirmationShown(), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice, held]);

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
      setLoaded(true);
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

  // While its stamp shows, a decided request stays in its place; it reaches Recent decisions after
  // its row has folded away. The data itself is never held back.
  const pendingShown = useMemo(() => {
    if (!decided || decided.folding || pending.some((r) => r.id === decided.request.id)) return pending;
    const list = [...pending];
    list.splice(Math.min(decided.index, list.length), 0, decided.request);
    return list;
  }, [pending, decided]);
  const recentShown = useMemo(
    () => (decided ? recentDecisions.filter((r) => r.id !== decided.request.id) : recentDecisions),
    [recentDecisions, decided],
  );

  function showDecision(request: OrganizerRequest, status: Decided["status"]) {
    if (reduced) return;
    const index = pending.findIndex((r) => r.id === request.id);
    setDecided({ request, status, index: Math.max(index, 0), folding: false });
    const same = (d: Decided | null) => d?.request.id === request.id;
    window.setTimeout(() => setDecided((d) => (d && same(d) ? { ...d, folding: true } : d)), STAMP_HOLD_MS);
    window.setTimeout(() => {
      setDecided((d) => (same(d) ? null : d));
      setPrinted(request.id);
    }, STAMP_HOLD_MS + ROW_FOLD_MS);
    // Only for this arrival: a table shown again later (another tab and back) doesn't print it again
    window.setTimeout(() => setPrinted((id) => (id === request.id ? null : id)), STAMP_HOLD_MS + ROW_FOLD_MS + 700);
  }

  // Refresh turns its arrows once while it reloads, then says "Updated" for a moment
  const [refresh, setRefresh] = useState<{ turns: number; updated: boolean }>({ turns: 0, updated: false });
  async function reloadAll() {
    setRefresh((r) => ({ turns: r.turns + 1, updated: false }));
    // "Updated" waits for the arrows' one turn (600 ms), never for more than the reload
    await Promise.all([loadData(), adminEvents.reload(), new Promise((done) => window.setTimeout(done, reduced ? 0 : 600))]);
    setRefresh((r) => ({ ...r, updated: true }));
    window.setTimeout(() => setRefresh((r) => ({ ...r, updated: false })), 1600);
  }

  async function approve(request: OrganizerRequest) {
    clearOutcome();
    if (!onContractChain) {
      setNotice({ tone: "error", title: "Switch network first", message: `Switch to ${networkName} to approve organizers.` });
      return;
    }
    if (!canActOnChain) {
      setNotice({ tone: "error", title: "Admin wallet required", message: ADMIN_ROLE_ERROR });
      return;
    }

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

    if (granted !== "success") {
      setActiveAction(null);
      return;
    }

    // The transaction is confirmed, so save the new role now instead of waiting for the listener
    setSyncing(true);
    try {
      await apiClient(organizerPath(request.wallet), { method: "POST", data: {} });
      showDecision(request, "APPROVED");
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

    clearOutcome();
    setActiveAction({ type: "reject", id: request.id });
    try {
      await apiClient(rejectOrganizerRequestPath(request.id), { method: "POST", data: {} });
      showDecision(request, "REJECTED");
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
      clearOutcome();
      setNotice({ tone: "error", title: "Switch network first", message: `Switch to ${networkName} to revoke organizer access.` });
      return;
    }
    if (!canActOnChain) {
      clearOutcome();
      setNotice({ tone: "error", title: "Admin wallet required", message: ADMIN_ROLE_ERROR });
      return;
    }
    if (!window.confirm(`Revoke organizer access for ${organizerAccountName(organizer)}?`)) return;

    clearOutcome();
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

    if (revoked !== "success") {
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

  function setTab(next: Tab) {
    if (next === tab.id) return;
    setTabState({ id: next, dir: TABS.indexOf(next) > TABS.indexOf(tab.id) ? 1 : -1 });
    // The last action's outcome belongs to the tab it was taken on, unless it's still going
    if (!busy) clearOutcome();
  }

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
        <Button variant="outline" size="sm" onClick={() => void reloadAll()} disabled={busy || loading || adminEvents.loading} aria-busy={loading || adminEvents.loading}>
          {refresh.updated ? (
            <>
              <DrawnCheck className="text-success" /> Updated
            </>
          ) : (
            <>
              <RefreshCw key={refresh.turns} className={cn(refresh.turns > 0 && "motion-safe:animate-[spin-once_600ms_var(--ease-arrive)]")} aria-hidden="true" />{" "}
              Refresh
            </>
          )}
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
        <Alert tone={notice.tone} title={notice.title} {...holdOutcome}>
          {notice.message}
        </Alert>
      )}

      {transaction.state.phase !== "idle" && (
        <FoldAway {...holdOutcome}>
          <TransactionStatus
            state={transaction.state}
            explorerUrl={transaction.explorerUrl}
            successMessage="Role updated on-chain."
            onStopWaiting={transaction.stopWaiting}
          />
        </FoldAway>
      )}

      <div role="tablist" aria-label="Admin sections" className="flex gap-3 overflow-x-auto border-b border-border sm:gap-6">
        <TabButton
          active={tab.id === "requests"}
          onClick={() => setTab("requests")}
          icon={<Inbox aria-hidden="true" />}
          label="Organizer requests"
          count={pending.length}
          ready={loaded}
        />
        <TabButton
          active={tab.id === "organizers"}
          onClick={() => setTab("organizers")}
          icon={<Users aria-hidden="true" />}
          label="Organizers"
          count={organizers.length}
          ready={loaded}
        />
        <TabButton
          active={tab.id === "events"}
          onClick={() => setTab("events")}
          icon={<Ticket aria-hidden="true" />}
          label="Events"
          count={adminEvents.allTotal}
          ready={adminEvents.loaded}
        />
      </div>

      {/* The panel slides in from the side of the tab you moved to */}
      <div
        key={tab.id}
        className={cn("flex flex-col", tab.dir !== 0 && "motion-safe:animate-[tab-in_200ms_var(--ease-arrive)_backwards]")}
        style={{ "--tab-dir": tab.dir } as CSSProperties}
      >
        {tab.id === "events" ? (
          <AdminEventsTab events={adminEvents} hasAdminRole={adminRoleError ? undefined : onChainAdminRole} />
        ) : loading && !loaded ? (
          // Only the first load: reloads keep the tables on screen, so their rows can move (#374)
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
        ) : tab.id === "requests" ? (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="type-heading-sm text-foreground">Pending requests</h2>
                <p className="type-body-sm text-muted-foreground">
                  Approving grants the organizer role on-chain. Your wallet will ask you to confirm the transaction, and
                  the database updates after it confirms.
                </p>
              </div>

              {pendingShown.length === 0 && !decided ? (
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
                      <MotionRows items={pendingShown} itemKey={(request) => request.id} rowClassName="border-b border-border last:border-0">
                        {(request) => {
                          const approving = activeAction?.type === "approve" && activeAction.id === request.id;
                          const rejecting = activeAction?.type === "reject" && activeAction.id === request.id;
                          const label = actionLabel(activeAction, request.id);
                          const stamp = decided?.request.id === request.id ? decided.status : null;

                          return (
                            <>
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
                                {stamp ? (
                                  <Stamp tone={stamp === "APPROVED" ? "green" : "red"} className="mr-1">
                                    {stamp === "APPROVED" ? "Approved" : "Rejected"}
                                  </Stamp>
                                ) : label ? (
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
                            </>
                          );
                        }}
                      </MotionRows>
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

              {recentShown.length === 0 ? (
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
                      <MotionRows
                        items={recentShown}
                        itemKey={(request) => request.id}
                        arrive="print"
                        arriving={printed ? [printed] : undefined}
                        rowClassName="border-b border-border last:border-0"
                      >
                        {(request) => (
                          <>
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
                          </>
                        )}
                      </MotionRows>
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
                    <MotionRows items={organizers} itemKey={(organizer) => organizer.wallet} rowClassName="border-b border-border last:border-0">
                      {(organizer) => {
                        const revoking = activeAction?.type === "revoke" && activeAction.id === organizer.wallet;
                        const label = actionLabel(activeAction, organizer.wallet);

                        return (
                          <>
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
                          </>
                        );
                      }}
                    </MotionRows>
                  </tbody>
                </table>
              </TableShell>
            )}
          </section>
        )}
      </div>
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
  ready,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  ready: boolean; // the count is known (not the 0 shown while loading)
}) {
  // The count rolls over when it changes, with a quick punch when it goes up after loading
  const chip = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState({ count, ready });
  const [ups, setUps] = useState(0);
  if (count !== seen.count || ready !== seen.ready) {
    if (seen.ready && count > seen.count) setUps(ups + 1);
    setSeen({ count, ready });
  }
  useEffect(() => {
    if (ups > 0) animate(chip.current, [{ scale: 1 }, { scale: 1.25 }, { scale: 1 }], { duration: 220, easing: EASE.snap });
  }, [ups]);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative flex shrink-0 items-center gap-2 border-b-2 border-transparent pb-3 type-body-md-strong whitespace-nowrap transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="hidden sm:inline [&_svg]:size-4">{icon}</span>
      {label}
      <span ref={chip} className={cn("rounded-xs px-1.5 py-0.5 type-label-sm", active ? "bg-primary-tint text-primary" : "bg-muted")}>
        <RollingNumber value={count} />
      </span>
      {/* One underline for all the tabs: it glides to the tab you pick (like the navbar's) */}
      {active && (
        <m.span
          layoutId="admin-tab-underline"
          className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-primary"
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          aria-hidden="true"
        />
      )}
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
  const [copies, setCopies] = useState(0);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setCopies((n) => n + 1);
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
      // Starts with the visible address, so saying it reaches the chip (#417)
      aria-label={copied ? `${shortAddress(wallet)}: wallet address copied` : `${shortAddress(wallet)}: copy wallet address ${wallet}`}
    >
      {/* A copy of the address lifts off towards the clipboard, and the tick draws itself */}
      <CopyLiftOff copies={copies}>{shortAddress(wallet)}</CopyLiftOff>
      {copied ? <DrawnCheck className="size-3 text-success" /> : <Copy className="size-3" aria-hidden="true" />}
    </button>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col gap-4 rounded-lg border border-border bg-card p-6", className)}>{children}</div>;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-glow flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 px-4 py-10 sm:px-8 md:px-10">{children}</main>
      <Footer />
    </div>
  );
}
