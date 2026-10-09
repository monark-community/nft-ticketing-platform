"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { apiClient } from "@/lib/api";

interface NonceResponse {
    nonce: string;
}

export interface UserProfile {
    wallet_address: string;
    role: "USER" | "ORGANIZER" | "SCANNER" | "ADMIN"| string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    created_at?: string;
}

export function useWalletAuth() {
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { disconnect } = useDisconnect();

    const [nonce, setNonce] = useState<string | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isSigning, setIsSigning] = useState<boolean>(false);
    const [isVerifying, setIsVerifying] = useState<boolean>(false);
    const [authError, setAuthError] = useState<string | null>(null);

    const isRequestingRef = useRef<boolean>(false);

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

    const requestNonceAndSign = useCallback(async (): Promise<UserProfile | null> => {
        if (!address) {
            setAuthError("Wallet address is not available.");
            return null;
        }

        try {
            setAuthError(null);

            const normalizedAddress = address.toLowerCase();
            setIsSigning(true);

            const {nonce: receivedNonce} = await apiClient<NonceResponse>(`/api/auth/nonce?wallet=${normalizedAddress}`);
            setNonce(receivedNonce);

            const message = `Sign this message to authenticate with NFTicketPass.\n\nNonce: ${receivedNonce}`;
            const sig = await signMessageAsync({ message });
            setSignature(sig);
            setIsSigning(false);

            setIsVerifying(true);
            const verifiedUser = await apiClient("/api/auth/verify", {
                method: "POST",
                data: {
                    wallet: normalizedAddress,
                    signature: sig,
                },
            });

            const profile = await loadProfile();

            return profile;
        } catch (error: any) {
            if (error?.code === 4001 || error?.message?.includes("User rejected the request")) {
                setAuthError("Signature request was rejected by the user.");
            } else {
                setAuthError(error?.message || "An error occurred during the signing process.");
            }
            setUser(null);
            return null;
        } finally {
            setIsSigning(false);
            setIsVerifying(false);
            isRequestingRef.current = false;
        }

    }, [address, signMessageAsync]);

    useEffect(() => {
        if (isConnected && address && !user && !isSigning && !isVerifying && !isRequestingRef.current) {
            loadProfile().then((existingProfile) => {
                if (!existingProfile && !isRequestingRef.current) {
                    isRequestingRef.current = true;
                    requestNonceAndSign();
                }
            });
        }

        if (!isConnected) {
            setNonce(null);
            setSignature(null);
            setUser(null)
            setAuthError(null);
            isRequestingRef.current = false;
        }
    }, [isConnected, address, user, isVerifying, isSigning, loadProfile, requestNonceAndSign]);

    const logout = useCallback(async () => {
        try {
            await apiClient("/api/auth/logout", {method: "POST"});
        } catch (err) {
            console.error("Logout request failed: ", err);
        } finally {
            setUser(null);
            setNonce(null);
            setSignature(null);
            setAuthError(null);
            disconnect();
        }
    }, [disconnect]);

    useEffect(() => {
        const handleSessionExpired = () => {
            setUser(null);
            setNonce(null);
            setSignature(null);
        };

        if (typeof window !== "undefined") {
            window.addEventListener("auth:session-expired", handleSessionExpired);
            return () => {
                window.removeEventListener("auth:session-expired", handleSessionExpired);
            };
        }
    }, []);

    return {
        address, 
        isConnected,
        nonce,
        signature,
        user,
        role: user?.role ?? null,
        loadProfile,
        logout,
        isAuthenticated: Boolean(user),
        isLoading: isSigning || isVerifying,
        isSigning,
        isVerifying,
        authError,
        requestNonceAndSign,
    };
}
