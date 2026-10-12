import { useEffect, useState } from "react";

// True from tablet width up (768px, the project's tablet breakpoint). Used to offer wide-only views.
const QUERY = "(min-width: 768px)";

export function useWideScreen() {
  const read = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY).matches : true);
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}
