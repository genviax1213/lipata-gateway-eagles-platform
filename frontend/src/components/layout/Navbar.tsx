import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import { canonicalRoutes } from "../../content/portalCopy";

type NavLeaf = {
  label: string;
  to: string;
};

type NavGroup = {
  label: string;
  items: NavLeaf[];
};

const navGroups: NavGroup[] = [
  {
    label: "About Us",
    items: [
      { label: "About", to: "/about" },
      { label: "History", to: "/history" },
      { label: "Magna Carta", to: "/magna-carta" },
      { label: "Resolutions", to: "/resolutions" },
    ],
  },
  {
    label: "Programs",
    items: [
      { label: "Activities", to: "/activities" },
      { label: "Schedules", to: "/schedules" },
    ],
  },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const { user } = useAuth();
  const isLoggedIn = Boolean(user);
  const location = useLocation();
  const desktopNavRef = useRef<HTMLDivElement | null>(null);

  const activeGroup = useMemo(() => (
    navGroups.find((group) => group.items.some((item) => location.pathname === item.to))?.label ?? null
  ), [location.pathname]);

  const navItem = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm tracking-wide transition ${
      isActive ? "bg-gold/20 text-gold" : "text-offwhite/90 hover:text-gold"
    }`;

  const dropdownItem = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm transition ${
      isActive ? "bg-gold/15 text-gold" : "text-offwhite/90 hover:bg-white/5 hover:text-gold"
    }`;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!desktopNavRef.current?.contains(event.target as Node)) {
        setOpenGroup(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenGroup(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <nav className="sticky top-0 z-40 border-b border-white/15 bg-ink/70 backdrop-blur-md">
      <div className="section-wrap relative py-3">
        <div className="md:hidden">
          <Link
            to="/"
            className="mx-auto flex w-full max-w-[42rem] items-center justify-center gap-2 text-center font-heading text-sm tracking-wide text-offwhite sm:text-base"
          >
            <img
              src="/images/tfoe-logo.png"
              alt="TFOE Logo"
              className="h-8 w-8 rounded-full border border-white/20 object-cover"
            />
            <span className="min-w-0">
              <span className="block text-center text-[14px] leading-tight min-[375px]:text-[16px] min-[390px]:text-[17px] min-[414px]:text-[18px] min-[600px]:text-[20px]">
                Lipata Gateway Eagles Club
              </span>
              <span className="block text-center font-sans text-[9px] tracking-[0.14em] text-mist/85 min-[375px]:text-[10px] min-[390px]:text-[10.5px] min-[414px]:text-[11px] min-[600px]:text-[12px]">
                TFOE-PE, Inc. CN201721277
              </span>
            </span>
          </Link>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gold/40 text-gold"
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation menu"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <span className="relative block h-4 w-5">
                <span className="absolute left-0 top-0 block h-0.5 w-5 rounded bg-current" />
                <span className="absolute left-0 top-[7px] block h-0.5 w-5 rounded bg-current" />
                <span className="absolute left-0 top-[14px] block h-0.5 w-5 rounded bg-current" />
              </span>
            </button>
          </div>
        </div>

        <div className="hidden items-center justify-center md:flex">
          <Link
            to="/"
            className="flex items-center justify-center gap-3 font-heading text-lg tracking-wide text-offwhite lg:text-2xl"
          >
            <img
              src="/images/tfoe-logo.png"
              alt="TFOE Logo"
              className="h-9 w-9 rounded-full border border-white/20 object-cover lg:h-10 lg:w-10"
            />
            <span className="text-center">
              <span className="block">Lipata Gateway Eagles Club</span>
              <span className="block font-sans text-xs tracking-[0.12em] text-mist/85 lg:text-sm">
                TFOE-PE, Inc. CN201721277
              </span>
            </span>
          </Link>
        </div>

        <div ref={desktopNavRef} className="hidden items-center justify-center gap-2 pt-2 md:flex">
          <NavLink to="/" className={navItem} end>Home</NavLink>
          {navGroups.map((group) => (
            <div key={group.label} className="relative">
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm tracking-wide transition focus:outline-none ${
                  openGroup === group.label || activeGroup === group.label
                    ? "bg-gold/20 text-gold"
                    : "text-offwhite/90 hover:text-gold"
                }`}
                aria-haspopup="menu"
                aria-expanded={openGroup === group.label}
                onClick={() => setOpenGroup((current) => current === group.label ? null : group.label)}
              >
                <span>{group.label}</span>
                <span className={`text-[10px] text-gold-soft transition ${openGroup === group.label ? "rotate-180" : ""}`}>▼</span>
              </button>
              <div className={`${openGroup === group.label ? "visible translate-y-0 opacity-100" : "invisible translate-y-1 opacity-0"} absolute left-0 top-full z-50 mt-2 min-w-[12rem] rounded-xl border border-white/15 bg-ink/95 p-2 shadow-[0_18px_40px_rgba(2,6,23,0.55)] transition duration-150`}>
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} className={dropdownItem} onClick={() => setOpenGroup(null)}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <NavLink to="/downloads" className={navItem}>Downloads</NavLink>
          <NavLink to="/contact" className={navItem}>Contact</NavLink>
          <NavLink
            to={isLoggedIn ? "/portal" : canonicalRoutes.login}
            className="ml-2 rounded-md border border-gold/50 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10"
          >
            Portal Login
          </NavLink>
        </div>

        {mobileOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-white/20 bg-ink/95 p-3 shadow-[0_14px_30px_rgba(2,6,23,0.5)] md:hidden">
            <div className="flex flex-col gap-1">
              <NavLink to="/" onClick={() => setMobileOpen(false)} className={navItem} end>
                Home
              </NavLink>
              {navGroups.map((group) => (
                <div key={group.label} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">{group.label}</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={navItem}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
              <NavLink to="/downloads" onClick={() => setMobileOpen(false)} className={navItem}>
                Downloads
              </NavLink>
              <NavLink to="/contact" onClick={() => setMobileOpen(false)} className={navItem}>
                Contact
              </NavLink>
              <NavLink
                to={isLoggedIn ? "/portal" : canonicalRoutes.login}
                onClick={() => setMobileOpen(false)}
                className="mt-1 rounded-md border border-gold/50 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10"
              >
                Portal Login
              </NavLink>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
