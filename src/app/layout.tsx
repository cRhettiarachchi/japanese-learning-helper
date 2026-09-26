import type { ReactNode } from "react";
import { AccountProvider } from "../components/account-provider";
import { Chrome } from "../components/chrome";
import "./globals.css";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AccountProvider>
          <Chrome />
          {children}
        </AccountProvider>
      </body>
    </html>
  );
}
