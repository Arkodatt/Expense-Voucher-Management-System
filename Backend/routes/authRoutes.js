const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const router = express.Router();

// Register a normal employee.
router.post("/register", async (req, res) => {
  try {
    const { name, employee_id, email, password, department } = req.body;

    if (!name || !employee_id || !email || !password || !department) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedEmployeeId = employee_id.trim();

    const [existingUsers] = await pool.execute(
      "SELECT id FROM users WHERE email = ? OR employee_id = ?",
      [normalizedEmail, normalizedEmployeeId]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "Email or employee ID already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users
       (name, employee_id, email, password_hash, role, department)
       VALUES (?, ?, ?, ?, 'EMPLOYEE', ?)`,
      [
        name.trim(),
        normalizedEmployeeId,
        normalizedEmail,
        passwordHash,
        department.trim(),
      ]
    );

    return res.status(201).json({
      message: "Employee registered successfully",
      userId: result.insertId,
    });
  } catch (error) {
    console.error("Registration error:", error.message);

    return res.status(500).json({
      message: "Unable to register employee",
    });
  }
});

// Create an Accounts user during initial setup.
// Requires SETUP_ACCOUNTS_SECRET in backend/.env.
router.post("/setup-accounts", async (req, res) => {
  try {
    const setupSecret = process.env.SETUP_ACCOUNTS_SECRET;
    const suppliedSecret = req.get("x-setup-secret");

    if (!setupSecret) {
      return res.status(503).json({
        message: "Accounts setup is not configured on the server.",
      });
    }

    if (!suppliedSecret || suppliedSecret !== setupSecret) {
      return res.status(403).json({
        message: "Invalid setup secret.",
      });
    }

    const { name, employee_id, email, password, department } = req.body;

    if (
      typeof name !== "string" ||
      typeof employee_id !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof department !== "string" ||
      !name.trim() ||
      !employee_id.trim() ||
      !email.trim() ||
      !department.trim()
    ) {
      return res.status(400).json({
        message: "All fields are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedEmployeeId = employee_id.trim();

    const [existingUsers] = await pool.execute(
      "SELECT id FROM users WHERE email = ? OR employee_id = ?",
      [normalizedEmail, normalizedEmployeeId]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "Email or employee ID already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users
       (name, employee_id, email, password_hash, role, department)
       VALUES (?, ?, ?, ?, 'ACCOUNTS', ?)`,
      [
        name.trim(),
        normalizedEmployeeId,
        normalizedEmail,
        passwordHash,
        department.trim(),
      ]
    );

    return res.status(201).json({
      message: "Accounts user created successfully.",
      userId: result.insertId,
      role: "ACCOUNTS",
    });
  } catch (error) {
    console.error("Accounts setup error:", error.message);

    return res.status(500).json({
      message: "Unable to create Accounts user.",
    });
  }
});

// Login for employees, directors, and Accounts users.
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const [users] = await pool.execute(
      `SELECT id, name, employee_id, email,
              password_hash, role, department
       FROM users
       WHERE email = ?`,
      [email.trim().toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = users[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing from backend/.env");

      return res.status(500).json({
        message: "Login is not configured on the server.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        employee_id: user.employee_id,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      message: "Unable to log in",
    });
  }
});

module.exports = router;
