import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import { hasPermission, isAdminUser } from "../../utils/auth";

function getPortalTitle(user: Record<string, unknown> | null): string {
  const roleName = (user?.role as { name?: unknown } | undefined)?.name;
  const financeRole = user?.finance_role;
  const forumRole = user?.forum_role;

  if (typeof roleName === "string") {
    if (roleName === "membership_chairman") return "Chairman Portal";
    if (roleName === "admin") return "Admin Portal";
    if (roleName === "officer") return "Officer Portal";
    if (roleName === "applicant") return "Applicant Portal";
    if (roleName === "member") {
      if (financeRole === "treasurer") return "Treasurer Portal";
      if (financeRole === "auditor") return "Auditor Portal";
      if (forumRole === "forum_moderator") return "Moderator Portal";
      return "Member Portal";
    }
  }

  return "Member Portal";
}

function toShortTitle(label: string): string {
  return label
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const roleName = (user?.role as { name?: unknown } | undefined)?.name;
  const isApplicant = roleName === "applicant";
  const showRoleDelegation = isAdminUser(user) || hasPermission(user, "roles.delegate");
  const canViewMembers = hasPermission(user, "members.view");
  const canManageCmsPosts = hasPermission(user, "posts.create");
  const canViewFinance = hasPermission(user, "finance.view");
  const canViewForum = !isApplicant;
  const canUseTreasurerDashboard = hasPermission(user, "applications.fee.set") || hasPermission(user, "applications.fee.pay");
  const portalTitle = getPortalTitle(user);
  const portalShortTitle = toShortTitle(portalTitle);

  const navItems = useMemo(
    () => [
      { to: "/portal", label: "Dashboard", short: "DB", show: true, end: true },
      { to: "/portal/members", label: "Members", short: "MB", show: canViewMembers },
      { to: "/portal/contributions", label: canViewFinance ? "Finance" : "My Contributions", short: "FN", show: true },
      { to: "/portal/forum", label: "Forum", short: "FR", show: canViewForum },
      { to: "/portal/treasurer", label: "Treasurer", short: "TR", show: canUseTreasurerDashboard },
      { to: "/portal/analytics", label: "Analytics", short: "AN", show: true },
      { to: "/portal/posts", label: "CMS Posts", short: "CP", show: canManageCmsPosts },
      { to: "/portal/user-roles", label: "User Roles", short: "UR", show: showRoleDelegation },
    ],
    [canManageCmsPosts, canUseTreasurerDashboard, canViewFinance, canViewForum, canViewMembers, showRoleDelegation],
  );

  const linkStyle = ({ isActive }: { isActive: boolean }) => {
    if (collapsed) {
      return isActive
        ? "flex h-10 w-10 items-center justify-center rounded-lg bg-gold text-xs font-semibold !text-[#0b1b34]"
        : "flex h-10 w-10 items-center justify-center rounded-lg text-xs font-semibold text-offwhite/90 transition hover:bg-white/10 hover:!text-offwhite";
    }

    return isActive
      ? "block rounded-lg bg-gold px-4 py-2.5 font-semibold !text-[#0b1b34]"
      : "block rounded-lg px-4 py-2.5 text-offwhite/90 transition hover:bg-white/10 hover:!text-offwhite";
  };

  const handleLogout = () => {
    navigate("/", { replace: true });
    logout();
  };

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="flex min-h-[calc(100vh-2rem)] gap-4 md:min-h-[calc(100vh-3rem)]">
        <aside className={`${collapsed ? "w-20" : "w-72"} shrink-0 transition-all duration-300 glass-card p-5 text-offwhite`}>
          <div className="mb-8">
            <div className={`mb-3 flex items-center ${collapsed ? "justify-center gap-2" : "justify-center gap-4"}`}>
              <img
                src="/images/tfoe-logo.png"
                alt="TFOE Logo"
                className={`${collapsed ? "h-10 w-10" : "h-16 w-16"} object-contain`}
              />
              <img
                src="/images/lgec-logo.png"
                alt="LGEC Logo"
                className={`${collapsed ? "h-10 w-10" : "h-16 w-16"} object-contain`}
              />
            </div>

            <div className="flex items-end justify-between">
              <h2 className={`${collapsed ? "text-xs tracking-widest" : "text-xl"} font-heading leading-none`}>
                {collapsed ? portalShortTitle : portalTitle}
              </h2>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="rounded-md border border-white/20 px-2 py-1 text-xs opacity-70 transition hover:opacity-100"
              >
                {collapsed ? ">" : "<"}
              </button>
            </div>
          </div>

          <nav className={`space-y-2 text-sm ${collapsed ? "flex flex-col items-center" : ""}`}>
            {navItems.filter((item) => item.show).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkStyle} title={item.label}>
                {collapsed ? item.short : item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-10 border-t border-white/20 pt-6">
            <button
              onClick={handleLogout}
              className={`${collapsed ? "w-10 px-0 text-xs" : "px-3 text-sm"} rounded-md border border-gold/50 py-2 text-gold transition hover:bg-gold/10`}
              title="Logout"
            >
              {collapsed ? "LO" : "Logout"}
            </button>
          </div>
        </aside>

        <main className="flex-1">
          <div className="glass-card min-h-full p-6 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
