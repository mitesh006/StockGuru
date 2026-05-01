const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const sendVerificationEmail = async (email, name, verificationLink) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Verify your StockGuru account",
    html: `
      <h2>Welcome to StockGuru, ${name}!</h2>
      <p>Please verify your email address to activate your account.</p>
      <a href="${verificationLink}" 
         style="display:inline-block;padding:10px 16px;background:#00ff88;color:#000;text-decoration:none;border-radius:6px;">
         Verify Email
      </a>
      <p>This link will expire in 1 hour.</p>
    `
  });
};

const sendWelcomeEmail = async (email, name) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Welcome to StockGuru!",
    html: `
      <h2>Hi ${name}, welcome to StockGuru</h2>
      <p>Your email has been verified successfully.</p>
      <p>You can now use watchlist, stock insights, and prediction features.</p>
    `
  });
};

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail
};