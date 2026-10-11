
const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");

const router = express.Router();

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

// Validate a Base64 PNG/JPG signature image.
function decodeSignatureImage(image) {
  if (typeof image !== "string") {
    return null;
  }

  const match = image.match(
    /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/
  );

  if (!match) {
    return null;
  }

  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");

  if (
    buffer.length === 0 ||
    buffer.length > MAX_SIGNATURE_BYTES ||
    buffer.toString("base64") !== base64
  ) {
    return null;
  }

  const isPng =
    match[1] === "png" &&
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  const isJpeg =
    match[1] === "jpeg" &&
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  return isPng || isJpeg ? image : null;
}

// Verify the login token and load the employee.
async function authenticateEmployee(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Please log in to continue.",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await pool.execute(
      `SELECT id, name, employee_id, email, role, department
       FROM users
       WHERE id = ?`,
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: "Employee account not found.",
      });
    }

    if (users[0].role !== "EMPLOYEE") {
      return res.status(403).json({
        message: "Access denied. Employee access is required.",
      });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        message: "Your session is invalid or expired. Please log in again.",
      });
    }

    console.error("Authentication error:", error.message);

    return res.status(500).json({
      message: "Unable to verify employee.",
    });
  }
}

// Create an expense voucher as a DRAFT.
router.post("/", authenticateEmployee, async (req, res) => {
  try {
    const {
      expense_date,
      expense_title,
      expense_category,
      expense_description,
      amount,
    } = req.body;

    if (
      !expense_date ||
      typeof expense_title !== "string" ||
      !expense_title.trim() ||
      typeof expense_category !== "string" ||
      !expense_category.trim() ||
      amount === undefined ||
      amount === null ||
      amount === ""
    ) {
      return res.status(400).json({
        message: "Expense date, title, category and amount are required.",
      });
    }

    if (
      typeof expense_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(expense_date) ||
      !Number.isFinite(Date.parse(`${expense_date}T00:00:00Z`)) ||
      new Date(`${expense_date}T00:00:00Z`)
        .toISOString()
        .slice(0, 10) !== expense_date
    ) {
      return res.status(400).json({
        message: "Please provide a valid expense date in YYYY-MM-DD format.",
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        message: "Amount must be greater than zero.",
      });
    }

    if (numericAmount > 9999999999.99) {
      return res.status(400).json({
        message: "Amount exceeds the permitted limit.",
      });
    }

    const voucherNumber =
      `EV-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const [result] = await pool.execute(
      `INSERT INTO vouchers (
        voucher_number,
        employee_id,
        voucher_date,
        expense_date,
        department,
        expense_title,
        expense_category,
        expense_description,
        amount,
        status
      ) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, 'DRAFT')`,
      [
        voucherNumber,
        req.user.id,
        expense_date,
        req.user.department || "",
        expense_title.trim(),
        expense_category.trim(),
        typeof expense_description === "string"
          ? expense_description.trim() || null
          : null,
        numericAmount.toFixed(2),
      ]
    );

    return res.status(201).json({
      message: "Expense voucher created successfully.",
      voucher: {
        id: result.insertId,
        voucher_number: voucherNumber,
        expense_date,
        expense_title: expense_title.trim(),
        expense_category: expense_category.trim(),
        expense_description:
          typeof expense_description === "string"
            ? expense_description.trim() || null
            : null,
        amount: numericAmount.toFixed(2),
        status: "DRAFT",
      },
    });
  } catch (error) {
    console.error("Create voucher error:", error.message);

    return res.status(500).json({
      message: "Unable to create expense voucher.",
    });
  }
});

// Save or replace the employee's signature image on their own DRAFT voucher.
router.patch("/:id/signature", authenticateEmployee, async (req, res) => {
  try {
    const voucherId = Number(req.params.id);

    if (!Number.isSafeInteger(voucherId) || voucherId <= 0) {
      return res.status(400).json({
        message: "Please provide a valid voucher ID.",
      });
    }

    const signature = decodeSignatureImage(req.body?.employee_signature);

    if (!signature) {
      return res.status(400).json({
        message: "Upload a valid PNG or JPG signature image up to 2 MB.",
      });
    }

    const [result] = await pool.execute(
      `UPDATE vouchers
       SET employee_signature = ?
       WHERE id = ?
         AND employee_id = ?
         AND status = 'DRAFT'`,
      [signature, voucherId, req.user.id]
    );

    if (result.affectedRows === 0) {
      const [rows] = await pool.execute(
        `SELECT id, status
         FROM vouchers
         WHERE id = ? AND employee_id = ?`,
        [voucherId, req.user.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          message: "Voucher not found.",
        });
      }

      return res.status(409).json({
        message: "Only your DRAFT vouchers can have their signature changed.",
        currentStatus: rows[0].status,
      });
    }

    return res.status(200).json({
      message: "Employee signature image saved successfully.",
      voucher: {
        id: voucherId,
        employee_signature: signature,
      },
    });
  } catch (error) {
    console.error("Save employee signature error:", error.message);

    return res.status(500).json({
      message: "Unable to save employee signature image.",
    });
  }
});

// Submit a DRAFT voucher for Director approval.
// A saved employee signature is mandatory.
router.patch("/:id/submit", authenticateEmployee, async (req, res) => {
  try {
    const voucherId = Number(req.params.id);

    if (!Number.isSafeInteger(voucherId) || voucherId <= 0) {
      return res.status(400).json({
        message: "Please provide a valid voucher ID.",
      });
    }

    const [vouchers] = await pool.execute(
      `SELECT id, voucher_number, status, employee_signature
       FROM vouchers
       WHERE id = ? AND employee_id = ?`,
      [voucherId, req.user.id]
    );

    if (vouchers.length === 0) {
      return res.status(404).json({
        message: "Voucher not found.",
      });
    }

    const voucher = vouchers[0];

    if (voucher.status !== "DRAFT") {
      return res.status(409).json({
        message: "Only DRAFT vouchers can be submitted for approval.",
        currentStatus: voucher.status,
      });
    }

    if (!voucher.employee_signature) {
      return res.status(400).json({
        message: "Upload and save your signature before submitting the voucher.",
      });
    }

    const [result] = await pool.execute(
      `UPDATE vouchers
       SET status = 'PENDING_APPROVAL'
       WHERE id = ?
         AND employee_id = ?
         AND status = 'DRAFT'
         AND employee_signature IS NOT NULL`,
      [voucherId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message: "Voucher status changed. Refresh and try again.",
      });
    }

    return res.status(200).json({
      message: "Voucher submitted for approval successfully.",
      voucher: {
        id: voucher.id,
        voucher_number: voucher.voucher_number,
        status: "PENDING_APPROVAL",
      },
    });
  } catch (error) {
    console.error("Submit voucher error:", error.message);

    return res.status(500).json({
      message: "Unable to submit voucher for approval.",
    });
  }
});

// Get vouchers belonging only to the logged-in employee.
router.get("/", authenticateEmployee, async (req, res) => {
  try {
    const [vouchers] = await pool.execute(
      `SELECT
         id,
         voucher_number,
         employee_id,
         voucher_date,
         expense_date,
         department,
         expense_title,
         expense_category,
         expense_description,
         amount,
         employee_signature,
         director_signature,
         status,
         approval_date,
         rejection_reason,
         payment_date,
         payment_reference,
         created_at,
         updated_at
       FROM vouchers
       WHERE employee_id = ?
       ORDER BY created_at DESC, id DESC`,
      [req.user.id]
    );

    return res.json({ vouchers });
  } catch (error) {
    console.error("Fetch vouchers error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch expense vouchers.",
    });
  }
});

module.exports = router;
