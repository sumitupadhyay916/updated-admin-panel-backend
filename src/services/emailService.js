const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Outer shell: gray bg, centered innorade header, white card with inner HTML */
function innoradeEmailLayout(innerCardHtml) {
  const logoUrl = process.env.INNORADE_LOGO_URL;
  const logoSection = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="innorade" width="140" style="display:block;margin:0 auto 12px;border:0;max-width:140px;height:auto;" />`
    : `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 10px;">
        <tr>
          <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:700;color:#5b21b6;letter-spacing:-0.5px;line-height:1.2;">
            innorade
          </td>
        </tr>
      </table>
    `;

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7f9;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f7f9;padding:40px 16px 48px;">
    <tr>
      <td align="center">
        ${logoSection}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="padding:36px 32px 40px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827;">
              ${innerCardHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

async function sendActivationEmail(to, token, userName, role = 'seller') {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const activationLink = `${frontendUrl}/activate-seller?token=${encodeURIComponent(token)}`;

  const isSeller = role === 'seller';
  const roleName = isSeller ? 'seller' : 'administrator';
  const subject = isSeller ? 'Activate Your Seller Account' : 'Activate Your Admin Account';

  const safeName = escapeHtml(userName);

  const innerHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#111827;">Hello ${safeName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#111827;">
      You have been invited to join <strong style="font-weight:600;">innorade</strong> as an ${escapeHtml(roleName)}.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#111827;">
      Use the button below on the <strong style="font-weight:600;">activation</strong> page to set your password and complete your account setup.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:8px 0 28px;">
          <a href="${activationLink}" style="display:inline-block;padding:14px 32px;background-color:#f97316;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;font-family:Arial,Helvetica,sans-serif;">
            Activate account
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
      If you did not expect this invitation, you can ignore this email.
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      This link will expire in 24 hours.
    </p>
  `;

  const mailOptions = {
    from: `"innorade" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: `Hello ${userName},\n\nYou have been invited to join innorade as an ${roleName}. Open this link to set your password and activate your account:\n\n${activationLink}\n\nIf you did not expect this, you can ignore this email. This link expires in 24 hours.`,
    html: innoradeEmailLayout(innerHtml),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`${roleName} activation email sent:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Error sending ${roleName} activation email:`, error);
    throw error;
  }
}

async function sendPasswordResetOtpEmail(to, otp, userName) {
  const safeName = escapeHtml(userName);
  const otpStr = String(otp).replace(/\D/g, '');
  const otpDigitsHtml = otpStr
    .split('')
    .map(
      (d) =>
        `<span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;color:#111827;margin:0 8px;">${escapeHtml(d)}</span>`,
    )
    .join('');

  const innerHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#111827;">Hello ${safeName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#111827;">
      We received a request to reset your <strong style="font-weight:600;">innorade</strong> password.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#111827;">
      Use the 6-digit code below on the <strong style="font-weight:600;">Forgot Password</strong> page to choose a new password.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:12px 0 32px;">
          ${otpDigitsHtml}
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
      If you did not request this, you can ignore it.
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      This code will expire in 15 minutes.
    </p>
  `;

  const mailOptions = {
    from: `"innorade" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Reset your innorade password',
    text: `Hello ${userName},\n\nWe received a request to reset your innorade password.\n\nYour 6-digit code: ${otpStr}\n\nEnter this code on the Forgot Password page. This code expires in 15 minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: innoradeEmailLayout(innerHtml),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Password reset OTP email sent:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Error sending password reset OTP email:`, error);
    throw error;
  }
}

module.exports = {
  sendActivationEmail,
  sendPasswordResetOtpEmail,
};
