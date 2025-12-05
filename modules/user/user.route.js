import express from "express";
import {
  registerUser,
  loginUser,
  forgotPasswordOTPsend,
  resetPassword,
  verifyForgotPasswordOTP,
  updateImage,
  updateUserDetails,
  changePassword,
  sendMailToAdmin,
  getMe,
  googleLogin,
  googleCallback,
  authenticateUser,
  updatePassword,
  disableAccount,
  enableAccount,
  deleteAccount,
  logoutUser,
  getDevices,
  removeDevice,
} from "./user.controller.js";
import { upload } from "../../config/Multer.config.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";
// Professional Verification
import { submitProfessionalVerification, getProfessionalVerificationStatus } from "./professional.controller.js";


const router = express.Router();

// Test route
router.get("/test", (req, res) => {
  res.send("User route connected");
});

// File upload route
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }
  res
    .status(200)
    .send({ message: "File uploaded successfully", file: req.file });
});

// Register a user
router.post("/registerUser", registerUser);

// Log in a user
router.post("/login", loginUser);

// Google login route (redirect to Google)
router.get("/auth/google", googleLogin);

// Google callback route (after successful authentication)
router.get("/auth/google/callback", googleCallback);

// logout
router.get("/auth/google/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// Forget password
router.post("/forget_pass", forgotPasswordOTPsend);
router.post("/checkForgetPassOtp", verifyForgotPasswordOTP);
router.post("/resetPass", resetPassword);
router.post("/change-password", verifyUser("normal"), changePassword);

// Update user image
router.put(
  "/update-user-details",
  verifyUser("normal", "premium", "admin"),
  updateUserDetails
);

router.put(
  "/update-image",
  upload.single("profilePicture"),
  verifyUser("normal", "premium", "admin"),
  updateImage
);

// Support
router.post("/sende-mail", verifyUser("USER"), sendMailToAdmin);

//get me
router.get("/get-me", authenticateUser, getMe);
//update pass
router.put("/updatePass", authenticateUser, updatePassword);

// Disable account
router.put("/disable-account", authenticateUser, disableAccount);

// Enable account
router.put("/enable-account", authenticateUser, enableAccount);

// Delete account
router.delete("/delete-account", authenticateUser, deleteAccount);

// Logout
router.get("/logout", authenticateUser, logoutUser);

// Device Management
router.get("/devices", authenticateUser, getDevices);
router.delete("/devices/:deviceId", authenticateUser, removeDevice);


router.post(
  "/professional-verification",
  authenticateUser,
  upload.fields([
    { name: "identity_document", maxCount: 1 },
    { name: "address_document", maxCount: 1 },
    { name: "business_registration", maxCount: 1 },
  ]),
  submitProfessionalVerification
);

router.get("/professional-verification", authenticateUser, getProfessionalVerificationStatus);

export default router;
