# 🏥 CityCare — Hospital Management System

A web-based Hospital Management System designed to organize essential hospital operations through a simple and user-friendly interface.

## 📌 About the Project

CityCare is a student-built Hospital Management System project. It brings different hospital management modules together in one application, with a backend powered by Node.js, Express and MongoDB.

## ✨ Features

- Dashboard
- Patient Management
- Doctor Management
- Appointment Management
- Department Management
- Staff Management
- Billing and Financial Management
- Pharmacy Management
- Laboratory Management
- Medical Records
- Reports and Analytics
- Contact Us

## 🛠️ Tech Stack

**Frontend**
- HTML5
- CSS3
- JavaScript

**Backend**
- Node.js
- Express.js
- Nodemailer

**Database**
- MongoDB
- Mongoose

**Tools**
- Git
- GitHub
- Visual Studio Code

## 📂 Project Structure

```text
CityCare/
├── api/
├── css/
├── js/
│   └── modules/
├── server/
│   ├── .env.example
│   ├── auth.js
│   ├── patient.js
│   └── server.js
├── .gitignore
├── index.html
└── README.md
```

## ⚙️ Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/Priyanshu2129-ai/CityCare.git
```

### 2. Open the project

```bash
cd CityCare
```

### 3. Configure the backend

```bash
cd server
```

Create your own `.env` file using `.env.example` as a reference. Add your MongoDB connection string and other required environment variables.

### 4. Install dependencies

```bash
npm install
```

### 5. Start the server

```bash
npm start
```

The server uses port `3000` by default, unless configured otherwise.

## 🔐 Security

- Environment variables are kept outside frontend code.
- Authentication and session management are handled by the backend.
- Protected API routes require authorization.
- Fictional demo data should be used for testing.

**Never upload your `.env` file or real credentials to GitHub.**

## 👨‍💻 Developer

**Priyanshu Kumar**

GitHub: [@Priyanshu2129-ai](https://github.com/Priyanshu2129-ai)

---

*CityCare — A student project focused on learning and building practical web applications.*