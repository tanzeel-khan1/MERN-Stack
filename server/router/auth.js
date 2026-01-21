const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const AuthUser = require("../model/AuthUser");
const auth = require("../middlewares/auth");

const router = express.Router();
const MIN_PASSWORD_LENGTH = 6;

const createToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return jwt.sign({ id: userId }, secret, { expiresIn: "30d" });
};

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await AuthUser.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await AuthUser.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
    });

    const token = createToken(user._id.toString());
    return res.status(201).json({
      token,
      user: { id: user._id.toString(), name: user.name, email: user.email },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "Email already in use" });
    }
    return res.status(500).json({ message: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await AuthUser.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = createToken(user._id.toString());
    return res.status(200).json({
      token,
      user: { id: user._id.toString(), name: user.name, email: user.email },
    });
  } catch (error) {
    return res.status(500).json({ message: "Login failed" });
  }
});

const handlePasswordUpdate = async (req, res) => {
  try {
    const currentPassword = req.body.currentPassword ?? req.body.oldPassword;
    const { newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "currentPassword and newPassword are required" });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = await AuthUser.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update password" });
  }
};

router.post("/change-password", auth, handlePasswordUpdate);
router.post("/update-password", auth, handlePasswordUpdate);

router.get("/me", auth, async (req, res) => {
  try {
    const user = await AuthUser.findById(req.user.id).select("name email");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.status(200).json({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch user" });
  }
});

router.post("/logout", (req, res) => {
  return res.status(200).json({ message: "Logged out" });
});

module.exports = router;
