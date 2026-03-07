-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_fromCurrency_toCurrency_effectiveDate_idx" ON "ExchangeRate"("fromCurrency", "toCurrency", "effectiveDate");

-- CreateIndex
CREATE INDEX "ExchangeRate_effectiveDate_idx" ON "ExchangeRate"("effectiveDate");
