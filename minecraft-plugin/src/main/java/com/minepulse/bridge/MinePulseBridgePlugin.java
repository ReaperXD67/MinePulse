package com.minepulse.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;

public final class MinePulseBridgePlugin extends JavaPlugin implements Listener, CommandExecutor {
  private final Gson gson = new Gson();
  private final Random random = new Random();
  private final Map<UUID, Location> lastLocation = new ConcurrentHashMap<>();
  private final Map<UUID, Long> lastActiveAt = new ConcurrentHashMap<>();
  private final Map<UUID, Integer> movementScoreSinceHeartbeat = new ConcurrentHashMap<>();
  private final Map<UUID, Integer> activityEventsSinceHeartbeat = new ConcurrentHashMap<>();
  private final Map<UUID, Challenge> challenges = new ConcurrentHashMap<>();
  private HttpClient http;
  private String apiBaseUrl;
  private String serverId;
  private String pluginSecret;

  @Override
  public void onEnable() {
    saveDefaultConfig();
    http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    apiBaseUrl = trimTrailingSlash(getConfig().getString("api-base-url", "http://localhost:3000"));
    serverId = getConfig().getString("server-id", "");
    pluginSecret = getConfig().getString("plugin-secret", "");

    Bukkit.getPluginManager().registerEvents(this, this);
    if (getCommand("mpcode") != null) {
      getCommand("mpcode").setExecutor(this);
    }

    long heartbeatTicks = Math.max(5, getConfig().getLong("heartbeat-interval-seconds", 20)) * 20L;
    long purchaseTicks = Math.max(5, getConfig().getLong("purchase-poll-seconds", 15)) * 20L;

    Bukkit.getScheduler().runTaskTimer(this, this::sendHeartbeats, 80L, heartbeatTicks);
    Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::pollPurchases, 120L, purchaseTicks);
    getLogger().info("MinePulse bridge enabled. Configure server-id and plugin-secret from the owner panel.");
  }

  @EventHandler
  public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    lastLocation.put(player.getUniqueId(), player.getLocation());
    lastActiveAt.put(player.getUniqueId(), now());
    movementScoreSinceHeartbeat.put(player.getUniqueId(), 0);
    activityEventsSinceHeartbeat.put(player.getUniqueId(), 0);
  }

  @EventHandler
  public void onQuit(PlayerQuitEvent event) {
    UUID id = event.getPlayer().getUniqueId();
    lastLocation.remove(id);
    lastActiveAt.remove(id);
    movementScoreSinceHeartbeat.remove(id);
    activityEventsSinceHeartbeat.remove(id);
    challenges.remove(id);
  }

  @EventHandler
  public void onMove(PlayerMoveEvent event) {
    Player player = event.getPlayer();
    Location from = lastLocation.get(player.getUniqueId());
    Location to = event.getTo();
    double minimum = getConfig().getDouble("movement.minimum-distance-squared", 0.04);

    if (from == null || to == null || !from.getWorld().equals(to.getWorld()) || from.distanceSquared(to) >= minimum) {
      if (from != null && to != null && from.getWorld().equals(to.getWorld())) {
        int score = (int) Math.min(1_000_000, Math.round(from.distanceSquared(to) * 1000));
        movementScoreSinceHeartbeat.merge(player.getUniqueId(), score, Integer::sum);
      }
      lastLocation.put(player.getUniqueId(), to);
      markActive(player);
    }
  }

  @EventHandler
  public void onChat(AsyncPlayerChatEvent event) {
    markActive(event.getPlayer());
  }

  @EventHandler
  public void onCommand(PlayerCommandPreprocessEvent event) {
    markActive(event.getPlayer());
  }

  @EventHandler
  public void onInventory(InventoryClickEvent event) {
    if (event.getWhoClicked() instanceof Player player) {
      markActive(player);
    }
  }

  @Override
  public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (!(sender instanceof Player player)) {
      sender.sendMessage("Only players can confirm a MinePulse challenge.");
      return true;
    }

    Challenge challenge = challenges.get(player.getUniqueId());
    if (challenge == null || args.length == 0) {
      player.sendMessage("No MinePulse challenge is waiting.");
      return true;
    }

    long answerWindow = getConfig().getLong("challenge.answer-window-seconds", 90);
    if (now() - challenge.createdAt > answerWindow) {
      player.sendMessage("That MinePulse challenge expired. Wait for the next check.");
      return true;
    }

    if (challenge.code.equals(args[0])) {
      challenge.passed = true;
      markActive(player);
      player.sendMessage("MinePulse activity confirmed.");
      return true;
    }

    player.sendMessage("That MinePulse code is not correct.");
    return true;
  }

  private void sendHeartbeats() {
    if (!configured()) {
      return;
    }

    for (Player player : Bukkit.getOnlinePlayers()) {
      JsonObject payload = buildHeartbeatPayload(player);
      String playerName = player.getName();
      Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
        try {
          JsonObject response = post("/api/plugin/heartbeat", payload);
          if (response.has("requiresChallenge") && response.get("requiresChallenge").getAsBoolean()) {
            Bukkit.getScheduler().runTask(this, () -> issueChallenge(player, now()));
          }
        } catch (Exception error) {
          getLogger().warning("Heartbeat failed for " + playerName + ": " + error.getMessage());
        }
      });
    }
  }

  private JsonObject buildHeartbeatPayload(Player player) {
    long current = now();
    boolean afk = isAfk(player, current);
    Boolean challengePassed = challengeState(player, current);
    int movementScore = Math.min(1_000_000, movementScoreSinceHeartbeat.getOrDefault(player.getUniqueId(), 0));
    int activityEvents = Math.min(10_000, activityEventsSinceHeartbeat.getOrDefault(player.getUniqueId(), 0));
    movementScoreSinceHeartbeat.put(player.getUniqueId(), 0);
    activityEventsSinceHeartbeat.put(player.getUniqueId(), 0);

    JsonObject payload = new JsonObject();
    payload.addProperty("serverId", serverId);
    payload.addProperty("timestamp", current);
    payload.addProperty("nonce", UUID.randomUUID().toString());
    payload.addProperty("minecraftUuid", player.getUniqueId().toString());
    payload.addProperty("minecraftName", player.getName());
    payload.addProperty("ip", player.getAddress() == null ? "unknown" : player.getAddress().getAddress().getHostAddress());
    payload.addProperty("afk", afk);
    payload.addProperty("movementScore", movementScore);
    payload.addProperty("activityEvents", activityEvents);
    if (challengePassed != null) {
      payload.addProperty("challengePassed", challengePassed);
    }
    payload.addProperty("reportedSeconds", getConfig().getLong("heartbeat-interval-seconds", 20));
    payload.addProperty("pluginVersion", getPluginMeta().getVersion());
    payload.addProperty("signature", signHeartbeat(payload));
    return payload;
  }

  private void pollPurchases() {
    if (!configured()) {
      return;
    }

    JsonObject payload = new JsonObject();
    payload.addProperty("serverId", serverId);
    payload.addProperty("secret", pluginSecret);
    payload.addProperty("limit", 25);

    try {
      JsonObject response = post("/api/plugin/purchases/pull", payload);
      JsonArray purchases = response.getAsJsonArray("purchases");
      if (purchases == null) {
        return;
      }

      for (int i = 0; i < purchases.size(); i++) {
        JsonObject purchase = purchases.get(i).getAsJsonObject();
        deliverPurchase(purchase);
      }
    } catch (Exception error) {
      getLogger().warning("Purchase polling failed: " + error.getMessage());
    }
  }

  private void deliverPurchase(JsonObject purchase) {
    String purchaseId = purchase.get("id").getAsString();
    String command = purchase.get("command").getAsString();

    Bukkit.getScheduler().runTask(this, () -> {
      boolean delivered = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
      Bukkit.getScheduler().runTaskAsynchronously(this, () -> acknowledge(purchaseId, delivered));
    });
  }

  private void acknowledge(String purchaseId, boolean delivered) {
    JsonObject payload = new JsonObject();
    payload.addProperty("serverId", serverId);
    payload.addProperty("secret", pluginSecret);
    payload.addProperty("purchaseId", purchaseId);
    payload.addProperty("status", delivered ? "DELIVERED" : "FAILED");
    payload.addProperty("message", delivered ? "Command executed" : "Command dispatcher returned false");

    try {
      post("/api/plugin/purchases/ack", payload);
    } catch (Exception error) {
      getLogger().warning("Purchase acknowledge failed: " + error.getMessage());
    }
  }

  private JsonObject post(String path, JsonObject payload) throws IOException, InterruptedException {
    HttpRequest request = HttpRequest.newBuilder()
      .uri(URI.create(apiBaseUrl + path))
      .timeout(Duration.ofSeconds(10))
      .header("Content-Type", "application/json")
      .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(payload)))
      .build();

    HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() < 200 || response.statusCode() >= 300) {
      throw new IOException("HTTP " + response.statusCode() + " " + response.body());
    }

    return gson.fromJson(response.body(), JsonObject.class);
  }

  private boolean configured() {
    return serverId != null && !serverId.isBlank() && pluginSecret != null && !pluginSecret.isBlank();
  }

  private void markActive(Player player) {
    lastActiveAt.put(player.getUniqueId(), now());
    activityEventsSinceHeartbeat.merge(player.getUniqueId(), 1, Integer::sum);
  }

  private boolean isAfk(Player player, long current) {
    long timeout = getConfig().getLong("afk-timeout-seconds", 90);
    long lastActive = lastActiveAt.getOrDefault(player.getUniqueId(), current);
    return current - lastActive > timeout;
  }

  private Boolean challengeState(Player player, long current) {
    if (!getConfig().getBoolean("challenge.enabled", true)) {
      return null;
    }

    Challenge challenge = challenges.get(player.getUniqueId());
    if (challenge == null) {
      return null;
    }

    if (challenge.passed) {
      return true;
    }

    return !getConfig().getBoolean("challenge.required", true);
  }

  private String signHeartbeat(JsonObject payload) {
    String challengeState = payload.has("challengePassed")
      ? String.valueOf(payload.get("challengePassed").getAsBoolean())
      : "none";
    String canonical = String.join(
      "\n",
      payload.get("serverId").getAsString(),
      payload.get("timestamp").getAsString(),
      payload.get("nonce").getAsString(),
      payload.get("minecraftUuid").getAsString(),
      payload.get("minecraftName").getAsString(),
      String.valueOf(payload.get("afk").getAsBoolean()),
      payload.get("movementScore").getAsString(),
      payload.get("activityEvents").getAsString(),
      challengeState,
      payload.get("reportedSeconds").getAsString(),
      payload.get("pluginVersion").getAsString()
    );

    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(pluginSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception error) {
      throw new IllegalStateException("Could not sign MinePulse heartbeat", error);
    }
  }

  private void issueChallenge(Player player, long current) {
    if (!getConfig().getBoolean("challenge.enabled", true)) {
      return;
    }

    Challenge existing = challenges.get(player.getUniqueId());
    long interval = getConfig().getLong("challenge.interval-seconds", 300);
    if (existing != null && current - existing.createdAt < interval) {
      return;
    }

    String code = String.valueOf(1000 + random.nextInt(9000));
    challenges.put(player.getUniqueId(), new Challenge(code, current));
    player.sendMessage("MinePulse check: type /mpcode " + code + " to keep earning rewards.");
  }

  private long now() {
    return System.currentTimeMillis() / 1000L;
  }

  private String trimTrailingSlash(String value) {
    if (value == null || value.isBlank()) {
      return "http://localhost:3000";
    }
    return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
  }

  private static final class Challenge {
    private final String code;
    private final long createdAt;
    private boolean passed;

    private Challenge(String code, long createdAt) {
      this.code = code;
      this.createdAt = createdAt;
      this.passed = false;
    }
  }
}
