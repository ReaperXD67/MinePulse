CREATE UNIQUE INDEX IF NOT EXISTS "Server_active_host_port_key"
ON "Server"("host", "port")
WHERE "status" <> 'REMOVED';
