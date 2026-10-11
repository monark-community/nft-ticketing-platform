"use client";

import { Navbar } from "@/components/Navbar";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWalletGuard } from "@/hooks/WalletGuard";
import { useState } from "react";
import { useAccount } from "wagmi";

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  wallet?: string;
}

export default function SignInPage() {
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const { address, isConnected } = useAccount();

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!form.firstName.trim()) e.firstName = "First name is required.";
    if (!form.lastName.trim()) e.lastName = "Last name is required.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "A valid email is required.";
    return e;
  }

  const { requireWallet } = useWalletGuard();

function handleSubmit() {
  const e = validate();
  setErrors(e);
  if (Object.keys(e).length > 0) return;
  requireWallet(() => {
    console.log("✅ Form submitted:", { ...form, walletAddress: address });
    alert(`Account ready!\nWallet: ${address}`);
  });
}

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* NAV */}
      <Navbar />

      {/* CONTENT */}
      <div className="flex-1 flex flex-col items-center py-10 px-4">
        <div className="w-full max-w-lg">

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Sign into your account</h1>
          </div>

          <div className="border border-gray-200 rounded-lg p-8 bg-white shadow-sm">

            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">
              Contact Information
            </p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                  First Name
                </Label>
                <Input
                  placeholder="Enter your first name"
                  value={form.firstName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange("firstName", e.target.value)
                  }
                  className={errors.firstName ? "border-red-400" : ""}
                />
                {errors.firstName && (
                  <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>
                )}
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                  Last Name
                </Label>
                <Input
                  placeholder="Enter your last name"
                  value={form.lastName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange("lastName", e.target.value)
                  }
                  className={errors.lastName ? "border-red-400" : ""}
                />
                {errors.lastName && (
                  <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>
                )}
              </div>
            </div>

            <div className="mb-4">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                Email Address
              </Label>
              <Input
                type="email"
                placeholder="johndoe@example.com"
                value={form.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("email", e.target.value)
                }
                className={errors.email ? "border-red-400" : ""}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email}</p>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full bg-[#4f35c2] hover:bg-[#3d28a0] text-white font-bold py-3 text-base rounded-lg mb-4"
            >
              Sign In
            </Button>

            <ConnectWalletButton />

            {errors.wallet && (
              <p className="text-red-500 text-xs mt-2">{errors.wallet}</p>
            )}

            <p className="text-center text-sm text-gray-500 mt-6">
              Don&apos;t have an account?{" "}
              <a href="/" className="font-bold text-gray-800 hover:underline">
                Create one here
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}