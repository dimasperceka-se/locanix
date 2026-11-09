import nodemailer from "nodemailer";

export function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false, // port 587 uses STARTTLS
    auth: {
      user: process.env.SMTP_LOGIN || "",
      pass: process.env.SMTP_KEY || "",
    },
  });
}

const FROM = () => process.env.SMTP_FROM || "Locanix <no-reply@locanix.id>";

export async function sendVerificationEmail(
  to: string,
  name: string,
  link: string,
): Promise<void> {
  await getTransport().sendMail({
    from: FROM(),
    to,
    subject: "Confirm your Locanix account",
    text: `Hi ${name},

Welcome to Locanix! Please confirm your account by opening this link:

${link}

If you didn't create an account, you can safely ignore this email.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1b3a6b">
        <h1 style="color:#1b3a6b;font-size:22px">You're almost there, ${escapeHtml(name)} 🌱</h1>
        <p style="color:#475569;line-height:1.6">
          Welcome to Locanix. Confirm your email to activate your account and start
          running plot analyses.
        </p>
        <p style="margin:28px 0">
          <a href="${link}"
             style="background:#1b3a6b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">
            Confirm my account
          </a>
        </p>
        <p style="color:#94a3b8;font-size:13px;line-height:1.6">
          Or paste this link into your browser:<br>
          <span style="color:#34d685">${link}</span>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0">
        <p style="color:#94a3b8;font-size:12px">
          If you didn't create an Locanix account, you can ignore this email.
        </p>
      </div>`,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  link: string,
): Promise<void> {
  await getTransport().sendMail({
    from: FROM(),
    to,
    subject: "Reset your Locanix password",
    text: `Hi ${name},

We received a request to reset your Locanix password. Open this link to choose a new one (it expires in 1 hour):

${link}

If you didn't ask for this, you can ignore this email — your password stays the same.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1b3a6b">
        <h1 style="color:#1b3a6b;font-size:22px">Reset your password</h1>
        <p style="color:#475569;line-height:1.6">
          Hi ${escapeHtml(name)}, we received a request to reset your Locanix password.
          This link expires in 1 hour.
        </p>
        <p style="margin:28px 0">
          <a href="${link}"
             style="background:#1b3a6b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">
            Choose a new password
          </a>
        </p>
        <p style="color:#94a3b8;font-size:13px;line-height:1.6">
          Or paste this link into your browser:<br>
          <span style="color:#34d685">${link}</span>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0">
        <p style="color:#94a3b8;font-size:12px">
          If you didn't ask for this, you can ignore this email — your password stays the same.
        </p>
      </div>`,
  });
}

export type ContactMessage = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
};

/** Deliver a contact-form submission to the Locanix inbox. */
export async function sendContactEmail(data: ContactMessage): Promise<void> {
  // Comma-separated recipients; overridable via CONTACT_TO.
  const to = process.env.CONTACT_TO || "info@sustainit.id, dimas.perceka@sustainit.id";
  const name = `${data.firstName} ${data.lastName}`.trim();
  await getTransport().sendMail({
    from: FROM(),
    to,
    replyTo: data.email,
    subject: `New contact message from ${name || data.email}`,
    text: `Name: ${name}
Email: ${data.email}
Phone: ${data.phone || "-"}

Message:
${data.message || "-"}`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1b3a6b">
        <h2 style="color:#1b3a6b;font-size:20px">New contact message</h2>
        <p style="color:#475569;line-height:1.7">
          <b>Name:</b> ${escapeHtml(name)}<br>
          <b>Email:</b> ${escapeHtml(data.email)}<br>
          <b>Phone:</b> ${escapeHtml(data.phone || "-")}
        </p>
        <p style="color:#1b3a6b;font-weight:600;margin-bottom:6px">Message</p>
        <p style="color:#475569;line-height:1.7;white-space:pre-wrap">${escapeHtml(data.message || "-")}</p>
      </div>`,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
