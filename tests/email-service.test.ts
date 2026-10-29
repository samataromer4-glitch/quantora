import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { mock, test } from "node:test";
import {
  sendPasswordRecoveryEmail,
  sendTeacherInvitationEmail
} from "../server/emailService.ts";

test("email sends reject invalid senders and never report SMTP failures as success", async (context) => {
  const originalEnvironment = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
    SMTP_FROM: process.env.SMTP_FROM
  };
  context.after(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.SMTP_HOST = "smtp.example.test";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "";
  process.env.EMAIL_USER = "smtp-account@example.test";
  process.env.SMTP_PASS = "";
  process.env.EMAIL_PASS = "test-password";
  process.env.SMTP_FROM = "not-an-email";

  let transportCreations = 0;
  const sendMailCalls: Array<Record<string, unknown>> = [];
  mock.method(nodemailer, "createTransport", () => {
    transportCreations += 1;
    return {
      sendMail: async (message: Record<string, unknown>) => {
        sendMailCalls.push(message);
        throw new Error("mock SMTP failure");
      }
    };
  });

  const invalidSenderResult = await sendPasswordRecoveryEmail(
    "recipient@example.test",
    "https://app.example.test/reset-password#token=mock-token"
  );
  assert.equal(invalidSenderResult, false);
  assert.equal(transportCreations, 0);

  process.env.SMTP_FROM = "verified-sender@example.test";
  assert.equal(await sendPasswordRecoveryEmail(
    "recipient@example.test",
    "https://app.example.test/reset-password#token=mock-token"
  ), false);
  assert.equal(sendMailCalls[0].from, '"DUGSI PRO" <verified-sender@example.test>');

  delete process.env.SMTP_FROM;
  const invitationResult = await sendTeacherInvitationEmail({
    toEmail: "teacher@example.test",
    teacherName: "Macallin",
    schoolName: "Dugsi",
    activationLink: "https://app.example.test/activate-teacher?token=mock-token"
  });
  assert.equal(invitationResult.success, false);
  assert.equal(sendMailCalls[1].from, '"Dugsi" <smtp-account@example.test>');
});
