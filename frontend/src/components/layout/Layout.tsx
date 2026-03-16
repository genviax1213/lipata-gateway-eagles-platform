import type { ReactNode } from "react";
import Navbar from "./Navbar";
import AnnouncementBar from "./AnnouncementBar";
import Footer from "./Footer";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(216,179,95,0.14),transparent_40%)]" />
      <Navbar />
      <AnnouncementBar />
      <main className="relative z-10 flex-1">{children}</main>
      <Footer />
    </div>
  );
}
