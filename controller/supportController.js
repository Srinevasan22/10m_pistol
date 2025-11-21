import nodemailer from "nodemailer";

/**
 * Reusable Nodemailer transporter.
 * Uses SMTP settings from environment variables.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * POST /pistol/support/contact
 * Body: { firstName, lastName, email, userId, subject, message }
 */
export const sendSupportEmail = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      userId,
      subject,
      message,
    } = req.body;

    // Basic validation (keep it simple for now)
    if (!email || !message) {
      return res.status(400).json({
        message: "Email and message are required.",
      });
    }

    const supportEmail = process.env.SUPPORT_EMAIL || "info@aimsight.app";

    const mailSubject = subject && subject.trim().length > 0
      ? subject
      : "AimSight Support Request";

    const mailText = `
A new support request has been submitted from the AimSight app.

User details:
- First name: ${firstName || "Not provided"}
- Last name: ${lastName || "Not provided"}
- Email: ${email}
- User ID: ${userId || "Not provided"}

Message:
${message}
`.trim();

    const mailOptions = {
      from: `"AimSight App" <${supportEmail}>`,
      to: supportEmail,
      replyTo: email, // so you can reply directly to the user
      subject: mailSubject,
      text: mailText,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      message: "Support request sent successfully.",
    });
  } catch (error) {
    console.error("Error sending support email:", error);
    return res.status(500).json({
      message: "Failed to send support request.",
      error: error.message,
    });
  }
};
