import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessibilityFocusManager } from "@/components/accessibility-focus";
import { GAPageView } from "@/components/ga-page-view";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: { default: "SnagTime", template: "%s · SnagTime" },
  description: "Snag a time. Get booked.",
  applicationName: "SnagTime",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  openGraph: { title: "SnagTime", description: "Snag a time. Get booked.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        {/* GA4 — inline in <head> so it fires on the initial SSR response,
            not gated behind hydration (afterInteractive Script would miss
            hits on slow-hydrating first loads). Stream created 18/09/2026,
            book.get-scala.com had no analytics at all before this. */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-64HHGYSWY2" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', {
            'analytics_storage': 'granted',
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied'
          });
          gtag('js', new Date());
          gtag('config', 'G-64HHGYSWY2');
        `,
          }}
        />
      </head>
      <body>
        <AccessibilityFocusManager />
        {children}
        {/* fires 'config' again on every client-side route change, since
            gtag only auto-tracks the initial full page load */}
        <Suspense fallback={null}>
          <GAPageView />
        </Suspense>
      </body>
    </html>
  );
}
