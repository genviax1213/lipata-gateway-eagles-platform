export default function AuthLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy">
      <div className="text-center">
        <div className="mb-4 inline-block">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold/20 border-t-gold"></div>
        </div>
        <p className="text-sm text-mist">Initializing portal...</p>
      </div>
    </div>
  );
}
