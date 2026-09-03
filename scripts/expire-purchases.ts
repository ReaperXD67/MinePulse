import { prisma } from "@/lib/prisma";
import { refundExpiredPurchases } from "@/lib/purchase-lifecycle";

const BATCH_SIZE = 250;
const MAX_BATCHES_PER_RUN = 100;

async function main() {
  let scanned = 0;
  let refunded = 0;
  let batches = 0;

  while (batches < MAX_BATCHES_PER_RUN) {
    const result = await refundExpiredPurchases({ batchSize: BATCH_SIZE });
    batches += 1;
    scanned += result.scanned;
    refunded += result.refunded;
    if (result.scanned < BATCH_SIZE) break;
  }

  console.log(JSON.stringify({ scanned, refunded, batches }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
