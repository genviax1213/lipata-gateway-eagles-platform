import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export default function GuestRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/portal" replace />;
  }

  return children;
}
