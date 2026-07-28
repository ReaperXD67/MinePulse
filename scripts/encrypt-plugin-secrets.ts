import { prisma } from "../lib/prisma";
import { protectPluginSecret } from "../lib/plugin-credentials";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const servers = await prisma.server.findMany({ select: { id: true, pluginSecret: true } });
  let encrypted = 0;

  for (const server of servers) {
    if (server.pluginSecret.startsWith("enc:v1:")) continue;
    await prisma.server.update({
      where: { id: server.id },
      data: { pluginSecret: protectPluginSecret(server.pluginSecret) }
    });
    encrypted += 1;
  }

  console.log(`Encrypted ${encrypted} plugin credential(s); ${servers.length - encrypted} already protected.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
