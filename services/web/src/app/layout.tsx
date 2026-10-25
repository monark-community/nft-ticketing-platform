import { NetworkGuard } from "@/components/NetworkWarning";
import { WalletProvider } from "@/lib/wallet-provider";
import { AuthProvider } from "@/lib/auth-provider";
import "@rainbow-me/rainbowkit/styles.css";
import type { Metadata } from "next";
import { JetBrains_Mono, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Fonts from the design system (#225): UI text, headings, and prices/addresses/tags
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "NFTOKENPASS",
  description: "NFT Ticketing Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${jakarta.variable} ${playfair.variable} ${jetbrainsMono.variable}`}>
  <WalletProvider>
    <AuthProvider>
      <NetworkGuard />
      {children}
    </AuthProvider>
  </WalletProvider>
</body>
    </html>
  );
}
