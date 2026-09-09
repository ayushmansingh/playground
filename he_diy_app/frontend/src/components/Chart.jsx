import { useEffect, useRef } from "react";

/* The chart library draws SVG into a container rather than returning JSX.

   That is deliberate: those renderers carry the validated palette, the mark
   specs and the hover behaviour, and they were verified as-is. Wrapping them
   instead of rewriting them in JSX keeps that work intact and keeps React out
   of a hot render path it would gain nothing from. This component owns the
   container; the renderer owns everything inside it. */
export default function Chart({ draw, deps = [], className = "" }) {
  const holder = useRef(null);

  useEffect(() => {
    const element = holder.current;
    if (!element) return undefined;
    draw(element);
    return () => {
      element.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return <div ref={holder} className={className} />;
}
