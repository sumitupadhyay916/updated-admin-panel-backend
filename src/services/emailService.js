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

async function sendActivationEmail(to, token, sellerName) {
  // Use a fallback frontend URL or from env variables
  const frontendUrl = process.env.FRONTEND_URL || 'https://innoradeapi.hireacoder.in/api/';
  const activationLink = `${frontendUrl}/activate-seller?token=${token}`;

  const mailOptions = {
    from: `"Admin Panel" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Activate Your Seller Account',
    text: `Hello ${sellerName},\n\nYou have been invited to join as a seller. Please click the link below to set your password and activate your account:\n\n${activationLink}\n\nThis link will expire in 24 hours.`,
    html: `
      <h2>Welcome ${sellerName}!</h2>
      <p>You have been invited to join as a seller.</p>
      <p>Please click the button below to set your password and activate your account:</p>
      <a href="${activationLink}" style="display:inline-block;padding:10px 20px;background-color:#f97316;color:#ffffff;text-decoration:none;border-radius:5px;">Change Password</a>
      <p>This link will expire in 24 hours.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Activation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending activation email:', error);
    throw error;
  }
}

module.exports = {
  sendActivationEmail,
};
