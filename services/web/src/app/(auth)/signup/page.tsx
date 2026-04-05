"use client";

import { NetworkGuard } from "@/components/NetworkWarning";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWalletGuard } from "@/hooks/WalletGuard";
import { useState } from "react";
import { useAccount } from "wagmi";
// If '@/components/ui/label' does not exist, create 'src/components/ui/label.tsx' with a Label component.

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "user" | "organizer";
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  wallet?: string;
  role?: string;
}

export default function CreateAccountPage() {
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "user",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const { address, isConnected } = useAccount();
  
  // --- Validation ---
  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!form.firstName.trim()) e.firstName = "First name is required.";
    if (!form.lastName.trim()) e.lastName = "Last name is required.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "A valid email is required.";
    if (!form.role) e.role = "Please select a role.";
    if (!isConnected) e.wallet = "Please connect your wallet before continuing.";    return e;
  }

  // --- Mock MetaMask connect ---
  

  // --- Submit ---
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
      <nav className="bg-[#3a7bd5] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center text-white text-sm font-bold">
            🎟
          </div>
          <span className="text-white font-bold text-lg tracking-wide">SMARTPASS</span>
        </div>
        <a href="/signin" className="text-white text-sm font-medium hover:underline">
          Already have an account? Log in
        </a>
      </nav>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col items-center py-10 px-4">
        <div className="w-full max-w-lg">

          {/* HEADER */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
            <p className="text-gray-500 text-sm mt-1">
              Set up your profile and connect your wallet to get started
            </p>
          </div>

          {/* FORM CARD */}
          <div className="border border-gray-200 rounded-lg p-8 bg-white shadow-sm">

            {/* SECTION LABEL */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">
              Contact Information
            </p>

            {/* FIRST / LAST NAME */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                  First Name
                </Label>
                <Input
                  placeholder="Enter first name"
                  value={form.firstName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("firstName", e.target.value)}
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
                  placeholder="Enter last name"
                  value={form.lastName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("lastName", e.target.value)}
                  className={errors.lastName ? "border-red-400" : ""}
                />
                {errors.lastName && (
                  <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>
                )}
              </div>
            </div>

            {/* EMAIL */}
            <div className="mb-4">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                Email Address
              </Label>
              <Input
                type="email"
                placeholder="johndoe@example.com"
                value={form.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("email", e.target.value)}
                className={errors.email ? "border-red-400" : ""}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email}</p>
              )}
            </div>

            {/* PHONE */}
            <div className="mb-4">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                Phone Number
              </Label>
              <Input
                type="tel"
                placeholder="phone number"
                value={form.phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("phone", e.target.value)}
              />
            </div>

            {/* ROLE SELECTION */}
<div className="mb-6">
  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">
    I am a...
  </Label>
  <div className="grid grid-cols-2 gap-3">
    <button
      type="button"
      onClick={() => handleChange("role", "user")}
      className={`border-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all ${
        form.role === "user"
          ? "border-[#4f35c2] bg-[#f5f3ff] text-[#4f35c2]"
          : "border-gray-200 text-gray-500 hover:border-gray-300"
      }`}
    >
       User
    </button>
    <button
      type="button"
      onClick={() => handleChange("role", "organizer")}
      className={`border-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all ${
        form.role === "organizer"
          ? "border-[#4f35c2] bg-[#f5f3ff] text-[#4f35c2]"
          : "border-gray-200 text-gray-500 hover:border-gray-300"
      }`}
    >
       Event Organizer
    </button>
  </div>
  {errors.role && (
    <p className="text-red-500 text-xs mt-1">{errors.role}</p>
  )}
</div>

            {/* WALLET SECTION */}
<div className="border-t border-gray-100 pt-6 mb-4">
  <p className="text-xs font-semibold text-gray-500 mb-3">
    Connect your wallet
  </p>

  <NetworkGuard />

  <ConnectWalletButton />

  {errors.wallet && (
    <p className="text-red-500 text-xs mt-2">{errors.wallet}</p>
  )}
  <p className="text-xs text-gray-400 text-center mt-2">
    *Required to buy, hold and verify NFT tickets*
  </p>
</div>

            {/* SUBMIT */}
            <Button
              onClick={handleSubmit}
              className="w-full bg-[#4f35c2] hover:bg-[#3d28a0] text-white font-bold py-3 text-base rounded-lg"
            >
              Create My Account
            </Button>

            <p className="text-center text-sm text-gray-500 mt-4">
              <a href="/signin" className="font-bold text-gray-800 hover:underline">
                Already have an account? Log in Here
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}