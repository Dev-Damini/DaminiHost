const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { usersDb } = require("../db");
const { signToken } = require("../middleware/auth");

const router = express.Router();

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: "Name, email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const existing = usersDb.get("users").find({ email }).value();
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    name,
    email,
    password: hashed,
    plan: "free",       // free | pro
    createdAt: new Date().toISOString(),
  };

  usersDb.get("users").push(user).write();

  const token = signToken({ id: user.id, email: user.email });
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = usersDb.get("users").find({ email }).value();
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken({ id: user.id, email: user.email });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", require("../middleware/auth").authMiddleware, (req, res) => {
  const user = usersDb.get("users").find({ id: req.user.id }).value();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan });
});

module.exports = router;
