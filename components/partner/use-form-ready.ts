import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useFormReady() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
