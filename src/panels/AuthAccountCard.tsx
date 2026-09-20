import { useState } from "react";
import { ExternalLink, LoaderCircle, LogOut, Mail } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { inboxUrlForEmail } from "@/lib/inbox-url";
import { useT } from "@/i18n/ui-lang";
import { cn } from "@/lib/utils";

/**
 * Settings account card — email magic link + OTP + Google.
 * Mail template: docs/AUTH_EMAIL_TEMPLATE.html (ConfirmationURL + Token).
 */
export function AuthAccountCard() {
  const t = useT();
  const {
    configured,
    user,
    isAdmin,
    signInWithEmail,
    verifyEmailOtp,
    signInWithGoogle,
    signOut,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inboxUrl = awaitingOtp ? inboxUrlForEmail(email) : null;

  if (!configured) {
    return (
      <div className="paper-inset px-3 py-2.5">
        <p className="text-xs font-medium">{t("auth.title")}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {t("auth.notConfigured")}
        </p>
      </div>
    );
  }

  if (user) {
    const label =
      user.email?.trim() ||
      user.user_metadata?.full_name ||
      user.id.slice(0, 8);
    return (
      <div className="paper-inset px-3 py-2.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium">{t("auth.title")}</p>
          {isAdmin ? (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                "bg-foreground text-background",
              )}
            >
              {t("auth.adminBadge")}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {t("auth.signedInAs", { email: String(label) })}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void signOut()
              .catch((err) => {
                setError(
                  err instanceof Error ? err.message : t("auth.signOutFailed"),
                );
              })
              .finally(() => setBusy(false));
          }}
          className={cn(
            "mt-2.5 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
            "bg-muted text-muted-foreground hover:bg-muted/80",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {busy ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <LogOut className="size-3.5" />
          )}
          {t("auth.signOut")}
        </button>
        {error ? (
          <p className="mt-1.5 text-[11px] text-destructive">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="paper-inset px-3 py-2.5">
      <p className="text-xs font-medium">{t("auth.title")}</p>
      {!awaitingOtp ? (
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {t("auth.help")}
        </p>
      ) : (
        <div className="mt-0.5 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
          <p>{t("auth.otpSentTo", { email })}</p>
          <p>{t("auth.senderHint")}</p>
          <p>{t("auth.afterSendHelp")}</p>
          {inboxUrl ? (
            <a
              href={inboxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1 font-medium text-foreground",
                "underline-offset-2 hover:underline",
              )}
            >
              {t("auth.openInbox")}
              <ExternalLink className="size-3 opacity-70" aria-hidden />
            </a>
          ) : null}
        </div>
      )}

      {!awaitingOtp ? (
        <form
          className="mt-2.5 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            setMessage(null);
            void signInWithEmail(email)
              .then(() => {
                setAwaitingOtp(true);
              })
              .catch((err) => {
                setError(
                  err instanceof Error ? err.message : t("auth.signInFailed"),
                );
              })
              .finally(() => setBusy(false));
          }}
        >
          <label className="block">
            <span className="sr-only">{t("auth.email")}</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              className={cn(
                "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs",
                "placeholder:text-muted-foreground/70",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className={cn(
              "inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Mail className="size-3.5" />
            )}
            {t("auth.sendEmail")}
          </button>
        </form>
      ) : (
        <div className="mt-2.5 space-y-2">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              setMessage(null);
              void verifyEmailOtp(email, otp)
                .catch((err) => {
                  setError(
                    err instanceof Error ? err.message : t("auth.otpInvalid"),
                  );
                })
                .finally(() => setBusy(false));
            }}
          >
            <label className="block">
              <span className="sr-only">{t("auth.otp")}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder={t("auth.otpPlaceholder")}
                className={cn(
                  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-center font-mono text-sm tracking-[0.2em]",
                  "placeholder:text-muted-foreground/70 placeholder:tracking-normal",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              />
            </label>
            <button
              type="submit"
              disabled={busy || otp.trim().length < 4}
              className={cn(
                "inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : null}
              {t("auth.verifyCode")}
            </button>
          </form>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAwaitingOtp(false);
              setOtp("");
              setMessage(null);
              setError(null);
            }}
            className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {t("auth.changeEmail")}
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          setMessage(null);
          void signInWithGoogle()
            .catch((err) => {
              setError(
                err instanceof Error ? err.message : t("auth.signInFailed"),
              );
            })
            .finally(() => setBusy(false));
        }}
        className={cn(
          "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium",
          "border border-border bg-background text-foreground shadow-sm",
          "hover:bg-muted/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0"
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {t("auth.continueGoogle")}
      </button>
      {message ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
