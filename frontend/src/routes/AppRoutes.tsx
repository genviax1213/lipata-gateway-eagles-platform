import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import GuestRoute from "./GuestRoute";

const Login = lazy(() => import("../pages/Login"));
const Landing = lazy(() => import("../pages/Landing"));
const About = lazy(() => import("../pages/About"));
const History = lazy(() => import("../pages/History"));
const MagnaCarta = lazy(() => import("../pages/MagnaCarta"));
const Resolutions = lazy(() => import("../pages/Resolutions"));
const Activities = lazy(() => import("../pages/Activities"));
const Schedules = lazy(() => import("../pages/Schedules"));
const Downloads = lazy(() => import("../pages/Downloads"));
const Contact = lazy(() => import("../pages/Contact"));
const ApplicantRegistration = lazy(() => import("../pages/ApplicantRegistration"));
const MemberRegistration = lazy(() => import("../pages/MemberRegistration"));
const PortalDashboard = lazy(() => import("../pages/PortalDashboard"));
const Members = lazy(() => import("../pages/Members"));
const Contributions = lazy(() => import("../pages/Contributions"));
const CmsPosts = lazy(() => import("../pages/CmsPosts"));
const NewsArticle = lazy(() => import("../pages/NewsArticle"));
const UserRoles = lazy(() => import("../pages/UserRoles"));
const Forum = lazy(() => import("../pages/Forum"));
const SecuritySettings = lazy(() => import("../pages/SecuritySettings"));
const Logs = lazy(() => import("../pages/Logs"));
const Layout = lazy(() => import("../components/layout/Layout"));
const AdminLayout = lazy(() => import("../components/layout/AdminLayout"));

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<div className="px-4 py-8 text-sm text-mist/80">Loading page...</div>}>
          <Routes>

          {/* Public */}
          <Route path="/" element={<Layout><Landing /></Layout>} />
          <Route path="/about" element={<Layout><About /></Layout>} />
          <Route path="/history" element={<Layout><History /></Layout>} />
          <Route
            path="/magna-carta"
            element={
              <ProtectedRoute>
                <Layout><MagnaCarta /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/resolutions"
            element={
              <ProtectedRoute>
                <Layout><Resolutions /></Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/activities" element={<Layout><Activities /></Layout>} />
          <Route path="/schedules" element={<Layout><Schedules /></Layout>} />
          <Route path="/news" element={<Navigate to="/activities" replace />} />
          <Route path="/hymnals" element={<Navigate to="/downloads" replace />} />
          <Route
            path="/downloads"
            element={
              <ProtectedRoute>
                <Layout><Downloads /></Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/contact" element={<Layout><Contact /></Layout>} />
          <Route
            path="/applicant-registration"
            element={
              <GuestRoute>
                <Layout><ApplicantRegistration /></Layout>
              </GuestRoute>
            }
          />
          <Route
            path="/member-registration"
            element={
              <GuestRoute>
                <Layout><MemberRegistration /></Layout>
              </GuestRoute>
            }
          />
          <Route path="/news/:slug" element={<Layout><NewsArticle /></Layout>} />

          {/* Auth */}
          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/member-login"
            element={<Navigate to="/login" replace />}
          />
          <Route
            path="/portal-login"
            element={<Navigate to="/login" replace />}
          />
          <Route
            path="/member-reset-password"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />

          {/* Portal */}
          <Route
            path="/portal"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <PortalDashboard />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/portal/members"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <Members />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/portal/contributions"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <Contributions />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/portal/posts"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <CmsPosts />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/portal/user-roles"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <UserRoles />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/portal/forum"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <Forum />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/portal/security"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <SecuritySettings />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/portal/logs"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <Logs />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
