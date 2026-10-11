
const express = require("express");
const jwt = require("jsonwebtoken");
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

// Verify login and ensure the user is a Director.
async function authenticateDirector(req, res, next) {
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
        message: "User account not found.",
      });
    }

    if (users[0].role !== "DIRECTOR") {
      return res.status(403).json({
        message: "Access denied. Director access is required.",
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
        message: "Invalid or expired session. Please log in again.",
      });
    }

    console.error("Director authentication error:", error.message);

    return res.status(500).json({
      message: "Unable to verify Director access.",
    });
  }
}

// GET: View all vouchers waiting for Director approval.
router.get("/vouchers/pending", authenticateDirector, async (req, res) => {
  try {
    const [vouchers] = await pool.execute(
      `SELECT
         v.id,
         v.voucher_number,
         v.employee_id,
         u.name AS employee_name,
         u.email AS employee_email,
         v.voucher_date,
         v.expense_date,
         v.department,
         v.expense_title,
         v.expense_category,
         v.expense_description,
         v.amount,
         v.employee_signature,
         v.director_signature,
         v.status,
         v.approval_date,
         v.rejection_reason,
         v.created_at,
         v.updated_at
       FROM vouchers v
       INNER JOIN users u ON v.employee_id = u.id
       WHERE v.status = 'PENDING_APPROVAL'
       ORDER BY v.created_at ASC, v.id ASC`
    );

    return res.json({ vouchers });
  } catch (error) {
    console.error("Fetch pending vouchers error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch pending vouchers.",
    });
  }
});

// PATCH: Approve a submitted voucher and save the Director's signature image.
router.patch(
  "/vouchers/:id/approve",
  authenticateDirector,
  async (req, res) => {
    try {
      const voucherId = Number(req.params.id);

      if (!Number.isSafeInteger(voucherId) || voucherId <= 0) {
        return res.status(400).json({
          message: "Invalid voucher ID.",
        });
      }

      const signature = decodeSignatureImage(
        req.body?.director_signature
      );

      if (!signature) {
        return res.status(400).json({
          message: "Upload a valid PNG or JPG Director signature image up to 2 MB.",
        });
      }

      const [result] = await pool.execute(
        `UPDATE vouchers
         SET status = 'APPROVED',
             director_signature = ?,
             approval_date = NOW(),
             rejection_reason = NULL
         WHERE id = ?
           AND status = 'PENDING_APPROVAL'
           AND employee_signature IS NOT NULL`,
        [signature, voucherId]
      );

      if (result.affectedRows === 0) {
        const [rows] = await pool.execute(
          `SELECT id, status, employee_signature
           FROM vouchers
           WHERE id = ?`,
          [voucherId]
        );

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Voucher not found.",
          });
        }

        if (rows[0].status !== "PENDING_APPROVAL") {
          return res.status(409).json({
            message: "Voucher is not pending approval or has already been processed.",
            currentStatus: rows[0].status,
          });
        }

        if (!rows[0].employee_signature) {
          return res.status(400).json({
            message: "The employee must upload a signature before approval.",
          });
        }

        return res.status(409).json({
          message: "Voucher status changed. Refresh and try again.",
        });
      }

      return res.json({
        message: "Voucher approved and Director signature saved successfully.",
        voucher: {
          id: voucherId,
          status: "APPROVED",
        },
      });
    } catch (error) {
      console.error("Approve voucher error:", error.message);

      return res.status(500).json({
        message: "Unable to approve voucher.",
      });
    }
  }
);

// PATCH: Reject a submitted voucher with a mandatory reason.
router.patch(
  "/vouchers/:id/reject",
  authenticateDirector,
  async (req, res) => {
    try {
      const voucherId = Number(req.params.id);
      const reason = req.body?.rejection_reason;

      if (!Number.isSafeInteger(voucherId) || voucherId <= 0) {
        return res.status(400).json({
          message: "Invalid voucher ID.",
        });
      }

      if (typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({
          message: "Please provide a rejection reason.",
        });
      }

      if (reason.trim().length > 1000) {
        return res.status(400).json({
          message: "Rejection reason must not exceed 1000 characters.",
        });
      }

      const [result] = await pool.execute(
        `UPDATE vouchers
         SET status = 'REJECTED',
             rejection_reason = ?
         WHERE id = ?
           AND status = 'PENDING_APPROVAL'`,
        [reason.trim(), voucherId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Pending voucher not found or already processed.",
        });
      }

      return res.json({
        message: "Voucher rejected successfully.",
        voucher: {
          id: voucherId,
          status: "REJECTED",
          rejection_reason: reason.trim(),
        },
      });
    } catch (error) {
      console.error("Reject voucher error:", error.message);

      return res.status(500).json({
        message: "Unable to reject voucher.",
      });
    }
  }
);

module.exports = router;
