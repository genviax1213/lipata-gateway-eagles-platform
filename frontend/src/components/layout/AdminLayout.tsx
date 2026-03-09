import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../../contexts/useAuth";
import { hasPermission, isAdminUser } from "../../utils/auth";
import { applyPortalTheme, readStoredPortalTheme, resolvePortalTheme } from "../../utils/portalTheme";
import RouteErrorBoundary from "../RouteErrorBoundary";

function getPortalTitle(user: Record<string, unknown> | null): string {
  const roleName = (user?.role as { name?: unknown } | undefined)?.name;
  const forumRole = user?.forum_role;
  const financeRole = user?.finance_role;

  if (typeof roleName === "string") {
    if (roleName === "membership_chairman") return "Membership Committee Chairman Portal";
    if (roleName === "superadmin") return "Superadmin Portal";
    if (roleName === "admin") return "Admin Portal";
    if (roleName === "officer") return "Officer Portal";
    if (roleName === "treasurer") return "Treasurer Portal";
    if (roleName === "auditor") return "Auditor Portal";
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

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const roleName = (user?.role as { name?: unknown } | undefined)?.name;
  const isApplicant = roleName === "applicant";
  const showRoleDelegation = isAdminUser(user) || hasPermission(user, "roles.delegate");
  const canViewMembers = isAdminUser(user) || roleName === "membership_chairman";
  const canViewLogs = isAdminUser(user);
  const canViewApplicantList = hasPermission(user, "applications.view") || hasPermission(user, "applications.review");
  const canOpenMembersSection = canViewMembers || canViewApplicantList;
  const canManageCmsPosts = hasPermission(user, "posts.create");
  const canViewFinance = hasPermission(user, "finance.view");
  const canViewForum = !isApplicant;
  const portalTitle = getPortalTitle(user);

  useEffect(() => {
    const applySavedTheme = () => {
      const stored = readStoredPortalTheme();
      applyPortalTheme(resolvePortalTheme(stored));
    };

    applySavedTheme();

    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "lgec.portal.theme.v1") return;
      applySavedTheme();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const navItems = useMemo(
    () => [
      { to: "/portal", label: "Dashboard", icon: "dashboard", show: true, end: true },
      { to: "/portal/members", label: "Directory", icon: "members", show: canOpenMembersSection },
      { to: "/portal/contributions", label: canViewFinance ? "Finance" : "My Contributions", icon: "finance", show: true },
      { to: "/portal/forum", label: "Forum", icon: "forum", show: canViewForum },
      { to: "/portal/posts", label: "CMS Posts", icon: "cms", show: canManageCmsPosts },
      { to: "/portal/user-roles", label: "User Roles", icon: "roles", show: showRoleDelegation },
      { to: "/portal/logs", label: "Logs", icon: "logs", show: canViewLogs },
      { to: "/portal/security", label: "Security Settings", icon: "security", show: true },
    ],
    [canManageCmsPosts, canOpenMembersSection, canViewFinance, canViewForum, canViewLogs, showRoleDelegation],
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
      case "cms":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-3h10a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
      case "roles":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6z" /><path d="M9.5 12l2 2 3-3" /></svg>;
      case "security":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M12 3l7 4v5c0 4.5-2.8 8.2-7 9-4.2-.8-7-4.5-7-9V7z" /><path d="M9 12a3 3 0 0 1 6 0v2H9z" /><path d="M10 12v-1a2 2 0 1 1 4 0v1" /></svg>;
      case "logs":
        return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
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

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? ((error.response?.data as { message?: string } | undefined)?.message ?? "Unable to log out right now. Please try again.")
        : "Unable to log out right now. Please try again.";
      window.alert(message);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="flex min-h-[calc(100vh-2rem)] gap-4 md:min-h-[calc(100vh-3rem)]">
        <aside className={`${collapsed ? "w-[61px]" : "w-[285px]"} shrink-0 transition-all duration-300 glass-card ${collapsed ? "px-2 py-5" : "p-5"} text-offwhite`}>
          <div className="mb-8">
            <div className={`mb-3 flex items-center ${collapsed ? "flex-col justify-center gap-2" : "justify-center gap-4"}`}>
              <img
                src="/images/tfoe-logo.png"
                alt="TFOE Logo"
                className={`${collapsed ? "h-9 w-9" : "h-16 w-16"} object-contain`}
              />
              <img
                src="/images/lgec-logo.png"
                alt="LGEC Logo"
                className={`${collapsed ? "h-9 w-9" : "h-16 w-16"} object-contain`}
              />
            </div>

            <div className={`flex ${collapsed ? "justify-center" : "items-end justify-between"}`}>
              {!collapsed && (
                <h2 className="text-xl font-heading leading-none">
                  {portalTitle}
                </h2>
              )}
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
              onClick={() => void handleLogout()}
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
          <div className="glass-card min-h-full p-6 md:p-8">
            <RouteErrorBoundary>{children}</RouteErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
