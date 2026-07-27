// July 22 2026
// this is just for reference (delete it later)
// flash extended
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser"); // 1. Import cookie-parser

const app = express();
app.use(express.json());
app.use(cookieParser()); // 2. Use middleware to parse incoming cookies into req.cookies

// Secret key for signing JWTs
const JWT_SECRET = "your-super-secret-key-123";

// Mock database
const users = [];

// ==========================================
// 1. AUTHENTICATION
// ==========================================

// REGISTER (Unchanged)
app.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: Date.now().toString(),
      username,
      password: hashedPassword,
      role: role || "user",
    };

    users.push(newUser);
    res.status(201).json({ message: "User registered successfully!" });
  } catch (err) {
    res.status(500).json({ error: "Server error during registration" });
  }
});

// LOGIN: Now sets an HTTP-Only cookie instead of sending token in JSON response body
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = users.find((u) => u.username === username);
  if (!user) {
    return res.status(400).json({ error: "Invalid username or password" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ error: "Invalid username or password" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

  // 3. Set token as HTTP-Only Cookie
  res.cookie("token", token, {
    httpOnly: true, // Prevents client-side JS (XSS attacks) from reading the cookie
    secure: process.env.NODE_ENV === "production", // Sent over HTTPS only in production
    sameSite: "lax", // Protects against Cross-Site Request Forgery (CSRF)
    maxAge: 3600000, // 1 hour expiration in milliseconds
  });

  res.json({ message: "Logged in successfully!" });
});

// LOGOUT: Simply clear the cookie from the browser
app.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully!" });
});

// ==========================================
// 2. MIDDLEWARE
// ==========================================

/**
 * AUTHENTICATION MIDDLEWARE:
 * Inspects req.cookies for the JWT cookie attached automatically by the browser.
 */
function authenticateToken(req, res, next) {
  // Extract token from either cookie OR Authorization header
  const tokenFromCookie = req.cookies?.token; // if frontend is web-app
  const tokenFromHeader = req.headers["authorization"]?.split(" ")[1]; // if frontend is android/ios app

  // 4. Extract token
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    return res.status(401).json({ error: "Access denied: No token provided" });
  }

  try {
    const decodedUser = jwt.verify(token, JWT_SECRET);
    req.user = decodedUser;
    next();
  } catch (err) {
    // 1. Check specifically for expiration
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Access token expired",
        expiredAt: err.expiredAt,
      });
    }

    // 2. Catches JsonWebTokenError (signature mismatch, malformed payload, etc.)
    return res.status(403).json({
      error: "Invalid or tampered token",
    });
  }
}

// AUTHORIZATION MIDDLEWARE (Unchanged)
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "Forbidden: Insufficient permissions" });
    }
    next();
  };
}

// ==========================================
// 3. PROTECTED ROUTES (Unchanged)
// ==========================================

app.get("/profile", authenticateToken, (req, res) => {
  res.json({
    message: `Welcome back, ${req.user.username}!`,
    yourData: req.user,
  });
});

app.get(
  "/admin/dashboard",
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => {
    res.json({
      message: "Welcome to the secret Admin Dashboard!",
      adminUser: req.user.username,
    });
  },
);

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
