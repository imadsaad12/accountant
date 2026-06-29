-- AlterTable
ALTER TABLE `SupplierBill` ADD COLUMN `productId` VARCHAR(191) NULL,
    ADD COLUMN `quantity` DOUBLE NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `SupplierBill_productId_idx` ON `SupplierBill`(`productId`);

-- AddForeignKey
ALTER TABLE `SupplierBill` ADD CONSTRAINT `SupplierBill_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
