import { DotField } from "@/components/motion/DotField";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { WalletProvider } from "@/lib/wallet-provider";
import { AuthProvider } from "@/lib/auth-provider";
import "@rainbow-me/rainbowkit/styles.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts from the design system (#225): UI text, headings, and prices/addresses/tags.
// The files are in src/fonts with their OFL licenses (Fontsource 5.3.0, latin, variable weight), so
// the build never downloads them from Google (#392). Weight ranges match what Google served before.
const jakarta = localFont({
  src: "../fonts/plus-jakarta-sans/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
});

const playfair = localFont({
  src: "../fonts/playfair-display/playfair-display-latin-wght-normal.woff2",
  weight: "500 700",
  variable: "--font-playfair",
  adjustFontFallback: "Times New Roman",
});

const jetbrainsMono = localFont({
  src: "../fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-jetbrains-mono",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "Menlo", "Consolas", "monospace"],
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
    // The font variables go on <html>: that's where the base font and the type-* styles read them
    <html lang="en" className={`dark ${jakarta.variable} ${playfair.variable} ${jetbrainsMono.variable}`}>
      <body>
  {/* The live dot grid behind every page (#362) */}
  <DotField />
  <WalletProvider>
    <AuthProvider>
      <MotionProvider>
        {children}
      </MotionProvider>
    </AuthProvider>
  </WalletProvider>
</body>
    </html>
  );
}
