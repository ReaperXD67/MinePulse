import "dotenv/config";
import nodemailer from "nodemailer";

const smtpUrl = process.env.SMTP_URL?.trim();
const sender = process.env.EMAIL_FROM?.trim();
const recipient = process.argv[2]?.trim();

if (!smtpUrl) throw new Error("SMTP_URL is required");
if (!sender) throw new Error("EMAIL_FROM is required");

let parsedUrl: URL;
try {
  parsedUrl = new URL(smtpUrl);
} catch {
  throw new Error("SMTP_URL must be a valid URL");
}

if (!["smtp:", "smtps:"].includes(parsedUrl.protocol)) {
  throw new Error("SMTP_URL must use smtp:// or smtps://");
}
if (!parsedUrl.username || !parsedUrl.password) {
  throw new Error("SMTP_URL must include authenticated provider credentials");
}
if (recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  throw new Error("Optional recipient must be a valid email address");
}

const mailer = nodemailer.createTransport(smtpUrl);

try {
  await mailer.verify();
  console.log(`SMTP connection and authentication succeeded for ${parsedUrl.hostname}.`);

  if (recipient) {
    const info = await mailer.sendMail({
      from: sender,
      to: recipient,
      subject: "KarixMC SMTP delivery check",
      text: "KarixMC SMTP is configured correctly. Verification and password-reset emails can now be delivered.",
      html: "<p><strong>KarixMC SMTP is configured correctly.</strong></p><p>Verification and password-reset emails can now be delivered.</p>"
    });
    console.log(`Test email accepted by the provider for ${recipient} (message ${info.messageId}).`);
  } else {
    console.log("Authentication only was checked. Pass a recipient to send one test email: npm run email:check -- you@example.com");
  }
} finally {
  mailer.close();
}
