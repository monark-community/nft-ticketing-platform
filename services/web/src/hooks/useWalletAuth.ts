"use client";

import { useContext } from "react";
import { AuthContext } from "@/lib/auth-provider";

export type { UserProfile } from "@/lib/auth-provider";


export function useWalletAuth() {
    const ctx = useContext(AuthContext);
    if(!ctx) {
        throw new Error("useWalletAuth must be used inside <AuthProvider>");
    }
    return ctx;
}