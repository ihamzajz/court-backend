const { resolveActiveUserFromToken } = require("../utils/authSession");

exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  try {
    const { user } = await resolveActiveUserFromToken(token);
    req.user = user;
    next();
  } catch (error) {
    return res.status(error.statusCode || 401).json({ message: error.message || "Token invalid" });
  }
};

exports.adminOnly = (req, res, next) => {
  const role = req.user?.role;

  if (role !== "admin" && role !== "superadmin") {
    return res.status(403).json({ message: "Admin access only" });
  }

  next();
};
