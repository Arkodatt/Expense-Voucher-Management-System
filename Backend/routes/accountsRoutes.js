
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const router = express.Router();

// Verify login and ensure the user belongs to Accounts.
async function authenticateAccounts(req, res, next) {
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

    if (users[0].role !== "ACCOUNTS") {
      return res.status(403).json({
        message: "Access denied. Accounts access is required.",
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

    console.error("Accounts authentication error:", error.message);

    return res.status(500).json({
      message: "Unable to verify Accounts access.",
    });
  }
}

// GET: View organization vouchers, including both signature images.
// Default view includes approved and paid vouchers.
// Use ?status=ALL to view vouchers in every workflow status.
router.get("/vouchers", authenticateAccounts, async (req, res) => {
  try {
    const requestedStatus = String(req.query.status || "ALL").toUpperCase();

    const allowedStatuses = [
      "ALL",
      "DRAFT",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "PAID",
    ];

    if (!allowedStatuses.includes(requestedStatus)) {
      return res.status(400).json({
        message: "Invalid status filter.",
        allowedStatuses,
      });
    }

    let statusCondition = "";
    const params = [];

    if (requestedStatus === "ALL") {
      // Accounts can inspect all organization vouchers.
      statusCondition = "";
    } else {
      statusCondition = "WHERE v.status = ?";
      params.push(requestedStatus);
    }

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
         v.payment_date,
         v.payment_reference,
         v.created_at,
         v.updated_at
       FROM vouchers v
       INNER JOIN users u ON v.employee_id = u.id
       ${statusCondition}
       ORDER BY v.created_at DESC, v.id DESC`,
      params
    );

    return res.json({ vouchers });
  } catch (error) {
    console.error("Fetch Accounts vouchers error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch organization vouchers.",
    });
  }
});

// PATCH: Mark an approved voucher as paid.
router.patch(
  "/vouchers/:id/pay",
  authenticateAccounts,
  async (req, res) => {
    try {
      const voucherId = Number(req.params.id);
      const paymentReference = req.body?.payment_reference;

      if (!Number.isSafeInteger(voucherId) || voucherId <= 0) {
        return res.status(400).json({
          message: "Please provide a valid voucher ID.",
        });
      }

      if (
        typeof paymentReference !== "string" ||
        !paymentReference.trim()
      ) {
        return res.status(400).json({
          message: "Payment reference is required.",
        });
      }

      if (paymentReference.trim().length > 100) {
        return res.status(400).json({
          message: "Payment reference must not exceed 100 characters.",
        });
      }

      const [result] = await pool.execute(
        `UPDATE vouchers
         SET status = 'PAID',
             payment_date = NOW(),
             payment_reference = ?
         WHERE id = ?
           AND status = 'APPROVED'`,
        [paymentReference.trim(), voucherId]
      );

      if (result.affectedRows === 0) {
        const [rows] = await pool.execute(
          `SELECT id, status
           FROM vouchers
           WHERE id = ?`,
          [voucherId]
        );

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Voucher not found.",
          });
        }

        if (rows[0].status === "PAID") {
          return res.status(409).json({
            message: "This voucher has already been marked as paid.",
            currentStatus: rows[0].status,
          });
        }

        return res.status(409).json({
          message: "Only approved vouchers can be marked as paid.",
          currentStatus: rows[0].status,
        });
      }

      return res.json({
        message: "Voucher marked as paid successfully.",
        voucher: {
          id: voucherId,
          status: "PAID",
          payment_date: new Date().toISOString(),
          payment_reference: paymentReference.trim(),
        },
      });
    } catch (error) {
      console.error("Mark voucher paid error:", error.message);

      return res.status(500).json({
        message: "Unable to mark voucher as paid.",
      });
    }
  }
);

module.exports = router;
