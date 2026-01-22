const cron = require("node-cron");
const mongoose = require("mongoose");
const ManagedUser = require("../model/ManagedUser");
const { isWhatsappConfigured, sendExpiryWhatsApp } = require("../services/whatsapp");

const LOG_PREFIX = "[expiry-notifier]";

const getDateRangeForDaysFromNow = (daysFromNow) => {
  const baseDate = new Date();
  const targetDate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + daysFromNow
  );

  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(targetDate);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const runExpiryNotifier = async () => {
  if (!isWhatsappConfigured()) {
    console.log(`${LOG_PREFIX} Twilio WhatsApp is not configured. Skipping run.`);
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    console.log(`${LOG_PREFIX} MongoDB is not connected. Skipping run.`);
    return;
  }

  const { start, end } = getDateRangeForDaysFromNow(1);

  const users = await ManagedUser.find({
    expiryDate: { $gte: start, $lte: end },
    phoneNumber: { $exists: true, $ne: "" },
    expiryNoticeSentFor: { $ne: start },
  }).sort({ createdAt: 1 });

  if (users.length === 0) {
    console.log(`${LOG_PREFIX} No users with expiry tomorrow.`);
    return;
  }

  for (const user of users) {
    try {
      const result = await sendExpiryWhatsApp(user, user.expiryDate);
      if (result.skipped) {
        console.log(
          `${LOG_PREFIX} Skipped user ${user._id} (${result.reason}).`
        );
        continue;
      }

      await ManagedUser.updateOne(
        { _id: user._id },
        {
          $set: {
            expiryNoticeSentFor: start,
            expiryNoticeSentAt: new Date(),
          },
        }
      );

      console.log(`${LOG_PREFIX} Sent WhatsApp to ${user._id} (${result.sid}).`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed for user ${user._id}:`, error.message);
    }
  }
};

const scheduleExpiryNotifier = () => {
  const schedule = process.env.EXPIRY_NOTICE_CRON || "0 9 * * *";
  const timezone = process.env.EXPIRY_NOTICE_TZ;
  const runOnStart = process.env.EXPIRY_NOTICE_RUN_ON_START === "true";

  if (!cron.validate(schedule)) {
    console.error(`${LOG_PREFIX} Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, runExpiryNotifier, {
    timezone: timezone || undefined,
  });

  console.log(`${LOG_PREFIX} Scheduled with cron: ${schedule}`);

  if (runOnStart) {
    runExpiryNotifier().catch((error) => {
      console.error(`${LOG_PREFIX} Startup run failed:`, error.message);
    });
  }
};

module.exports = scheduleExpiryNotifier;
