"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { apiClient } from "@/lib/api";
import { isSessionForWallet } from "@/lib/auth-session";

export interface UserProfile {
  wallet_address: string;
  role: "USER" | "ORGANIZER" | "SCANNER" | "ADMIN";
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  created_at?: string;
  profile_complete: boolean;
}

export interface AuthContextValue {
  address: string | undefined;
  isConnected: boolean;
  user: UserProfile | null;
  role: UserProfile["role"] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  signIn: () => Promise<UserProfile | null>;
  loadProfile: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function isUserRejection(error: unknown): boolean {
  const e = error as { name?: string; code?: number; cause?: unknown } | null;
  if (!e) return false;
  if (e.name === "UserRejectedRequestError" || e.code === 4001) return true;
  return e.cause ? isUserRejection(e.cause) : false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sign-in in progress, shared so concurrent callers don't request a second nonce
  const signInPromiseRef = useRef<Promise<UserProfile | null> | null>(null);
  // Wallet already auto-authenticated once; never retried automatically after a rejection
  const autoAttemptedForRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const profile = await apiClient<UserProfile>("/api/users/me");
      setUser(profile);
      return profile;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const signIn = useCallback((): Promise<UserProfile | null> => {
    if (signInPromiseRef.current) return signInPromiseRef.current;

    if (!address) {
      setAuthError("Wallet address is not available.");
      return Promise.resolve(null);
    }

    const wallet = address.toLowerCase();

    const run = async (): Promise<UserProfile | null> => {
      setAuthError(null);
      setIsLoading(true);
      try {
        const { nonce } = await apiClient<{ nonce: string }>(`/api/auth/nonce?wallet=${wallet}`);
        const message = `Sign this message to authenticate with NFTokenPass.\n\nNonce: ${nonce}`;
        const signature = await signMessageAsync({ message });

        await apiClient("/api/auth/verify", {
          method: "POST",
          data: { wallet, signature },
        });

        return await loadProfile();
      } catch (error) {
        if (isUserRejection(error)) {
          setAuthError("Signature request was rejected.");
        } else {
          setAuthError(error instanceof Error ? error.message : "An error occurred during sign-in.");
        }
        setUser(null);
        return null;
      } finally {
        setIsLoading(false);
        signInPromiseRef.current = null;
      }
    };

    signInPromiseRef.current = run();
    return signInPromiseRef.current;
  }, [address, signMessageAsync, loadProfile]);

  // On connect or account switch: reuse the session cookie if valid, otherwise sign in once
  useEffect(() => {
    if (!isConnected || !address) {
      autoAttemptedForRef.current = null;
      setUser(null);
      setAuthError(null);
      return;
    }

    const wallet = address.toLowerCase();
    if (autoAttemptedForRef.current === wallet) return;
    autoAttemptedForRef.current = wallet;

    setUser(null);
    setAuthError(null);

    // Check the cookie's wallet before keeping the profile: after a switch in MetaMask it can
    // still be the previous wallet's session, which must not sign the new wallet in
    apiClient<UserProfile>("/api/users/me")
      .catch(() => null)
      .then((profile) => {
        if (autoAttemptedForRef.current !== wallet) return; // switched again meanwhile
        if (isSessionForWallet(profile, wallet)) setUser(profile);
        else signIn();
      });
  }, [isConnected, address, signIn]);

  useEffect(() => {
    const handleSessionExpired = () => setUser(null);
    window.addEventListener("auth:session-expired", handleSessionExpired);
    return () => window.removeEventListener("auth:session-expired", handleSessionExpired);
  }, []);

  const logout = useCallback(async () => {
    try {
        if (user) {
            await apiClient("/api/auth/logout", { method: "POST" });
        }
    } catch (err) {
      console.error("Logout request failed: ", err);
    } finally {
      setUser(null);
      setAuthError(null);
      disconnect();
    }
  }, [user, disconnect]);

  // Right after a switch, `user` can still hold the previous wallet's profile for a render
  // (pages' effects run before this provider's reset), so only share it while it matches
  const currentUser = isSessionForWallet(user, address) ? user : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      address,
      isConnected,
      user: currentUser,
      role: currentUser?.role ?? null,
      isAuthenticated: Boolean(currentUser),
      isLoading,
      authError,
      signIn,
      loadProfile,
      logout,
    }),
    [address, isConnected, currentUser, isLoading, authError, signIn, loadProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
