export type AuthUser = Record<string, unknown> | null;

function extractRoleName(user: AuthUser): string | null {
  if (!user) return null;
  const role = user.role;
  if (!role || typeof role !== "object") return null;

  const maybeName = (role as { name?: unknown }).name;
  return typeof maybeName === "string" ? maybeName : null;
}

export function isAdminUser(user: AuthUser): boolean {
  if (!user) return false;

  const roleName = extractRoleName(user);
  return roleName === "admin";
}

export function hasPermission(user: AuthUser, permissionName: string): boolean {
  if (!user) return false;

  const role = user.role;
  const financeRole = (user as { finance_role?: unknown }).finance_role;
  const forumRole = (user as { forum_role?: unknown }).forum_role;

  if (role && typeof role === "object") {
    const permissions = (role as { permissions?: unknown }).permissions;
    if (Array.isArray(permissions)) {
      const inPrimaryRole = permissions.some((permission) => {
        if (!permission || typeof permission !== "object") return false;
        return (permission as { name?: unknown }).name === permissionName;
      });

      if (inPrimaryRole) {
        return true;
      }
    }
  }

  const financePermission =
    (financeRole === "treasurer" && ["finance.view", "finance.input", "finance.request_edit", "applications.fee.set", "applications.fee.pay"].includes(permissionName)) ||
    (financeRole === "auditor" && ["finance.view", "finance.approve_edits"].includes(permissionName));

  const forumPermission =
    forumRole === "forum_moderator" &&
    ["forum.view", "forum.create_thread", "forum.reply", "forum.moderate"].includes(permissionName);

  return financePermission || forumPermission;
}
