export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/15 bg-ink/55">
      <div className="section-wrap py-7 text-center text-sm text-offwhite/85">
        <p className="tracking-wide">
          © {new Date().getFullYear()} Lipata Gateway Eagles Club · Deo et Patria
        </p>
      </div>
    </footer>
  );
}
