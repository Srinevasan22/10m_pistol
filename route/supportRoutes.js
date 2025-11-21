import express from "express";
import { sendSupportEmail } from "../controller/supportController.js";

const router = express.Router();

/**
 * @desc    Send support contact email
 * @route   POST /pistol/support/contact
 * @access  Public (for now – can be restricted later)
 */
router.post("/contact", sendSupportEmail);

export default router;
