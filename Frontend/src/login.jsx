
import { useState } from "react";
import { apiRequest } from "./api";

function Login({ onLogin }) {
  const [activeTab, setActiveTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  const [form, setForm] = useState({
    name: "",
    employee_id: "",
    email: "",
    password: "",
    department: "",
  });

  const isRegister = activeTab === "register";

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function switchTab(tab) {
    setActiveTab(tab);
    setMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");

    if (
      !form.email.trim() ||
      !form.password ||
      (isRegister &&
        (!form.name.trim() ||
          !form.employee_id.trim() ||
          !form.department.trim()))
    ) {
      setMessageType("error");
      setMessage("Please fill in all required fields.");
      return;
    }

    if (isRegister && form.password.length < 8) {
      setMessageType("error");
      setMessage("Password must contain at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        const result = await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            employee_id: form.employee_id.trim(),
            email: form.email.trim().toLowerCase(),
            password: form.password,
            department: form.department.trim(),
          }),
        });

        setMessageType("success");
        setMessage(
          result.message || "Registration successful. Please log in."
        );

        setForm((previous) => ({
          ...previous,
          name: "",
          employee_id: "",
          email: "",
          password: "",
          department: "",
        }));

        setActiveTab("login");
      } else {
        const result = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: form.email.trim().toLowerCase(),
            password: form.password,
          }),
        });

        if (!result.token || !result.user) {
          throw new Error("The server returned an invalid login response.");
        }

        localStorage.setItem("token", result.token);
        localStorage.setItem("user", JSON.stringify(result.user));

        if (typeof onLogin === "function") {
          onLogin(result.user);
        }
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <header className="auth-brand">
          <div className="auth-logo">EV</div>

          <p className="auth-eyebrow">EXPENSE MANAGEMENT</p>

          <h1>Expense Voucher System</h1>

          <p className="auth-subtitle">
            Manage expenses and voucher approvals in one place.
          </p>
        </header>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${!isRegister ? "active" : ""}`}
            onClick={() => switchTab("login")}
            disabled={loading}
          >
            Login
          </button>

          <button
            type="button"
            className={`auth-tab ${isRegister ? "active" : ""}`}
            onClick={() => switchTab("register")}
            disabled={loading}
          >
            Register
          </button>
        </div>

        <div className="auth-heading">
          <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>

          <p className="auth-description">
            {isRegister
              ? "Register as an employee to get started."
              : "Sign in to access your expense vouchers."}
          </p>
        </div>

        {message && (
          <div
            className={`auth-message ${messageType}`}
            role="alert"
            aria-live="polite"
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Enter your full name"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
                required
                disabled={loading}
              />

              <label htmlFor="employee_id">Employee ID</label>
              <input
                id="employee_id"
                name="employee_id"
                type="text"
                placeholder="e.g. EMP002"
                value={form.employee_id}
                onChange={handleChange}
                required
                disabled={loading}
              />

              <label htmlFor="department">Department</label>
              <input
                id="department"
                name="department"
                type="text"
                placeholder="e.g. IT"
                value={form.department}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </>
          )}

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="employee@example.com"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
            required
            disabled={loading}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder={
              isRegister ? "At least 8 characters" : "Enter your password"
            }
            value={form.password}
            onChange={handleChange}
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : undefined}
            required
            disabled={loading}
          />

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isRegister
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="auth-footer">
          {isRegister ? "Already registered? " : "New employee? "}

          <button
            type="button"
            className="auth-switch"
            onClick={() => switchTab(isRegister ? "login" : "register")}
            disabled={loading}
          >
            {isRegister ? "Sign in" : "Create an account"}
          </button>
        </p>
      </section>
    </main>
  );
}

export default Login;
