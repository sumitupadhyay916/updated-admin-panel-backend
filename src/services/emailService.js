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

async function sendActivationEmail(to, token, userName, role = 'seller') {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const activationLink = `${frontendUrl}/activate-seller?token=${token}`;

  const isSeller = role === 'seller';
  const roleName = isSeller ? 'seller' : 'administrator';
  const subject = isSeller ? 'Activate Your Seller Account' : 'Activate Your Admin Account';

  const mailOptions = {
    from: `"Admin Panel" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: `Hello ${userName},\n\nYou have been invited to join as an ${roleName}. Please click the link below to set your password and activate your account:\n\n${activationLink}\n\nThis link will expire in 24 hours.`,
    html: `
      <h2>Welcome ${userName}!</h2>
      <p>You have been invited to join as an ${roleName}.</p>
      <p>Please click the button below to set your password and activate your account:</p>
      <a href="${activationLink}" style="display:inline-block;padding:10px 20px;background-color:#f97316;color:#ffffff;text-decoration:none;border-radius:5px;">Change Password</a>
      <p>This link will expire in 24 hours.</p>
    `,
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
  const mailOptions = {
    from: `"Admin Panel" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Password Reset OTP',
    text: `Hello ${userName},\n\nYour OTP for password reset is: ${otp}\n\nThis OTP will expire in 15 minutes.`,
    html: `
      <h2>Hello ${userName},</h2>
      <p>Your OTP for password reset is: <strong>${otp}</strong></p>
      <p>This OTP will expire in 15 minutes.</p>
    `,
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
