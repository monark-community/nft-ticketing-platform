"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
// If '@/components/ui/label' does not exist, create 'src/components/ui/label.tsx' with a Label component.

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  dob: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  dob?: string;
  wallet?: string;
}

export default function CreateAccountPage() {
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    dob: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // --- Validation ---
  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!form.firstName.trim()) e.firstName = "First name is required.";
    if (!form.lastName.trim()) e.lastName = "Last name is required.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "A valid email is required.";
    if (!form.password || form.password.length < 8)
      e.password = "Password must be at least 8 characters.";
    if (!form.dob) e.dob = "Date of birth is required.";
    if (!walletAddress) e.wallet = "Please connect your wallet before continuing.";
    return e;
  }

  // --- Mock MetaMask connect ---
  async function handleConnectWallet() {
    setWalletLoading(true);
    setErrors((prev) => ({ ...prev, wallet: undefined }));
    await new Promise((res) => setTimeout(res, 1500));
    const mockAddr =
      "0x" +
      Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * 65536).toString(16).padStart(4, "0").toUpperCase()
      ).join("").slice(0, 4) +
      "…" +
      Array.from({ length: 2 }, () =>
        Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase()
      ).join("");
    setWalletAddress(mockAddr);
    setWalletLoading(false);
  }

  // --- Submit ---
  function handleSubmit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    console.log("✅ Form submitted:", { ...form, walletAddress });
    alert(`Account ready!\nWallet: ${walletAddress}\nCheck the console for full details.`);
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
        <a href="#" className="text-white text-sm font-medium hover:underline">
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

            {/* PASSWORD */}
            <div className="mb-4">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                Password
              </Label>
              <Input
                type="password"
                placeholder="Create a strong password"
                value={form.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("password", e.target.value)}
                className={errors.password ? "border-red-400" : ""}
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password}</p>
              )}
            </div>

            {/* DATE OF BIRTH */}
            <div className="mb-6">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                Date of Birth
              </Label>
              <Input
                type="date"
                value={form.dob}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("dob", e.target.value)}
                className={errors.dob ? "border-red-400" : ""}
              />
              {errors.dob && (
                <p className="text-red-500 text-xs mt-1">{errors.dob}</p>
              )}
            </div>

            {/* WALLET SECTION */}
            <div className="border-t border-gray-100 pt-6 mb-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">
                Connect your wallet
              </p>

              {walletAddress ? (
                // Connected state
                <div className="w-full rounded-lg border-2 border-green-400 bg-green-50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-green-700">Wallet Connected ✓</p>
                    <p className="text-xs font-mono text-green-600 mt-0.5">{walletAddress}</p>
                  </div>
                  <button
                    onClick={() => setWalletAddress(null)}
                    className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                // Disconnected state
                <button
                  onClick={handleConnectWallet}
                  disabled={walletLoading}
                  className="w-full rounded-lg border-2 border-gray-300 bg-gray-100 hover:bg-gray-200 px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wider transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {walletLoading ? (
                    <>
                      <span className="animate-spin">⏳</span> Connecting…
                    </>
                  ) : (
                    <> Link Your Account to a MetaMask Wallet</>
                  )}
                </button>
              )}

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
              <a href="#" className="font-bold text-gray-800 hover:underline">
                Already have an account? Log in Here
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}