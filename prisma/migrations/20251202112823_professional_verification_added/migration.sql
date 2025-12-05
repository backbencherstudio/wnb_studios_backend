/*
  Warnings:

  - The `type` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Type" AS ENUM ('Individual', 'Professional');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "type",
ADD COLUMN     "type" "Type";

-- CreateTable
CREATE TABLE "professional_verifications" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "identity_document_type" TEXT,
    "identity_document_url" TEXT,
    "address_document_type" TEXT,
    "address_document_url" TEXT,
    "payout_method" TEXT,
    "bank_account_holder_name" TEXT,
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "business_type" TEXT,
    "business_name" TEXT,
    "business_registration_url" TEXT,
    "tax_id" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "professional_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professional_verifications_user_id_key" ON "professional_verifications"("user_id");

-- AddForeignKey
ALTER TABLE "professional_verifications" ADD CONSTRAINT "professional_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
