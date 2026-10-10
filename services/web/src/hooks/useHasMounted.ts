"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false during server rendering and the first client render (hydration), true after.
// Used to render wallet-dependent UI only on the client, so it can't cause a hydration mismatch.
export function useHasMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true, // client
    () => false, // server and hydration
  );
}
