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
      { to: "/portal", label: "Dashboard", icon: "dashboard", show: true, end: true },
      { to: "/portal/members", label: "Members", icon: "members", show: canViewMembers },
      { to: "/portal/contributions", label: canViewFinance ? "Finance" : "My Contributions", icon: "finance", show: true },
      { to: "/portal/forum", label: "Forum", icon: "forum", show: canViewForum },
      { to: "/portal/treasurer", label: "Treasurer", icon: "treasurer", show: canUseTreasurerDashboard },
      { to: "/portal/analytics", label: "Analytics", icon: "analytics", show: true },
      { to: "/portal/posts", label: "CMS Posts", icon: "cms", show: canManageCmsPosts },
      { to: "/portal/user-roles", label: "User Roles", icon: "roles", show: showRoleDelegation },
    ],
    [canManageCmsPosts, canUseTreasurerDashboard, canViewFinance, canViewForum, canViewMembers, showRoleDelegation],
  );

  const renderIcon = (icon: string) => {
    switch (icon) {
      case "dashboard":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M3 13h8V3H3zM13 21h8v-6h-8zM13 11h8V3h-8zM3 21h8v-6H3z" /></svg>;
      case "members":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg>;
      case "finance":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M12 1v22M17 5.5A4 4 0 0 0 13 2h-2a4 4 0 0 0 0 8h2a4 4 0 0 1 0 8h-2a4 4 0 0 1-4-3.5" /></svg>;
      case "forum":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>;
      case "treasurer":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 17l9 4 9-4M3 12l9 4 9-4" /></svg>;
      case "analytics":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>;
      case "cms":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-3h10a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
      case "roles":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6z" /><path d="M9.5 12l2 2 3-3" /></svg>;
      case "logout":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>;
      default:
        return null;
    }
  };

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
    void logout();
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
                aria-label={collapsed ? "Expand sidebar navigation" : "Collapse sidebar navigation"}
                title={collapsed ? "Expand sidebar navigation" : "Collapse sidebar navigation"}
              >
                {collapsed ? ">" : "<"}
              </button>
            </div>
          </div>

          <nav className={`space-y-2 text-sm ${collapsed ? "flex flex-col items-center" : ""}`}>
            {navItems.filter((item) => item.show).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkStyle} title={item.label}>
                {collapsed ? (
                  <span aria-label={item.label} className="inline-flex items-center justify-center">
                    {renderIcon(item.icon)}
                  </span>
                ) : (
                  item.label
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-10 border-t border-white/20 pt-6">
            <button
              onClick={handleLogout}
              className={`${collapsed ? "w-10 px-0 text-xs" : "px-3 text-sm"} rounded-md border border-gold/50 py-2 text-gold transition hover:bg-gold/10`}
              title="Logout"
              aria-label="Logout"
            >
              {collapsed ? (
                <span className="inline-flex items-center justify-center">
                  {renderIcon("logout")}
                </span>
              ) : "Logout"}
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
