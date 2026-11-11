import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import nodemailer from "nodemailer";

async function main() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  assert.equal(require("nodemailer/package.json").version, "10.1.4");
  assert.equal(typeof require("nodemailer").createTransport, "function");
  assert.equal(typeof (await import("nodemailer")).default.createTransport, "function");

  // Construct the existing URL-based API without verify(), sendMail() or a socket.
  const configured = nodemailer.createTransport("smtp://fixture-user:fixture-pass@smtp.example.invalid:2525");
  const options = configured.options as { host?: string; port?: number; auth?: { user?: string; pass?: string } };
  assert.equal(options.host, "smtp.example.invalid");
  assert.equal(options.port, 2525);
  assert.equal(options.auth?.user, "fixture-user");
  assert.equal(options.auth?.pass, "fixture-pass");
  configured.close();

  const message = {
    from: "KarixMC Żółć <no-reply@example.invalid>",
    to: "person+tag@example.invalid",
    subject: "Verify your KarixMC email",
    text: "Hello Zoë,\nContinue: https://example.invalid/verify-email?token=fixture\nBcc: this is body text, not a header.",
    html: '<p>Hello Zoë,</p><p><a href="https://example.invalid/verify-email?token=fixture">Continue securely</a></p>'
  };
  const expectedEnvelope = { from: "no-reply@example.invalid", to: ["person+tag@example.invalid"] };
  const jsonTransport = nodemailer.createTransport({ jsonTransport: true });
  const jsonResult = await jsonTransport.sendMail(message);
  assert.deepEqual(jsonResult.envelope, expectedEnvelope);
  const json = JSON.parse(String(jsonResult.message));
  assert.equal(json.subject, message.subject);
  assert.equal(json.text, message.text);
  assert.equal(json.html, message.html);
  jsonTransport.close();

  const streamTransport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const streamResult = await streamTransport.sendMail(message);
  assert.deepEqual(streamResult.envelope, expectedEnvelope);
  assert(Buffer.isBuffer(streamResult.message), "Buffered stream transport must produce MIME bytes");
  const mime = streamResult.message.toString("utf8");
  const headers = mime.split(/\r?\n\r?\n/, 1)[0];
  assert.match(headers, /^From: =\?UTF-8\?[QB]\?/im);
  assert.match(headers, /<no-reply@example\.invalid>/);
  assert.match(headers, /^To: person\+tag@example\.invalid\r?$/m);
  assert.match(headers, /^MIME-Version: 1\.0\r?$/m);
  assert.match(headers, /^Content-Type: multipart\/alternative;/m);
  assert(!/^Bcc:/im.test(headers), "Body lines must not become mail headers");
  assert.match(mime, /Content-Type: text\/plain; charset=utf-8/i);
  assert.match(mime, /Content-Type: text\/html; charset=utf-8/i);
  const finiteHeaderCase = await streamTransport.sendMail({
    ...message, subject: "Account notice\r\nBcc: not-a-recipient@example.invalid"
  });
  assert.deepEqual(finiteHeaderCase.envelope, expectedEnvelope);
  assert(!/^Bcc:/im.test(String(finiteHeaderCase.message).split(/\r?\n\r?\n/, 1)[0]));
  streamTransport.close();
  console.log("Nodemailer 10.1.4 provider-free checks passed: import/require, URL parsing, exact single-recipient envelope, Unicode names, JSON/stream MIME and finite header containment. No SMTP connection or delivery occurred.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
