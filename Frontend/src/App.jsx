
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api";
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

const EMPTY_VOUCHER = {
  expense_date: new Date().toLocaleDateString("en-CA"),
  expense_title: "",
  expense_category: "Office Expenses",
  expense_description: "",
  amount: "",
};

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function formatAmount(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const parts = String(value).slice(0, 10).split("-");
  return parts.length === 3
    ? `${parts[2]}-${parts[1]}-${parts[0]}`
    : String(value);
}

function statusClass(status) {
  return String(status || "unknown").toLowerCase().replaceAll("_", "-");
}

// Reusable image uploader for employee and Director signatures.
function SignatureUploader({ label, initialImage, onSave, onCancel, saving }) {
  const [image, setImage] = useState(initialImage || "");
  const [fileName, setFileName] = useState("");
  const [uploadError, setUploadError] = useState("");

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    setUploadError("");

    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setUploadError("Choose a PNG or JPG image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setUploadError("The image must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setUploadError("Unable to read this image. Please try another file.");
        return;
      }

      setImage(reader.result);
      setFileName(file.name);
    };

    reader.onerror = () => {
      setUploadError("Unable to read this image. Please try again.");
    };

    reader.readAsDataURL(file);
  }

  return (
    <div className="signature-uploader">
      <label className="upload-label">{label}</label>

      <div className="signature-preview">
        {image ? (
          <img src={image} alt={label} />
        ) : (
          <div className="signature-placeholder">
            <span className="upload-symbol">↑</span>
            <strong>No signature image selected</strong>
            <span>PNG or JPG, up to 2 MB</span>
          </div>
        )}
      </div>

      <label className="btn outline file-select">
        Choose signature image
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleFileChange}
        />
      </label>

      {fileName && <p className="file-name">{fileName}</p>}
      {uploadError && <p className="inline-error">{uploadError}</p>}

      <div className="action-row">
        <button
          type="button"
          className="btn primary"
          disabled={saving || !image}
          onClick={() => onSave(image)}
        >
          {saving ? "Saving..." : "Save signature"}
        </button>

        <button
          type="button"
          className="btn outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SignatureImage({ signature, label }) {
  return (
    <div className="saved-signature">
      <span>{label}</span>
      {signature ? (
        <img src={signature} alt={label} />
      ) : (
        <p className="muted-text">No signature available</p>
      )}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("token") || ""
  );
  const [user, setUser] = useState(readStoredUser);

  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    employee_id: "",
    email: "",
    password: "",
    department: "IT",
  });

  const [voucherForm, setVoucherForm] = useState(EMPTY_VOUCHER);
  const [vouchers, setVouchers] = useState([]);
  const [pendingVouchers, setPendingVouchers] = useState([]);
  const [accountsVouchers, setAccountsVouchers] = useState([]);

  const [voucherTab, setVoucherTab] = useState("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [signingEmployeeId, setSigningEmployeeId] = useState(null);
  const [signingDirectorId, setSigningDirectorId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [paymentReferences, setPaymentReferences] = useState({});

  const role = user?.role;
  const isEmployee = role === "EMPLOYEE";
  const isDirector = role === "DIRECTOR";
  const isAccounts = role === "ACCOUNTS";

  const apiRequest = useCallback(
    async (endpoint, options = {}) => {
      const headers = {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      };

      let response;

      try {
        response = await fetch(`${API_URL}${endpoint}`, {
          ...options,
          headers,
        });
      } catch {
        throw new Error(
          "Cannot connect to the backend. Check that the server is running on port 5000."
        );
      }

      let data = {};

      try {
        data = await response.json();
      } catch {
        // Some successful responses may have no JSON body.
      }

      if (!response.ok) {
        throw new Error(data.message || `Request failed (${response.status}).`);
      }

      return data;
    },
    [token]
  );

  const loadEmployeeVouchers = useCallback(async () => {
    const data = await apiRequest("/vouchers");
    setVouchers(data.vouchers || []);
  }, [apiRequest]);

  const loadPendingVouchers = useCallback(async () => {
    const data = await apiRequest("/director/vouchers/pending");
    setPendingVouchers(data.vouchers || []);
  }, [apiRequest]);

  const loadAccountsVouchers = useCallback(async () => {
    const data = await apiRequest("/accounts/vouchers");
    setAccountsVouchers(data.vouchers || []);
  }, [apiRequest]);

  const refreshDashboard = useCallback(async () => {
    if (!token || !user) return;

    setError("");
    setLoading(true);

    try {
      if (isDirector) {
        await loadPendingVouchers();
      } else if (isAccounts) {
        await loadAccountsVouchers();
      } else {
        await loadEmployeeVouchers();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [
    token,
    user,
    isDirector,
    isAccounts,
    loadPendingVouchers,
    loadAccountsVouchers,
    loadEmployeeVouchers,
  ]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  async function handleAuth(event) {
    event.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const endpoint =
        authMode === "login" ? "/auth/login" : "/auth/register";

      const payload =
        authMode === "login"
          ? {
              email: authForm.email.trim().toLowerCase(),
              password: authForm.password,
            }
          : {
              ...authForm,
              name: authForm.name.trim(),
              employee_id: authForm.employee_id.trim(),
              email: authForm.email.trim().toLowerCase(),
              department: authForm.department.trim(),
            };

      const data = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (authMode === "register") {
        setSuccess("Account created. Please log in.");
        setAuthMode("login");
        setAuthForm((previous) => ({ ...previous, password: "" }));
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setSuccess("Login successful.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setToken("");
    setUser(null);
    setVouchers([]);
    setPendingVouchers([]);
    setAccountsVouchers([]);
    setError("");
    setSuccess("");
    setAuthMode("login");
  }

  function updateAuthField(event) {
    const { name, value } = event.target;
    setAuthForm((previous) => ({ ...previous, [name]: value }));
  }

  function updateVoucherField(event) {
    const { name, value } = event.target;
    setVoucherForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleCreateVoucher(event) {
    event.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      await apiRequest("/vouchers", {
        method: "POST",
        body: JSON.stringify({
          ...voucherForm,
          amount: Number(voucherForm.amount),
        }),
      });

      setSuccess("Voucher saved as a draft.");
      setVoucherForm({
        ...EMPTY_VOUCHER,
        expense_date: new Date().toLocaleDateString("en-CA"),
      });
      setVoucherTab("list");
      await loadEmployeeVouchers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEmployeeSignature(id, image) {
    clearMessages();
    setLoading(true);

    try {
      const data = await apiRequest(`/vouchers/${id}/signature`, {
        method: "PATCH",
        body: JSON.stringify({ employee_signature: image }),
      });

      setSuccess(data.message || "Employee signature saved successfully.");
      setSigningEmployeeId(null);
      await loadEmployeeVouchers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitVoucher(id) {
    if (!window.confirm("Submit this signed voucher for approval?")) return;

    clearMessages();
    setLoading(true);

    try {
      const data = await apiRequest(`/vouchers/${id}/submit`, {
        method: "PATCH",
      });

      setSuccess(data.message || "Voucher submitted for approval.");
      await loadEmployeeVouchers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id, image) {
    if (!image) {
      setError("Please upload the Director's signature before approving.");
      return;
    }

    if (!window.confirm("Approve this expense voucher?")) return;

    clearMessages();
    setLoading(true);

    try {
      const data = await apiRequest(`/director/vouchers/${id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({ director_signature: image }),
      });

      setSuccess(data.message || "Voucher approved successfully.");
      setSigningDirectorId(null);
      await loadPendingVouchers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject(event, id) {
    event.preventDefault();

    if (!rejectionReason.trim()) {
      setError("Please enter a rejection reason.");
      return;
    }

    clearMessages();
    setLoading(true);

    try {
      const data = await apiRequest(`/director/vouchers/${id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({
          rejection_reason: rejectionReason.trim(),
        }),
      });

      setSuccess(data.message || "Voucher rejected successfully.");
      setRejectingId(null);
      setRejectionReason("");
      await loadPendingVouchers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkPaid(id) {
    const reference = (paymentReferences[id] || "").trim();

    if (!reference) {
      setError("Enter the payment reference before marking as paid.");
      return;
    }

    if (!window.confirm("Mark this voucher as paid?")) return;

    clearMessages();
    setLoading(true);

    try {
      const data = await apiRequest(`/accounts/vouchers/${id}/pay`, {
        method: "PATCH",
        body: JSON.stringify({ payment_reference: reference }),
      });

      setSuccess(data.message || "Voucher marked as paid.");
      setPaymentReferences((previous) => ({ ...previous, [id]: "" }));
      await loadAccountsVouchers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const allDisplayedVouchers = isDirector
    ? pendingVouchers
    : isAccounts
      ? accountsVouchers
      : vouchers;

  const displayedVouchers = allDisplayedVouchers.filter((voucher) => {
    const searchable = [
      voucher.voucher_number,
      voucher.expense_title,
      voucher.expense_category,
      voucher.department,
      voucher.employee_name,
      voucher.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      searchable.includes(search.toLowerCase()) &&
      (statusFilter === "ALL" || voucher.status === statusFilter)
    );
  });

  if (!token || !user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">EV</div>
          <p className="eyebrow">EXPENSE MANAGEMENT</p>
          <h1>Expense Voucher System</h1>
          <p className="subtitle">
            Manage expenses and voucher approvals in one place.
          </p>

          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              onClick={() => {
                setAuthMode("login");
                clearMessages();
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === "register" ? "active" : ""}
              onClick={() => {
                setAuthMode("register");
                clearMessages();
              }}
            >
              Register
            </button>
          </div>

          <h2>{authMode === "login" ? "Welcome back" : "Create account"}</h2>
          <p className="subtitle">
            {authMode === "login"
              ? "Sign in to access your vouchers."
              : "Register a new employee account."}
          </p>

          {error && <div className="alert error">{error}</div>}
          {success && <div className="alert success">{success}</div>}

          <form className="form-stack" onSubmit={handleAuth}>
            {authMode === "register" && (
              <>
                <label>
                  Full name
                  <input
                    name="name"
                    value={authForm.name}
                    onChange={updateAuthField}
                    required
                  />
                </label>
                <label>
                  Employee ID
                  <input
                    name="employee_id"
                    value={authForm.employee_id}
                    onChange={updateAuthField}
                    required
                  />
                </label>
                <label>
                  Department
                  <input
                    name="department"
                    value={authForm.department}
                    onChange={updateAuthField}
                    required
                  />
                </label>
              </>
            )}

            <label>
              Email address
              <input
                type="email"
                name="email"
                value={authForm.email}
                onChange={updateAuthField}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                value={authForm.password}
                onChange={updateAuthField}
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                minLength={authMode === "register" ? 8 : undefined}
                required
              />
            </label>

            <button className="btn primary full-width" disabled={loading}>
              {loading
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">EV</div>
          <div>
            <h2>Expense Voucher System</h2>
            <p>Expense Management Portal</p>
          </div>
        </div>

        <div className="header-user">
          <div className="user-meta">
            <strong>{user.name}</strong>
            <span className="role-label">{user.role}</span>
          </div>
          <button className="btn outline" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="welcome-banner">
          <p className="eyebrow">
            {isDirector
              ? "DIRECTOR PORTAL"
              : isAccounts
                ? "ACCOUNTS PORTAL"
                : "EMPLOYEE PORTAL"}
          </p>
          <h1>Welcome, {user.name}!</h1>
          <p>
            {isDirector
              ? "Review employee expenses and manage approvals."
              : isAccounts
                ? "Review vouchers and track reimbursement payments."
                : "Create, sign, submit, and track your expense vouchers."}
          </p>
        </section>

        <section className="overview-section">
          <h2>Account Overview</h2>
          <div className="overview-grid">
            <article className="overview-card">
              <span>Name</span>
              <strong>{user.name}</strong>
            </article>
            <article className="overview-card">
              <span>Employee ID</span>
              <strong>{user.employee_id || "—"}</strong>
            </article>
            <article className="overview-card">
              <span>Department</span>
              <strong>{user.department || "—"}</strong>
            </article>
            <article className="overview-card">
              <span>Account Role</span>
              <strong>{user.role}</strong>
            </article>
          </div>
        </section>

        <section className="voucher-section">
          <div className="section-heading">
            <div>
              <h2>
                {isDirector
                  ? "Director Approval Dashboard"
                  : isAccounts
                    ? "Accounts Voucher Dashboard"
                    : "Expense Vouchers"}
              </h2>
              <p>
                {isDirector
                  ? "Review pending employee requests, then approve or reject."
                  : isAccounts
                    ? "View vouchers and process approved reimbursements."
                    : "Create vouchers and follow their approval status."}
              </p>
            </div>
            <button
              className="btn outline"
              onClick={refreshDashboard}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </div>

          {error && <div className="alert error">{error}</div>}
          {success && <div className="alert success">{success}</div>}

          {isEmployee && (
            <div className="tabs">
              <button
                className={voucherTab === "list" ? "active" : ""}
                onClick={() => setVoucherTab("list")}
              >
                My vouchers
              </button>
              <button
                className={voucherTab === "create" ? "active" : ""}
                onClick={() => setVoucherTab("create")}
              >
                + Create voucher
              </button>
            </div>
          )}

          {isEmployee && voucherTab === "create" && (
            <form className="panel voucher-form" onSubmit={handleCreateVoucher}>
              <h3>Create expense voucher</h3>

              <div className="form-grid">
                <label>
                  Expense date
                  <input
                    type="date"
                    name="expense_date"
                    value={voucherForm.expense_date}
                    onChange={updateVoucherField}
                    required
                  />
                </label>

                <label>
                  Expense title
                  <input
                    name="expense_title"
                    value={voucherForm.expense_title}
                    onChange={updateVoucherField}
                    maxLength={200}
                    required
                  />
                </label>

                <label>
                  Expense category
                  <select
                    name="expense_category"
                    value={voucherForm.expense_category}
                    onChange={updateVoucherField}
                    required
                  >
                    <option>Office Expenses</option>
                    <option>Travel</option>
                    <option>Food</option>
                    <option>Accommodation</option>
                    <option>Equipment</option>
                    <option>Communication</option>
                    <option>Other</option>
                  </select>
                </label>

                <label>
                  Amount (₹)
                  <input
                    type="number"
                    name="amount"
                    value={voucherForm.amount}
                    onChange={updateVoucherField}
                    min="0.01"
                    max="9999999999.99"
                    step="0.01"
                    required
                  />
                </label>

                <label className="full-span">
                  Description
                  <textarea
                    name="expense_description"
                    value={voucherForm.expense_description}
                    onChange={updateVoucherField}
                    rows="3"
                  />
                </label>
              </div>

              <div className="action-row">
                <button className="btn primary" disabled={loading}>
                  {loading ? "Saving..." : "Save as draft"}
                </button>
              </div>
              <p className="muted-text">
                Save the draft first, then upload your signature before
                submitting it.
              </p>
            </form>
          )}

          {(!isEmployee || voucherTab === "list") && (
            <>
              {isDirector && (
                <div className="stats-grid">
                  <article className="stat-card">
                    <span>Pending approvals</span>
                    <strong>{pendingVouchers.length}</strong>
                  </article>
                  <article className="stat-card">
                    <span>Total pending amount</span>
                    <strong>
                      {formatAmount(
                        pendingVouchers.reduce(
                          (sum, v) => sum + Number(v.amount || 0),
                          0
                        )
                      )}
                    </strong>
                  </article>
                </div>
              )}

              {isEmployee && (
                <div className="stats-grid">
                  <article className="stat-card">
                    <span>Total vouchers</span>
                    <strong>{vouchers.length}</strong>
                  </article>
                  <article className="stat-card">
                    <span>Pending approval</span>
                    <strong>
                      {
                        vouchers.filter(
                          (v) => v.status === "PENDING_APPROVAL"
                        ).length
                      }
                    </strong>
                  </article>
                  <article className="stat-card">
                    <span>Approved or paid</span>
                    <strong>
                      {
                        vouchers.filter((v) =>
                          ["APPROVED", "PAID"].includes(v.status)
                        ).length
                      }
                    </strong>
                  </article>
                </div>
              )}

              {isAccounts && (
                <div className="stats-grid">
                  <article className="stat-card">
                    <span>Vouchers displayed</span>
                    <strong>{accountsVouchers.length}</strong>
                  </article>
                  <article className="stat-card">
                    <span>Approved</span>
                    <strong>
                      {
                        accountsVouchers.filter((v) => v.status === "APPROVED")
                          .length
                      }
                    </strong>
                  </article>
                  <article className="stat-card">
                    <span>Paid</span>
                    <strong>
                      {
                        accountsVouchers.filter((v) => v.status === "PAID")
                          .length
                      }
                    </strong>
                  </article>
                </div>
              )}

              <div className="filter-row">
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search vouchers..."
                  aria-label="Search vouchers"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="ALL">All statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING_APPROVAL">Pending approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="PAID">Paid</option>
                </select>
              </div>

              {loading && displayedVouchers.length === 0 ? (
                <div className="empty-state">Loading vouchers...</div>
              ) : displayedVouchers.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✓</div>
                  <h3>No vouchers found</h3>
                  <p>No vouchers match your current search or filter.</p>
                </div>
              ) : (
                <div className="voucher-list">
                  {displayedVouchers.map((voucher) => (
                    <article className="voucher-card" key={voucher.id}>
                      <div className="voucher-card-heading">
                        <div>
                          <span className="voucher-number">
                            {voucher.voucher_number || `Voucher #${voucher.id}`}
                          </span>
                          <h3>{voucher.expense_title}</h3>
                          {(isDirector || isAccounts) && (
                            <p>
                              Employee: {voucher.employee_name || "Employee"} ·{" "}
                              {voucher.department || "—"}
                            </p>
                          )}
                          {isEmployee && (
                            <p>{voucher.expense_category}</p>
                          )}
                        </div>
                        <span
                          className={`status-badge ${statusClass(voucher.status)}`}
                        >
                          {String(voucher.status || "UNKNOWN").replaceAll(
                            "_",
                            " "
                          )}
                        </span>
                      </div>

                      <div className="voucher-details-grid">
                        <div>
                          <span>Amount</span>
                          <strong>{formatAmount(voucher.amount)}</strong>
                        </div>
                        <div>
                          <span>Expense date</span>
                          <strong>{formatDate(voucher.expense_date)}</strong>
                        </div>
                        <div>
                          <span>Category</span>
                          <strong>{voucher.expense_category || "—"}</strong>
                        </div>
                        <div>
                          <span>Voucher date</span>
                          <strong>{formatDate(voucher.voucher_date)}</strong>
                        </div>
                      </div>

                      {voucher.expense_description && (
                        <p className="description-text">
                          {voucher.expense_description}
                        </p>
                      )}

                      {voucher.rejection_reason && (
                        <div className="rejection-note">
                          <strong>Rejection reason:</strong>{" "}
                          {voucher.rejection_reason}
                        </div>
                      )}

                      <div className="signature-display-grid">
                        <SignatureImage
                          signature={voucher.employee_signature}
                          label="Employee signature"
                        />
                        {(isDirector || isAccounts) && (
                          <SignatureImage
                            signature={voucher.director_signature}
                            label="Director signature"
                          />
                        )}
                      </div>

                      {voucher.approval_date && (
                        <p className="muted-text">
                          Approval date: {formatDate(voucher.approval_date)}
                        </p>
                      )}

                      {isEmployee && voucher.status === "DRAFT" && (
                        <div className="card-actions">
                          {signingEmployeeId === voucher.id ? (
                            <SignatureUploader
                              label="Upload your signature"
                              initialImage={voucher.employee_signature}
                              saving={loading}
                              onSave={(image) =>
                                handleSaveEmployeeSignature(voucher.id, image)
                              }
                              onCancel={() => setSigningEmployeeId(null)}
                            />
                          ) : (
                            <button
                              className="btn outline"
                              onClick={() => {
                                setSigningEmployeeId(voucher.id);
                                clearMessages();
                              }}
                            >
                              {voucher.employee_signature
                                ? "Change signature image"
                                : "Upload signature"}
                            </button>
                          )}

                          {voucher.employee_signature && (
                            <button
                              className="btn primary"
                              disabled={loading}
                              onClick={() => handleSubmitVoucher(voucher.id)}
                            >
                              Submit for approval
                            </button>
                          )}
                        </div>
                      )}

                      {isDirector && voucher.status === "PENDING_APPROVAL" && (
                        <div className="card-actions director-actions">
                          {signingDirectorId === voucher.id ? (
                            <SignatureUploader
                              label="Upload Director approval signature"
                              initialImage={voucher.director_signature}
                              saving={loading}
                              onSave={(image) => handleApprove(voucher.id, image)}
                              onCancel={() => setSigningDirectorId(null)}
                            />
                          ) : (
                            <button
                              className="btn primary"
                              onClick={() => {
                                setSigningDirectorId(voucher.id);
                                setRejectingId(null);
                                clearMessages();
                              }}
                            >
                              Upload signature and approve
                            </button>
                          )}

                          {rejectingId === voucher.id ? (
                            <form
                              className="reject-form"
                              onSubmit={(event) =>
                                handleReject(event, voucher.id)
                              }
                            >
                              <label>
                                Rejection reason
                                <textarea
                                  value={rejectionReason}
                                  onChange={(event) =>
                                    setRejectionReason(event.target.value)
                                  }
                                  maxLength={1000}
                                  rows="3"
                                  required
                                  placeholder="Explain why this voucher is rejected"
                                />
                              </label>
                              <div className="action-row">
                                <button
                                  className="btn danger"
                                  disabled={loading}
                                >
                                  Confirm rejection
                                </button>
                                <button
                                  className="btn outline"
                                  type="button"
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectionReason("");
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              className="btn danger"
                              onClick={() => {
                                setRejectingId(voucher.id);
                                setSigningDirectorId(null);
                                setRejectionReason("");
                                clearMessages();
                              }}
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      )}

                      {isAccounts && voucher.status === "APPROVED" && (
                        <div className="payment-form">
                          <label>
                            Payment reference
                            <input
                              value={paymentReferences[voucher.id] || ""}
                              onChange={(event) =>
                                setPaymentReferences((previous) => ({
                                  ...previous,
                                  [voucher.id]: event.target.value,
                                }))
                              }
                              placeholder="Transaction/reference number"
                              maxLength={100}
                            />
                          </label>
                          <button
                            className="btn primary"
                            disabled={loading}
                            onClick={() => handleMarkPaid(voucher.id)}
                          >
                            Mark as paid
                          </button>
                        </div>
                      )}

                      {isAccounts && voucher.status === "PAID" && (
                        <p className="paid-note">
                          Paid on {formatDate(voucher.payment_date)}
                          {voucher.payment_reference
                            ? ` · Reference: ${voucher.payment_reference}`
                            : ""}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <footer className="app-footer">
          Expense Voucher Management System · Secure role-based workflow
        </footer>
      </main>
    </div>
  );
}

export default App;
