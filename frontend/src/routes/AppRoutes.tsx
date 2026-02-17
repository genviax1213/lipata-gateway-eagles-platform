import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import Login from "../pages/Login";
import Landing from "../pages/Landing";
import About from "../pages/About";
import History from "../pages/History";
import Activities from "../pages/Activities";
import News from "../pages/News";
import Contact from "../pages/Contact";
import MemberApplication from "../pages/MemberApplication";
import PortalDashboard from "../pages/PortalDashboard";
import Members from "../pages/Members";
import Contributions from "../pages/Contributions";
import Analytics from "../pages/Analytics";
import CmsPosts from "../pages/CmsPosts";
import NewsArticle from "../pages/NewsArticle";
import UserRoles from "../pages/UserRoles";
import Forum from "../pages/Forum";
import ProtectedRoute from "./ProtectedRoute";
import GuestRoute from "./GuestRoute";
import Layout from "../components/layout/Layout";
import AdminLayout from "../components/layout/AdminLayout";

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/portal-login"
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

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
