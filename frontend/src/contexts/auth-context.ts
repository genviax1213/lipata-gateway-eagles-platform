import { createContext } from "react";

export interface AuthContextType {
  user: Record<string, unknown> | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
