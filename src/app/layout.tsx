import type { ReactNode } from "react";
import { AccountProvider } from "../components/account-provider";
import { Chrome } from "../components/chrome";
import "./globals.css";
import { initialAccount } from "../server/account";
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const initial = await initialAccount();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AccountProvider initial={initial}>
          <Chrome />
          {children}
        </AccountProvider>
      </body>
    </html>
  );
}
