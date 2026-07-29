DROP INDEX IF EXISTS "Server_host_port_key";
CREATE INDEX IF NOT EXISTS "Server_host_port_idx" ON "Server"("host", "port");
