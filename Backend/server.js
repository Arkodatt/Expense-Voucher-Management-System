
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const voucherRoutes = require("./routes/voucherRoutes");
const directorRoutes = require("./routes/directorRoutes");
const accountsRoutes = require("./routes/accountsRoutes");

const app = express();

// Allow requests from the React/Vite frontend.
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-setup-secret"],
  })
);

// Parse incoming JSON requests.
app.use(express.json({ limit: "8mb" }));

// API home route.
app.get("/", (req, res) => {
  res.json({
    message: "Expense Voucher API is running",
  });
});

// Check whether the backend and MySQL are connected.
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "OK",
      database: "Connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);

    res.status(500).json({
      status: "ERROR",
      database: "Disconnected",
    });
  }
});

// Authentication: register and login.
app.use("/api/auth", authRoutes);

// Employee: create and view personal vouchers.
app.use("/api/vouchers", voucherRoutes);

// Director: view pending vouchers and approve or reject them.
app.use("/api/director", directorRoutes);

// Accounts: view approved/paid vouchers and record payments.
app.use("/api/accounts", accountsRoutes);

// Handle unknown routes.
app.use((req, res) => {
  res.status(404).json({
    message: "API endpoint not found",
  });
});

// Handle unexpected errors.
app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    message: "Internal server error",
  });
});

// Validate required environment variables.
const requiredVariables = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_NAME"];

const missingVariables = requiredVariables.filter(
  (variable) => !process.env[variable]
);

if (missingVariables.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVariables.join(", ")}`
  );
  process.exit(1);
}

// Start the server.
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
