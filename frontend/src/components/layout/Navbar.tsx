import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const isLoggedIn = Boolean(user);

  const navItem = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm tracking-wide transition ${
      isActive ? "bg-gold/20 text-gold" : "text-offwhite/90 hover:text-gold"
    }`;

  return (
    <nav className="sticky top-0 z-40 border-b border-white/15 bg-ink/70 backdrop-blur-md">
      <div className="section-wrap relative py-3">
        <div className="flex items-center justify-between md:hidden">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 font-heading text-sm tracking-wide text-offwhite sm:text-base"
          >
            <img
              src="/images/tfoe-logo.png"
              alt="TFOE Logo"
              className="h-8 w-8 rounded-full border border-white/20 object-cover"
            />
            <span className="truncate">
              The Fraternal Order of Eagles - Philippine Eagles, Inc.
            </span>
          </Link>

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
              The Fraternal Order of Eagles - Philippine Eagles, Inc.
            </span>
          </Link>
        </div>

        <div className="hidden items-center justify-center gap-2 pt-2 md:flex">
          <NavLink to="/" className={navItem} end>Home</NavLink>
          <NavLink to="/about" className={navItem}>About</NavLink>
          <NavLink to="/history" className={navItem}>History</NavLink>
          <NavLink to="/activities" className={navItem}>Activities</NavLink>
          <NavLink to="/news" className={navItem}>News</NavLink>
          <NavLink to="/contact" className={navItem}>Contact</NavLink>
          {isLoggedIn ? (
            <NavLink
              to="/portal"
              className="ml-2 rounded-md border border-gold/50 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10"
            >
              Portal
            </NavLink>
          ) : (
            <NavLink
              to="/member-login"
              className="ml-2 rounded-md border border-gold/50 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10"
            >
              Member Login
            </NavLink>
          )}
        </div>

        {mobileOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-white/20 bg-ink/95 p-3 shadow-[0_14px_30px_rgba(2,6,23,0.5)] md:hidden">
            <div className="flex flex-col gap-1">
              <NavLink to="/" onClick={() => setMobileOpen(false)} className={navItem} end>
                Home
              </NavLink>
              <NavLink to="/about" onClick={() => setMobileOpen(false)} className={navItem}>
                About
              </NavLink>
              <NavLink to="/history" onClick={() => setMobileOpen(false)} className={navItem}>
                History
              </NavLink>
              <NavLink to="/activities" onClick={() => setMobileOpen(false)} className={navItem}>
                Activities
              </NavLink>
              <NavLink to="/news" onClick={() => setMobileOpen(false)} className={navItem}>
                News
              </NavLink>
              <NavLink to="/contact" onClick={() => setMobileOpen(false)} className={navItem}>
                Contact
              </NavLink>
              {isLoggedIn ? (
                <NavLink
                  to="/portal"
                  onClick={() => setMobileOpen(false)}
                  className="mt-1 rounded-md border border-gold/50 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10"
                >
                  Portal
                </NavLink>
              ) : (
                <NavLink
                  to="/member-login"
                  onClick={() => setMobileOpen(false)}
                  className="mt-1 rounded-md border border-gold/50 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10"
                >
                  Member Login
                </NavLink>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
