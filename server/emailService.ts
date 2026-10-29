import nodemailer, { type Transporter } from "nodemailer";

interface SendInvitationEmailParams {
  toEmail: string;
  teacherName: string;
  schoolName: string;
  activationLink: string;
  expiresInDays?: number;
}

let cachedTransporter: Transporter | null = null;

const EMAIL_ADDRESS_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i;

function getConfiguredSenderAddress(): string | null {
  const sender = process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    process.env.EMAIL_USER?.trim() ||
    "";
  return EMAIL_ADDRESS_PATTERN.test(sender) ? sender : null;
}

function getEmailTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (!user || !pass) {
    return null;
  }

  try {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: true
      }
    });
    return cachedTransporter;
  } catch {
    console.error("Failed to initialize email transporter.");
    return null;
  }
}

export async function sendTeacherInvitationEmail({
  toEmail,
  teacherName,
  schoolName,
  activationLink,
  expiresInDays = 7
}: SendInvitationEmailParams): Promise<{ success: boolean; error?: string }> {
  const fromEmail = getConfiguredSenderAddress();
  if (!fromEmail) {
    console.error("Invitation email was not sent because no valid sender address is configured.");
    return { success: false, error: "Email sender is not configured" };
  }

  const cleanEmail = toEmail.trim().toLowerCase();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Casuumaad: Ku soo dhowow ${schoolName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 28px 24px; text-align: center; border-bottom: 4px solid #7c3aed; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { color: #94a3b8; margin: 6px 0 0; font-size: 13px; }
    .content { padding: 32px 28px; line-height: 1.6; }
    .greeting { font-size: 17px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
    .message { font-size: 14px; color: #475569; margin-bottom: 24px; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #7c3aed; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(124, 58, 237, 0.25); }
    .expiry-note { font-size: 12px; color: #64748b; background-color: #f1f5f9; padding: 12px; border-radius: 6px; border-left: 3px solid #7c3aed; margin-bottom: 20px; }
    .link-alt { font-size: 12px; color: #64748b; word-break: break-all; margin-top: 24px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${schoolName}</h1>
      <p>Nidaamka Maamulka Dugsiga – DUGSI PRO 2026</p>
    </div>
    <div class="content">
      <div class="greeting">Ku soo dhowow, Macallin ${teacherName}!</div>
      <p class="message">
        Maamulka dugsiga <strong>${schoolName}</strong> ayaa kugu soo daray nidaamka maamulka waxbarashada ee DUGSI PRO 2026 adigoo ah <strong>Macallin (Teacher)</strong>.
      </p>
      <p class="message">
        Si aad u gasho akoonkaaga, u aragto fasallada iyo maadooyinka laguu xilsaaray, uguna calaamadayso xaadirinta iyo dhibcaha ardaydaada, fadlan riix batoonka hoose si aad u samaysato furahaaga sirta ah (password):
      </p>
      
      <div class="btn-container">
        <a href="${activationLink}" class="btn" target="_blank">Dhaqaaji Akoonkaaga (Activate Account)</a>
      </div>

      <div class="expiry-note">
        ⏰ <strong>Ogeysiis Muhiim ah:</strong> Link-gan casuumaaddu wuxuu shaqeynayaa <strong>${expiresInDays} maalmood</strong> gudahood. Maamulka dugsigu ma oga mana geli karo password-kaaga, adiga ayaa toos u samaysanaya.
      </div>

      <div class="link-alt">
        Haddii batoonka kore uusan shaqeynin, fadlan ku koobi garee link-gan browser-kaaga:<br>
        <a href="${activationLink}" style="color: #7c3aed;">${activationLink}</a>
      </div>
    </div>
    <div class="footer">
      Farriintan waxaa si toos ah kuugu soo dirtay ${schoolName} iyada oo loo marayo DUGSI PRO 2026.<br>
      Fadlan ha ka jawaabin email-kan.
    </div>
  </div>
</body>
</html>
  `;

  const textContent = `
Ku soo dhowow ${schoolName}, Macallin ${teacherName}!

Maamulka dugsiga ayaa kugu soo daray nidaamka DUGSI PRO 2026 adigoo ah Macallin.
Fadlan guji link-gan si aad u dhaqaajiso akoonkaaga oo aad u samaysato password-kaaga:

${activationLink}

Link-gani wuxuu dhacayaa ${expiresInDays} maalmood gudahood.
  `.trim();

  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("SMTP is not configured; invitation email was not delivered.");
    return {
      success: false,
      error: "SMTP is not configured"
    };
  }

  try {
    await transporter.sendMail({
      from: `"${schoolName}" <${fromEmail}>`,
      to: cleanEmail,
      subject: `Casuumaad Macallin: Ku soo dhowow ${schoolName} (Dhaqaaji Akoonkaaga)`,
      text: textContent,
      html: htmlContent
    });

    console.log("[Email Service] Invitation email sent.");
    return { success: true };
  } catch {
    console.error("[Email Service Error] Invitation email delivery failed.");
    return { success: false, error: "Email sending failed" };
  }
}

export async function sendPasswordRecoveryEmail(
  toEmail: string,
  recoveryLink: string
): Promise<boolean> {
  const fromEmail = getConfiguredSenderAddress();
  if (!fromEmail) {
    console.error("Password recovery email was not sent because no valid sender address is configured.");
    return false;
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("Password recovery email was not sent because SMTP is not configured.");
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"DUGSI PRO" <${fromEmail}>`,
      to: toEmail.trim().toLowerCase(),
      subject: "Dib-u-deji eraygaaga sirta ah",
      text: [
        "Waxaan helnay codsi dib loogu dejinayo eraygaaga sirta ah ee DUGSI PRO.",
        "Adeegso link-gan 20 daqiiqo gudahood:",
        recoveryLink,
        "Haddii aadan codsan, iska indhatir farriintan."
      ].join("\n\n"),
      html: `<!doctype html><html lang="so"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial,sans-serif;background:#f8fafc;color:#172033;padding:24px"><main style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px"><h1 style="font-size:22px">Dib-u-deji eraygaaga sirta ah</h1><p>Waxaan helnay codsi dib loogu dejinayo eraygaaga sirta ah ee DUGSI PRO.</p><p><a href="${recoveryLink}" style="display:inline-block;background:#7c3aed;color:white;text-decoration:none;padding:12px 20px;border-radius:8px">Dib u deji erayga sirta ah</a></p><p>Link-gani wuxuu dhacayaa 20 daqiiqo gudahood, hal mar oo keliya ayaana la adeegsan karaa.</p><p>Haddii aadan codsan, iska indhatir farriintan; eraygaaga sirta ahi isma beddelayo.</p></main></body></html>`
    });
    return true;
  } catch {
    console.error("Password recovery email delivery failed.");
    return false;
  }
}
