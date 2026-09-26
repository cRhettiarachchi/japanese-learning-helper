"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { UserRound, SunMoon } from "lucide-react";
import { useAccount } from "./account-provider";
import { StudyTimer } from "./study-timer";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from "./ui/dropdown-menu";
export function Chrome() {
  const { progress, error, signOut } = useAccount();
  const pathname = usePathname(),
    { theme, setTheme } = useTheme();
  const links = [
    ["/index.html", "Reading"],
    ["/grammar.html", "Grammar"],
    ["/listening/teppei-1586.html", "Listening"],
    ["/vocabulary.html", "Vocabulary"],
    ["/revisions.html", "Revisions"],
  ];
  return (
    <>
      <a href="#study-content" className="skip">
        Skip to content
      </a>
      <header className="app-header">
        <div className="header-top">
          <Link href="/" className="brand">
            日本語 <span>Japanese learner</span>
          </Link>
          <div className="header-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Appearance">
                  <SunMoon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  {["light", "dark", "system"].map((value) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {progress?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Profile: ${progress.user.name}`}
                  >
                    <UserRound />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={progress.busy}
                    onSelect={() => void signOut()}
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" asChild>
                <a href="/api/auth/authorize">Sign in</a>
              </Button>
            )}
          </div>
        </div>
        <StudyTimer />
        <nav className="app-nav" aria-label="Study pages">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={
                (label === "Reading" &&
                  (pathname === "/" ||
                    pathname === "/index.html" ||
                    pathname.startsWith("/readings/"))) ||
                pathname === href ||
                (label === "Listening" && pathname.startsWith("/listening/")) ||
                (label === "Revisions" && pathname.startsWith("/revisions/"))
                  ? "page"
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {error && (
        <p className="app-feedback" role="status">
          {error}
        </p>
      )}
    </>
  );
}
