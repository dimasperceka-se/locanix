"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const PreviewMap = dynamic(() => import("./PreviewMap"), { ssr: false });

/** Loads the map library only when the preview is about to scroll into view. */
export default function LazyPreviewMap() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="absolute inset-0">
      {show && <PreviewMap />}
    </div>
  );
}
