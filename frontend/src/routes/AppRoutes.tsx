import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import GuestRoute from "./GuestRoute";

const Login = lazy(() => import("../pages/Login"));
const Landing = lazy(() => import("../pages/Landing"));
const About = lazy(() => import("../pages/About"));
const History = lazy(() => import("../pages/History"));
const Activities = lazy(() => import("../pages/Activities"));
const News = lazy(() => import("../pages/News"));
const Contact = lazy(() => import("../pages/Contact"));
const MemberApplication = lazy(() => import("../pages/MemberApplication"));
const PortalDashboard = lazy(() => import("../pages/PortalDashboard"));
const Members = lazy(() => import("../pages/Members"));
const Contributions = lazy(() => import("../pages/Contributions"));
const Analytics = lazy(() => import("../pages/Analytics"));
const CmsPosts = lazy(() => import("../pages/CmsPosts"));
const NewsArticle = lazy(() => import("../pages/NewsArticle"));
const UserRoles = lazy(() => import("../pages/UserRoles"));
const Forum = lazy(() => import("../pages/Forum"));
const TreasurerDashboard = lazy(() => import("../pages/TreasurerDashboard"));
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
          <Route path="/activities" element={<Layout><Activities /></Layout>} />
          <Route path="/news" element={<Layout><News /></Layout>} />
          <Route path="/contact" element={<Layout><Contact /></Layout>} />
          <Route
            path="/member-application"
            element={
              <GuestRoute>
                <Layout><MemberApplication /></Layout>
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
            path="/portal/analytics"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <Analytics />
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
            path="/portal/treasurer"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <TreasurerDashboard />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
