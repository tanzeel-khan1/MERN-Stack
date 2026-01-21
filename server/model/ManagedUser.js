const mongoose = require("mongoose");

const managedUserSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthUser",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    houseNumber: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    expiryDate: { type: Date, required: true },
  },
  { timestamps: true }
);

managedUserSchema.index({ ownerId: 1, expiryDate: 1 });

module.exports = mongoose.model("ManagedUser", managedUserSchema);
