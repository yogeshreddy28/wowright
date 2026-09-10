declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    AI_PROVIDER?: string;
    AI_MODEL?: string;
    OPENAI_API_KEY?: string;
    AI_SETTINGS_ENCRYPTION_KEY?: string;
    DELIVERY_OTP_SECRET?: string;
    SITE_URL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  }
}
