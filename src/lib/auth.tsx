// ─────────────────────────────────────────────────────────────────────────
// AuthProvider — Supabase session → ChatAgent / MyMemory instance name
// ─────────────────────────────────────────────────────────────────────────
//
// Logged in  → instance = user.id (UUID)
// Logged out → instance = stable guest_* for this browser
// ─────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import {
  bindClientInstanceName,
  getOrCreateGuestInstanceName,
} from "@/lib/agent-identity";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export type AuthStatus = "loading" | "ready";

type AuthContextValue = {
  status: AuthStatus;
  configured: boolean;
  session: Session | null;
  user: User | null;
  /** Durable Object name for useAgent + cookie HTTP. */
  instanceName: string;
  accessToken: string | null;
  /** Send email with magic link + OTP (template: docs/AUTH_EMAIL_TEMPLATE.html). */
  signInWithEmail: (email: string) => Promise<void>;
  /** Complete email sign-in with the one-time code from the mail body. */
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function applyInstanceForUser(user: User | null): string {
  if (user?.id) {
    return bindClientInstanceName(user.id);
  }
  return bindClientInstanceName(getOrCreateGuestInstanceName());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [configured, setConfigured] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [instanceName, setInstanceName] = useState(() =>
    getOrCreateGuestInstanceName(),
  );

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const supabase = await getSupabaseBrowserClient();
      if (cancelled) return;

      if (!supabase) {
        setConfigured(false);
        setInstanceName(applyInstanceForUser(null));
        setStatus("ready");
        return;
      }

      setConfigured(true);

      // Magic-link / OAuth PKCE return: ?code=… → session (ConfirmationURL path).
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            window.history.replaceState(
              {},
              "",
              `${url.pathname}${url.search}${url.hash}`,
            );
          }
        }
      } catch {
        /* fall through to getSession */
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setInstanceName(applyInstanceForUser(data.session?.user ?? null));
      setStatus("ready");

      const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
        setSession(next);
        setInstanceName(applyInstanceForUser(next?.user ?? null));
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const supabase = await getSupabaseBrowserClient();
    if (!supabase) throw new Error("Auth is not configured");
    const trimmed = email.trim();
    if (!trimmed) throw new Error("Email required");
    // Template must use {{ .ConfirmationURL }} so this redirect is honored.
    // {{ .Token }} enables verifyEmailOtp without clicking the link.
    // See docs/AUTH_EMAIL_TEMPLATE.html
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
  }, []);

  const verifyEmailOtp = useCallback(async (email: string, token: string) => {
    const supabase = await getSupabaseBrowserClient();
    if (!supabase) throw new Error("Auth is not configured");
    const trimmedEmail = email.trim();
    const trimmedToken = token.trim().replace(/\s+/g, "");
    if (!trimmedEmail) throw new Error("Email required");
    if (!trimmedToken) throw new Error("Code required");
    const { data, error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: trimmedToken,
      type: "email",
    });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      setInstanceName(applyInstanceForUser(data.session.user));
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const supabase = await getSupabaseBrowserClient();
    if (!supabase) throw new Error("Auth is not configured");
    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    setSession(null);
    setInstanceName(applyInstanceForUser(null));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      configured,
      session,
      user: session?.user ?? null,
      instanceName,
      accessToken: session?.access_token ?? null,
      signInWithEmail,
      verifyEmailOtp,
      signInWithGoogle,
      signOut,
    }),
    [
      status,
      configured,
      session,
      instanceName,
      signInWithEmail,
      verifyEmailOtp,
      signInWithGoogle,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

/** Optional for surfaces that may render outside the provider. */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
