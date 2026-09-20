/**
 * Best-effort webmail inbox URL from an email address domain.
 * Returns null when the provider is unknown (no guessy mailto).
 *
 * Gmail: open a recent-mail search instead of Primary `#inbox`.
 * Auth mail often lands in Updates/Promotions (still Inbox-labeled)
 * and is easy to miss on the Primary tab.
 */
export function inboxUrlForEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return null;

  if (
    domain === "gmail.com" ||
    domain === "googlemail.com" ||
    domain.endsWith(".gmail.com")
  ) {
    // Shared Auth sender (Market Memory SMTP). Search surfaces the
    // message even when Gmail filed it under Updates / Promotions.
    const q = encodeURIComponent(
      "from:(mail.marketmemory.app OR hello@mail.marketmemory.app) newer_than:1d",
    );
    return `https://mail.google.com/mail/u/0/#search/${q}`;
  }
  if (
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com" ||
    domain === "msn.com" ||
    domain.endsWith(".outlook.com")
  ) {
    return "https://outlook.live.com/mail/0/";
  }
  if (domain === "yahoo.com" || domain.endsWith(".yahoo.com")) {
    return "https://mail.yahoo.com/";
  }
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return "https://www.icloud.com/mail";
  }
  if (domain === "naver.com") {
    return "https://mail.naver.com/";
  }
  if (domain === "daum.net" || domain === "hanmail.net") {
    return "https://mail.daum.net/";
  }
  if (domain === "kakao.com") {
    return "https://mail.kakao.com/";
  }
  if (domain === "proton.me" || domain === "protonmail.com") {
    return "https://mail.proton.me/u/0/inbox";
  }

  return null;
}
