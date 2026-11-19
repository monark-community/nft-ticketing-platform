import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React's view transitions: an event card's picture grows into the event page's hero (#363).
  // Only navigations that use them are affected. Experimental in Next 16.1.
  experimental: { viewTransition: true },
  // Pinax's keyless RPC answers with "Access-Control-Allow-Origin: *,*", which browsers reject (#277).
  // Going through our own origin makes the request same-origin, so that header no longer matters.
  // Remove once Pinax fixes the header and point the frontend back at Pinax directly.
  async rewrites() {
    return [{ source: "/rpc/sepolia", destination: "https://sepolia.rpc.pinax.network" }];
  },
};

export default nextConfig;