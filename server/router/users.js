const express = require("express");
const ManagedUser = require("../model/ManagedUser");
const auth = require("../middlewares/auth");
const { sendExpiryWhatsApp } = require("../services/whatsapp");

const router = express.Router();

const parseExpiryDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const getTomorrowRange = () => {
  const baseDate = new Date();
  const targetDate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + 1
  );

  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(targetDate);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const isDateInRange = (date, start, end) =>
  date instanceof Date && date >= start && date <= end;

const trySendExpiryNotice = async (managedUser) => {
  if (!managedUser?.expiryDate) {
    return { skipped: true, reason: "missing_expiry" };
  }

  const { start, end } = getTomorrowRange();
  if (!isDateInRange(managedUser.expiryDate, start, end)) {
    return { skipped: true, reason: "not_tomorrow" };
  }

  if (
    managedUser.expiryNoticeSentFor &&
    new Date(managedUser.expiryNoticeSentFor).getTime() === start.getTime()
  ) {
    return { skipped: true, reason: "already_sent" };
  }

  const result = await sendExpiryWhatsApp(managedUser, managedUser.expiryDate);
  if (!result.skipped) {
    await ManagedUser.updateOne(
      { _id: managedUser._id },
      {
        $set: {
          expiryNoticeSentFor: start,
          expiryNoticeSentAt: new Date(),
        },
      }
    );
  }

  return result;
};

router.use(auth);

router.get("/", async (req, res) => {
  try {
    const users = await ManagedUser.find({ ownerId: req.user.id }).sort({
      createdAt: -1,
    });
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch managed users" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, houseNumber, phoneNumber, expiryDate } = req.body;
    if (!name || !houseNumber || !phoneNumber || !expiryDate) {
      return res
        .status(400)
        .json({ message: "name, houseNumber, phoneNumber, and expiryDate are required" });
    }

    const parsedExpiryDate = parseExpiryDate(expiryDate);
    if (!parsedExpiryDate) {
      return res.status(400).json({ message: "expiryDate must be a valid date" });
    }

    const managedUser = await ManagedUser.create({
      ownerId: req.user.id,
      name: String(name).trim(),
      houseNumber: String(houseNumber).trim(),
      phoneNumber: String(phoneNumber).trim(),
      expiryDate: parsedExpiryDate,
    });

    try {
      await trySendExpiryNotice(managedUser);
    } catch (error) {
      console.error("Failed to send expiry notice:", error.message);
    }

    return res.status(201).json(managedUser);
  } catch (error) {
    return res.status(500).json({ message: "Failed to create managed user" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updates = {};

    let shouldAttemptNotice = false;

    if (req.body.name !== undefined) {
      updates.name = String(req.body.name).trim();
    }
    if (req.body.houseNumber !== undefined) {
      updates.houseNumber = String(req.body.houseNumber).trim();
    }
    if (req.body.phoneNumber !== undefined) {
      updates.phoneNumber = String(req.body.phoneNumber).trim();
      updates.expiryNoticeSentFor = null;
      updates.expiryNoticeSentAt = null;
      shouldAttemptNotice = true;
    }
    if (req.body.expiryDate !== undefined) {
      const parsedExpiryDate = parseExpiryDate(req.body.expiryDate);
      if (!parsedExpiryDate) {
        return res.status(400).json({ message: "expiryDate must be a valid date" });
      }
      updates.expiryDate = parsedExpiryDate;
      updates.expiryNoticeSentFor = null;
      updates.expiryNoticeSentAt = null;
      shouldAttemptNotice = true;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No fields provided for update" });
    }

    const updatedUser = await ManagedUser.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user.id },
      updates,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Managed user not found" });
    }

    if (shouldAttemptNotice) {
      try {
        await trySendExpiryNotice(updatedUser);
      } catch (error) {
        console.error("Failed to send expiry notice:", error.message);
      }
    }

    return res.status(200).json(updatedUser);
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(400).json({ message: "Invalid user id" });
    }
    return res.status(500).json({ message: "Failed to update managed user" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deletedUser = await ManagedUser.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.user.id,
    });

    if (!deletedUser) {
      return res.status(404).json({ message: "Managed user not found" });
    }

    return res.status(200).json({ message: "Managed user deleted" });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(400).json({ message: "Invalid user id" });
    }
    return res.status(500).json({ message: "Failed to delete managed user" });
  }
});

module.exports = router;
