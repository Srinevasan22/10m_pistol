import nodemailer from "nodemailer";
import User from "../model/user.js";

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

    // Trim values to avoid "   " being accepted
    const trimmedEmail = email ? email.toString().trim() : "";
    const trimmedMessage = message ? message.toString().trim() : "";

    // If no email is provided in the request body, try to pull it from the user record
    let contactEmail = trimmedEmail;

    if (!contactEmail && userId) {
      const user = await User.findById(userId).lean();
      if (user?.email) {
        contactEmail = user.email.trim();
      }
    }

    const errors = [];

    // Email is required so support can reply
    if (!contactEmail) {
      errors.push(
        "An email address is required so we can reply to you. Please enter your email.",
      );
    }

    // Message is also required
    if (!trimmedMessage) {
      errors.push(
        "A message is required. Please describe the issue you are experiencing.",
      );
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: "Support request could not be sent.",
        errors, // array of detailed messages for the app / logs
      });
    }

    const supportEmail = process.env.SUPPORT_EMAIL || "info@aimsight.app";

    const mailSubject = subject && subject.trim().length > 0
      ? subject.trim()
      : "AimSight Support Request";

    const mailText = `
A new support request has been submitted from the AimSight app.

User details:
- First name: ${firstName || "Not provided"}
- Last name: ${lastName || "Not provided"}
- Email: ${contactEmail || "Not provided"}
- User ID: ${userId || "Not provided"}

Message:
${trimmedMessage}
`.trim();

    const mailOptions = {
      from: `"AimSight App" <${supportEmail}>`,
      to: supportEmail,
      replyTo: contactEmail || undefined, // so you can reply directly to the user
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
