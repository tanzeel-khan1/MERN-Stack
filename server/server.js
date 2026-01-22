const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./router/auth");
const userRoutes = require("./router/users");
const productRoutes = require("./router/product-router");
const scheduleExpiryNotifier = require("./jobs/expiry-notifier");

require("dotenv").config();

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    credentials: true,
  })
);

connectDB();
scheduleExpiryNotifier();

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api", productRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
