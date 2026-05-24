const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "daminihost-secret-change-in-prod";

function authMiddleware(req, res, next) {
  // Support token via query param for EventSource (SSE) connections
  const queryToken = req.query.token;
  const header = req.headers.authorization;

  const token = queryToken || (header?.startsWith("Bearer ") ? header.split(" ")[1] : null);

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

module.exports = { authMiddleware, signToken };
