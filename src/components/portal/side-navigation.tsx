"use client";

import {
  ArrowRightLeft,
  BriefcaseBusiness,
  CircleHelp,
  FileText,
  House,
  Landmark,
  LogOut,
  PanelsTopLeft,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const navigationItems = [
  { href: "/overview", label: "Overview", icon: House },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/employment", label: "Employment", icon: BriefcaseBusiness },
  { href: "/passbook", label: "Contributions", icon: Landmark },
  { href: "/claims", label: "Claims", icon: FileText },
  { href: "/services", label: "Services", icon: PanelsTopLeft },
  { href: "/transfers", label: "Transfers", icon: ArrowRightLeft, secondary: true },
  { href: "/nomination", label: "Nomination", icon: UsersRound, secondary: true },
  { href: "/help", label: "Help", icon: CircleHelp, secondary: true },
] as const;

const navigationGroups = [
  { label: "Home", items: ["/overview"] },
  { label: "My account", items: ["/profile"] },
  { label: "Money and contributions", items: ["/employment", "/passbook"] },
  { label: "Claims and services", items: ["/claims", "/services", "/transfers", "/nomination"] },
  { label: "Support", items: ["/help"] },
] as const satisfies readonly {
  label: string;
  items: readonly (typeof navigationItems)[number]["href"][];
}[];

const mobileNavigationItems = navigationItems.filter((item) =>
  ["/overview", "/profile", "/claims", "/services"].includes(item.href),
);

const sectionRoutes: Record<(typeof navigationItems)[number]["href"], readonly string[]> = {
  "/overview": ["/overview"],
  "/profile": ["/profile", "/onboarding", "/uan-card", "/contact-details", "/basic-details", "/security"],
  "/employment": ["/employment"],
  "/passbook": ["/passbook"],
  "/claims": ["/claims"],
  "/services": ["/services", "/pmvbry"],
  "/transfers": ["/transfers"],
  "/nomination": ["/nomination"],
  "/help": ["/help"],
};

const mobileSectionRoutes: Record<string, readonly string[]> = {
  "/overview": ["/overview", "/employment", "/passbook"],
  "/profile": ["/profile", "/onboarding", "/uan-card", "/contact-details", "/basic-details", "/security"],
  "/claims": ["/claims"],
  "/services": ["/services", "/pmvbry", "/transfers", "/nomination", "/help"],
};

function isCurrentSection(pathname: string, href: (typeof navigationItems)[number]["href"]) {
  return sectionRoutes[href].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isCurrentMobileSection(pathname: string, href: string) {
  return mobileSectionRoutes[href]?.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ?? false;
}

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  // Warm the destination on intent, without eagerly loading every member page.
  const prefetch = (href: string) => { if (href !== pathname) router.prefetch(href); };

  if (mobile) {
    return (
      <nav className="mobile-navigation" aria-label="Mobile portal">
        {mobileNavigationItems.map(({ href, label, icon: Icon }) => (
          <Link aria-current={isCurrentMobileSection(pathname, href) ? "page" : undefined} href={href} key={href}
            onPointerEnter={() => prefetch(href)} onFocus={() => prefetch(href)} onTouchStart={() => prefetch(href)}>
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="desktop-navigation" aria-label="Portal">
      {navigationGroups.map((group) => (
        <section aria-label={group.label} className="desktop-navigation-group" key={group.label}>
          <p>{group.label}</p>
          <div>
            {group.items.map((href) => {
              const { label, icon: Icon } = navigationItems.find((item) => item.href === href)!;
              return (
                <Link aria-current={isCurrentSection(pathname, href) ? "page" : undefined} href={href} key={href}
                  onPointerEnter={() => prefetch(href)} onFocus={() => prefetch(href)}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setIsLoggingOut(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const result = (await response.json()) as { redirectTo?: string };

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      router.replace(result.redirectTo ?? "/login");
      router.refresh();
    } catch {
      setIsLoggingOut(false);
      setError("Could not clear this demo run. Try logging out again.");
    }
  }

  return (
    <div className={compact ? "logout-control logout-control-compact" : "logout-control"}>
      <button
        className={compact ? "logout-button logout-button-compact" : "logout-button"}
        disabled={isLoggingOut}
        onClick={logout}
        type="button"
      >
        <LogOut size={17} aria-hidden="true" />
        <span>{isLoggingOut ? "Signing out…" : "Log out"}</span>
      </button>
      <p aria-live="polite">{error}</p>
    </div>
  );
}

export function SideNavigation() {
  return <NavigationLinks />;
}

export function MobileNavigation() {
  return <NavigationLinks mobile />;
}
