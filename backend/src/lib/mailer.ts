import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logComponent } from "./logger.js";

const logger = logComponent("smtp");

const smtpPass =
  env.SMTP_PASS?.trim().replace(/^["']+|["']+$/g, "").replace(/\s+/g, "") || undefined;

const transporter =
  env.SMTP_HOST && env.SMTP_USER && smtpPass
    ? nodemailer.createTransport(
        env.SMTP_HOST === "smtp.gmail.com"
          ? { service: "gmail", auth: { user: env.SMTP_USER, pass: smtpPass } }
          : {
              host: env.SMTP_HOST,
              port: env.SMTP_PORT,
              secure: env.SMTP_PORT === 465,
              requireTLS: env.SMTP_PORT === 587,
              auth: { user: env.SMTP_USER, pass: smtpPass },
            },
      )
    : null;

export async function verifySmtp() {
  if (!transporter) {
    logger.warn("smtp_not_configured");
    return false;
  }
  logger.info("smtp_verifying", { user: env.SMTP_USER, appPasswordLength: smtpPass?.length ?? 0 });
  try {
    await transporter.verify();
    logger.info("smtp_connected", { user: env.SMTP_USER });
    return true;
  } catch (err) {
    logger.error("smtp_connection_failed", { err });
    if (env.SMTP_HOST === "smtp.gmail.com") {
      logger.error("smtp_gmail_hint", { msg: "Use a 16-character App Password, not the account password" });
    }
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapEmail(opts: { companyName: string; preheader: string; title: string; body: string }) {
  const company = escapeHtml(opts.companyName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#e8eef4;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8eef4;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d7e0ea;">
          <tr>
            <td style="background:#0b0f14;padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:40px;height:40px;border-radius:10px;background:#22d3ee22;color:#67e8f9;font:700 18px/40px Arial,sans-serif;text-align:center;">
                    ${company.slice(0, 1).toUpperCase()}
                  </td>
                  <td style="padding-left:12px;">
                    <div style="font:700 18px/1.2 Arial,sans-serif;color:#f8fafc;letter-spacing:0.02em;">${company}</div>
                    <div style="margin-top:4px;font:11px/1 Arial,sans-serif;color:#67e8f9;letter-spacing:0.18em;text-transform:uppercase;">DevOps Portal</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${opts.body}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="height:1px;background:#e5e7eb;margin-bottom:16px;"></div>
              <p style="margin:0;font:12px/1.6 Arial,sans-serif;color:#94a3b8;">
                This message was sent by ${company}. If you were not expecting it, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function infoRow(label: string, valueHtml: string) {
  return `<tr>
    <td style="padding:12px 16px;width:110px;font:12px/1.4 Arial,sans-serif;color:#64748b;vertical-align:top;">${label}</td>
    <td style="padding:12px 16px;font:14px/1.5 Arial,sans-serif;color:#0f172a;word-break:break-all;">${valueHtml}</td>
  </tr>`;
}

export async function sendOtpEmail(email: string, code: string) {
  const minutes = Math.floor(env.OTP_EXPIRY_SECONDS / 60);
  const html = wrapEmail({
    companyName: "CloudEasy",
    preheader: `Your sign-in code is ${code}. It expires in ${minutes} minutes.`,
    title: "Your sign-in code",
    body: `
      <p style="margin:0 0 8px;font:13px/1.4 Arial,sans-serif;color:#0e7490;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Sign-in code</p>
      <h1 style="margin:0 0 12px;font:700 24px/1.3 Arial,sans-serif;color:#0b0f14;">Verify it’s you</h1>
      <p style="margin:0 0 24px;font:15px/1.6 Arial,sans-serif;color:#475569;">Use this one-time code to finish signing in. Do not share it with anyone.</p>
      <div style="background:#0b0f14;border-radius:12px;padding:22px 16px;text-align:center;margin-bottom:20px;">
        <div style="font:700 36px/1 'Courier New',monospace;letter-spacing:10px;color:#67e8f9;">${escapeHtml(code)}</div>
      </div>
      <p style="margin:0;font:13px/1.6 Arial,sans-serif;color:#64748b;">This code expires in ${minutes} minutes. If you did not try to sign in, ignore this email.</p>
    `,
  });

  if (!transporter) {
    logger.warn("smtp_skipped", { reason: "not_configured", kind: "otp" });
    if (env.OTP_DEV_ECHO) logger.info("otp_dev_echo", { to: email, code });
    return;
  }

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: "Your CloudEasy sign-in code",
      html,
      text: `Your CloudEasy sign-in code is ${code}. It expires in ${minutes} minutes.`,
    });
    logger.info("otp_mailed", { to: email });
  } catch (err) {
    logger.error("smtp_send_failed", { kind: "otp", err });
    if (env.NODE_ENV === "production") throw err;
    logger.warn("otp_dev_fallback", { to: email, note: "SMTP failed; check server logs / OTP_DEV_ECHO if enabled" });
  }
}

export async function sendInviteEmail(opts: {
  to: string;
  companyName: string;
  loginUrl: string;
  password: string;
  inviter: string;
}) {
  const company = opts.companyName.trim() || "CloudEasy";
  const loginUrl = escapeHtml(opts.loginUrl);
  const html = wrapEmail({
    companyName: company,
    preheader: `${opts.inviter} invited you to ${company}. Your login details are inside.`,
    title: `Invitation to ${company}`,
    body: `
      <p style="margin:0 0 8px;font:13px/1.4 Arial,sans-serif;color:#0e7490;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Team invite</p>
      <h1 style="margin:0 0 12px;font:700 24px/1.3 Arial,sans-serif;color:#0b0f14;">You’re invited</h1>
      <p style="margin:0 0 24px;font:15px/1.6 Arial,sans-serif;color:#475569;">
        <strong style="color:#0b0f14;">${escapeHtml(opts.inviter)}</strong> added you to <strong style="color:#0b0f14;">${escapeHtml(company)}</strong>.
        Use the details below, then verify the one-time code we send to this inbox.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;margin-bottom:24px;">
        ${infoRow("Portal URL", `<a href="${loginUrl}" style="color:#0e7490;font-weight:600;text-decoration:none;">${loginUrl}</a>`)}
        <tr><td colspan="2" style="border-top:1px solid #e2e8f0;font-size:0;line-height:0;">&nbsp;</td></tr>
        ${infoRow("Email", `<span style="font-weight:600;">${escapeHtml(opts.to)}</span>`)}
        <tr><td colspan="2" style="border-top:1px solid #e2e8f0;font-size:0;line-height:0;">&nbsp;</td></tr>
        ${infoRow("Password", `<span style="display:inline-block;background:#0b0f14;color:#67e8f9;font:700 15px/1 'Courier New',monospace;padding:8px 12px;border-radius:8px;letter-spacing:0.04em;">${escapeHtml(opts.password)}</span>`)}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="border-radius:10px;background:#0891b2;">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;font:700 14px/1 Arial,sans-serif;color:#ffffff;text-decoration:none;">Open portal</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 10px;font:13px/1.4 Arial,sans-serif;color:#0b0f14;font-weight:700;">How to sign in</p>
      <ol style="margin:0;padding-left:18px;font:14px/1.7 Arial,sans-serif;color:#475569;">
        <li>Open the portal from the button or URL above.</li>
        <li>Enter your email and the password from this email.</li>
        <li>Verify the OTP that arrives in this inbox.</li>
      </ol>
    `,
  });

  if (!transporter) {
    logger.warn("smtp_skipped", { reason: "not_configured", kind: "invite", to: opts.to, inviter: opts.inviter });
    throw new Error("SMTP is not configured");
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: opts.to,
    subject: `You’re invited to ${company}`,
    html,
    text: [
      `${opts.inviter} invited you to ${company}.`,
      `Login URL: ${opts.loginUrl}`,
      `Email: ${opts.to}`,
      `Password: ${opts.password}`,
      "Sign in with email and password, then verify the OTP sent to this inbox.",
    ].join("\n"),
  });
  logger.info("invite_mailed", { to: opts.to, inviter: opts.inviter });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const html = wrapEmail({
    companyName: "CloudEasy",
    preheader: `Reset your password using the link below. The link expires in 60 minutes.`,
    title: "Reset your CloudEasy password",
    body: `
      <p style="margin:0 0 8px;font:13px/1.4 Arial,sans-serif;color:#0e7490;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Password reset</p>
      <h1 style="margin:0 0 12px;font:700 24px/1.3 Arial,sans-serif;color:#0b0f14;">Reset your password</h1>
      <p style="margin:0 0 16px;font:15px/1.6 Arial,sans-serif;color:#475569;">Click the button below to reset your CloudEasy password. This link expires in 60 minutes.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="border-radius:10px;background:#0891b2;">
            <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:14px 28px;font:700 14px/1 Arial,sans-serif;color:#ffffff;text-decoration:none;">Reset password</a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font:13px/1.6 Arial,sans-serif;color:#64748b;">If you did not request a password reset, you can safely ignore this email.</p>
    `,
  });

  if (!transporter) {
    logger.warn("smtp_skipped", { reason: "not_configured", kind: "password_reset" });
    return;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: "Reset your CloudEasy password",
    html,
    text: `Open the following link to reset your password: ${resetUrl}`,
  });
  logger.info("password_reset_mailed", { to: email });
}
