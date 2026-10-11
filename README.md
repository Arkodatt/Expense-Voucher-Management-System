# Expense-Voucher-Management-System

A web-based expense voucher management application built with **React, Node.js, Express.js, and MySQL**. The system helps organizations manage employee expense claims, approval workflows, and payment tracking through role-based access.

## Features

### Employee
- Create and submit expense vouchers.
- Save expense vouchers as drafts.
- View submitted vouchers and their approval status.
- Track rejected vouchers and rejection reasons.

### Director
- View pending expense vouchers.
- Review employee expense claims.
- Approve or reject vouchers.
- Provide a reason when rejecting a voucher.

### Accounts Department
- View expense vouchers across the organization.
- Filter vouchers by status.
- Track approved and paid vouchers.
- Record payment references when marking vouchers as paid.

## Technology Stack

**Frontend**
- React.js
- Vite
- JavaScript
- CSS

**Backend**
- Node.js
- Express.js
- REST API
- JWT authentication

**Database**
- MySQL

## Project Structure

```text
Expense-Voucher-Management-System/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── ...
│   ├── index.html
│   ├── package.json
│   └── package-lock.json
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   ├── server.js
│   ├── package.json
│   └── ...
└── README.md
```

## Prerequisites

Install the following before running the project:

- [Node.js and npm](https://nodejs.org/)
- [MySQL](https://dev.mysql.com/downloads/)

## Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/Arkodatt/Expense-Voucher-Management-System.git
cd Expense-Voucher-Management-System
```

### 2. Set up the database

1. Start your MySQL server.
2. Create a database for the application.
3. Configure the database connection in the backend configuration.
4. Import or execute the project's SQL schema and required table definitions.

Use the database name and credentials configured for your local environment.

### 3. Configure the backend

Open a terminal in the backend directory:

```bash
cd backend
npm install
```

Configure your database credentials and authentication settings using environment variables or the configuration method used by the project.

Start the backend using the script configured in `backend/package.json`. For example:

```bash
npm start
```

If your project uses a development script, you can use:

```bash
npm run dev
```

### 4. Configure the frontend

Open another terminal in the frontend directory:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

## Expense Voucher Workflow

```text
Employee Creates Voucher
          |
          v
      Save Draft
          |
          v
       Submit
          |
          v
  Director Reviews Voucher
          |
     +----+----+
     |         |
   Approve   Reject
     |
     v
Accounts Processes Payment
     |
     v
   Mark as Paid
```

## Voucher Statuses

| Status | Description |
|---|---|
| DRAFT | Voucher saved but not submitted |
| PENDING_APPROVAL | Voucher submitted for review |
| APPROVED | Voucher approved by the director |
| REJECTED | Voucher rejected with a reason |
| PAID | Payment recorded by the accounts department |

## Security

- Role-based access for employees, directors, and accounts personnel.
- JWT-based authentication.
- Sensitive configuration values should be stored securely.
- Environment files, passwords, API keys, and database credentials should not be committed to GitHub.

## Future Enhancements

- Expense analytics and reporting.
- Downloadable expense reports.
- Advanced dashboard visualizations.
- Email notifications for approval and payment updates.

## Author

**Arkodatt**

GitHub: [@Arkodatt](https://github.com/Arkodatt)

---

*This project was developed to simplify expense claim submission, approval, and payment tracking within an organization.*

