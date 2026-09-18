"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const GA4_ID = "G-64HHGYSWY2";

export function GAPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    if (typeof w.gtag !== "function") return;
    const query = searchParams?.toString();
    const url = pathname + (query ? `?${query}` : "");
    w.gtag("config", GA4_ID, { page_path: url });
  }, [pathname, searchParams]);

  return null;
}
