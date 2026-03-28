import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import MemberContentRoute from "./MemberContentRoute";
import GuestRoute from "./GuestRoute";
import VisitorTracker from "../components/VisitorTracker";
import Landing from "../pages/Landing";
import About from "../pages/About";
import History from "../pages/History";
import Activities from "../pages/Activities";
import NewsArticle from "../pages/NewsArticle";
import Layout from "../components/layout/Layout";

const Login = lazy(() => import("../pages/Login"));
const MagnaCarta = lazy(() => import("../pages/MagnaCarta"));
const Resolutions = lazy(() => import("../pages/Resolutions"));
const Gmm = lazy(() => import("../pages/Gmm"));
const Schedules = lazy(() => import("../pages/Schedules"));
const Forms = lazy(() => import("../pages/Forms"));
const Contact = lazy(() => import("../pages/Contact"));
const ApplicantRegistration = lazy(() => import("../pages/ApplicantRegistration"));
const MemberRegistration = lazy(() => import("../pages/MemberRegistration"));
const PortalDashboard = lazy(() => import("../pages/PortalDashboard"));
const Members = lazy(() => import("../pages/Members"));
const Contributions = lazy(() => import("../pages/Contributions"));
const CmsPosts = lazy(() => import("../pages/CmsPosts"));
const UserRoles = lazy(() => import("../pages/UserRoles"));
const Forum = lazy(() => import("../pages/Forum"));
const SecuritySettings = lazy(() => import("../pages/SecuritySettings"));
const Logs = lazy(() => import("../pages/Logs"));
const Visitors = lazy(() => import("../pages/Visitors"));
const AdminLayout = lazy(() => import("../components/layout/AdminLayout"));

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <VisitorTracker />
        <Suspense fallback={<div className="px-4 py-8 text-sm text-mist/80">Loading page...</div>}>
          <Routes>

          {/* Public */}
          <Route path="/" element={<Layout><Landing /></Layout>} />
          <Route path="/about" element={<Layout><About /></Layout>} />
          <Route path="/about/:slug" element={<Layout><NewsArticle /></Layout>} />
          <Route path="/history" element={<Layout><History /></Layout>} />
          <Route path="/history/:slug" element={<Layout><NewsArticle /></Layout>} />
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
              <MemberContentRoute>
                <Layout><Resolutions /></Layout>
              </MemberContentRoute>
            }
          />
          <Route
            path="/resolutions/:slug"
            element={
              <MemberContentRoute>
                <Layout>
                  <NewsArticle forceMemberAccess backToOverride="/resolutions" backLabelOverride="Back to Resolutions" />
                </Layout>
              </MemberContentRoute>
            }
          />
          <Route
            path="/gmm"
            element={
              <MemberContentRoute>
                <Layout><Gmm /></Layout>
              </MemberContentRoute>
            }
          />
          <Route path="/activities" element={<Layout><Activities /></Layout>} />
          <Route path="/activities/:slug" element={<Layout><NewsArticle /></Layout>} />
          <Route path="/schedules" element={<Layout><Schedules /></Layout>} />
          <Route
            path="/downloads/forms"
            element={
              <ProtectedRoute>
                <Layout><Forms /></Layout>
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

          <Route
            path="/portal/visitors"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <Visitors />
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
