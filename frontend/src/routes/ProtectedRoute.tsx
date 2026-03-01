import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { canonicalRoutes } from "../content/portalCopy";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={canonicalRoutes.login} replace />;
  return children;
}
