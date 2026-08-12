/*
  Warnings:

  - A unique constraint covering the columns `[cartId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accessToken]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `accessToken` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DeliveryQuoteStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_QUOTE', 'QUOTED');

-- AlterEnum
ALTER TYPE "OrderFulfilmentStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "accessToken" TEXT NOT NULL,
ADD COLUMN     "cartId" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryQuoteStatus" "DeliveryQuoteStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Order_cartId_key" ON "Order"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessToken_key" ON "Order"("accessToken");
