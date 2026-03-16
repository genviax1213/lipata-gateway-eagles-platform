import { Link } from "react-router-dom";
import { canonicalRoutes } from "../../content/portalCopy";
import { useAuth } from "../../contexts/useAuth";

export default function Footer() {
  const { user } = useAuth();

  return (
    <footer className="mt-auto border-t border-white/15 bg-ink/55">
      <div className="section-wrap py-7 text-center text-sm text-offwhite/85">
        <div className="mb-3 flex items-center justify-center gap-4">
          <Link
            to="/contact"
            className="font-semibold text-gold-soft decoration-gold/0 underline-offset-4 transition hover:text-gold hover:decoration-gold hover:underline"
          >
            Contact
          </Link>
          <Link
            to={user ? "/portal" : canonicalRoutes.login}
            className="font-semibold text-gold-soft decoration-gold/0 underline-offset-4 transition hover:text-gold hover:decoration-gold hover:underline"
          >
            Portal Login
          </Link>
        </div>
        <p className="tracking-wide">
          © {new Date().getFullYear()} Lipata Gateway Eagles Club · Deo et Patria
        </p>
      </div>
    </footer>
  );
}
