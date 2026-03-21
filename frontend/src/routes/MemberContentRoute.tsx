import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { canonicalRoutes } from "../content/portalCopy";
import { isApplicantUser } from "../utils/auth";

export default function MemberContentRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to={canonicalRoutes.login}
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  if (isApplicantUser(user)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
