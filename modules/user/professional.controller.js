import { PrismaClient } from "@prisma/client";
import { uploadFileToS3 } from "../libs/s3Uploader.js";

const prisma = new PrismaClient();

export const submitProfessionalVerification = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Extract text fields
    const {
      identity_document_type,
      address_document_type,
      payout_method,
      bank_account_holder_name,
      bank_name,
      bank_account_number,
      business_type,
      business_name,
      tax_id,
    } = req.body;

    // Extract files
    // req.files is an object with keys as field names and values as arrays of files
    const identityDocFile = req.files?.["identity_document"]?.[0];
    const addressDocFile = req.files?.["address_document"]?.[0];
    const businessRegFile = req.files?.["business_registration"]?.[0];

    // Validate required fields (basic validation)
    if (
      !identity_document_type ||
      !identityDocFile ||
      !address_document_type ||
      !addressDocFile ||
      !payout_method ||
      !bank_account_holder_name ||
      !bank_name ||
      !bank_account_number ||
      !business_type ||
      !business_name ||
      !businessRegFile ||
      !tax_id
    ) {
      return res
        .status(400)
        .json({ message: "All fields and documents are required." });
    }

    // Upload files to S3
    let identityUrl, addressUrl, businessUrl;

    try {
      const identityUpload = await uploadFileToS3(
        identityDocFile,
        "verification/identity"
      );
      identityUrl = identityUpload.Location || identityUpload.url; // Handle different return structures

      const addressUpload = await uploadFileToS3(
        addressDocFile,
        "verification/address"
      );
      addressUrl = addressUpload.Location || addressUpload.url;

      const businessUpload = await uploadFileToS3(
        businessRegFile,
        "verification/business"
      );
      businessUrl = businessUpload.Location || businessUpload.url;
    } catch (uploadError) {
      console.error("S3 Upload Error:", uploadError);
      return res.status(500).json({
        message: "Failed to upload documents",
        error: uploadError.message,
      });
    }

    const verification = await prisma.professionalVerification.upsert({
      where: { user_id: userId },
      update: {
        identity_document_type,
        identity_document_url: identityUrl,
        address_document_type,
        address_document_url: addressUrl,
        payout_method,
        bank_account_holder_name,
        bank_name,
        bank_account_number,
        business_type,
        business_name,
        business_registration_url: businessUrl,
        tax_id,
        status: "PENDING",
      },
      create: {
        user_id: userId,
        identity_document_type,
        identity_document_url: identityUrl,
        address_document_type,
        address_document_url: addressUrl,
        payout_method,
        bank_account_holder_name,
        bank_name,
        bank_account_number,
        business_type,
        business_name,
        business_registration_url: businessUrl,
        tax_id,
        status: "PENDING",
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        type: "Professional",
      },
    });

    // Optionally update verification status to APPROVED if auto-approving
    await prisma.professionalVerification.update({
      where: { id: verification.id },
      data: { status: "APPROVED" },
    });

    return res.status(200).json({
      success: true,
      message:
        "Professional verification submitted successfully. User type updated to Professional.",
      data: verification,
    });
  } catch (error) {
    console.error("Error submitting professional verification:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getProfessionalVerificationStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const verification = await prisma.professionalVerification.findUnique({
      where: { user_id: userId },
    });

    if (!verification) {
      return res.status(404).json({ message: "No verification record found." });
    }

    return res.status(200).json({ success: true, data: verification });
  } catch (error) {
    console.error("Error fetching verification status:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
