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
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
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
  private final Map<UUID, Location> lastLocation = new ConcurrentHashMap<>();
  private final Map<UUID, Long> lastActiveAt = new ConcurrentHashMap<>();
  private final Map<UUID, Integer> movementScoreSinceHeartbeat = new ConcurrentHashMap<>();
  private final Map<UUID, Integer> activityEventsSinceHeartbeat = new ConcurrentHashMap<>();
  private final Map<UUID, Challenge> challenges = new ConcurrentHashMap<>();
  private HttpClient http;
  private String apiBaseUrl;
  private String serverId;
  private String pluginSecret;
  private volatile PluginPolicy policy = PluginPolicy.defaults();
  private long lastHeartbeatBatchAt;
  private long lastPurchasePollAt;

  @Override
  public void onEnable() {
    saveDefaultConfig();
    http = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(8))
      .version(HttpClient.Version.HTTP_1_1)
      .build();
    apiBaseUrl = trimTrailingSlash(connectionValue("MINEPULSE_API_BASE_URL", "api-base-url", "http://localhost:3000"));
    serverId = connectionValue("MINEPULSE_SERVER_ID", "server-id", "");
    pluginSecret = connectionValue("MINEPULSE_PLUGIN_SECRET", "plugin-secret", "");

    Bukkit.getPluginManager().registerEvents(this, this);
    registerCommand("answer");
    registerCommand("points");
    registerCommand("pool");
    registerCommand("minepulse");
    registerCommand("mpcode");

    Bukkit.getScheduler().runTaskTimer(this, this::tickBridge, 40L, 100L);
    Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::syncPolicy, 20L, 1200L);
    getLogger().info("MinePulse bridge enabled. Protection policy will sync from the website.");
  }

  private void registerCommand(String name) {
    if (getCommand(name) != null) {
      getCommand(name).setExecutor(this);
    }
  }

  private void tickBridge() {
    if (!configured()) {
      return;
    }

    long current = now();
    if (current - lastHeartbeatBatchAt >= policy.heartbeatIntervalSeconds) {
      lastHeartbeatBatchAt = current;
      sendHeartbeats();
    }
    if (current - lastPurchasePollAt >= policy.purchasePollSeconds) {
      lastPurchasePollAt = current;
      Bukkit.getScheduler().runTaskAsynchronously(this, this::pollPurchases);
    }
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
    double minimumSquared = policy.minimumMovementDistance * policy.minimumMovementDistance;

    if (from == null || to == null || !from.getWorld().equals(to.getWorld()) || from.distanceSquared(to) >= minimumSquared) {
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
  public void onCommandEvent(PlayerCommandPreprocessEvent event) {
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
    String name = command.getName().toLowerCase(Locale.ROOT);
    if (name.equals("answer") || name.equals("mpcode")) {
      return answerChallenge(sender, args);
    }

    if (!(sender instanceof Player player)) {
      sender.sendMessage("Only players can view MinePulse statistics.");
      return true;
    }

    if (name.equals("minepulse") && args.length > 0 && args[0].equalsIgnoreCase("help")) {
      showHelp(player);
      return true;
    }

    if (name.equals("minepulse") && args.length > 0 && args[0].equalsIgnoreCase("link")) {
      if (args.length < 2) {
        player.sendMessage(prefix() + ChatColor.YELLOW + "Use /minepulse link <code> from your MinePulse account.");
      } else {
        linkAccount(player, args[1]);
      }
      return true;
    }

    boolean poolOnly = name.equals("pool") || (name.equals("minepulse") && args.length > 0 && args[0].equalsIgnoreCase("pool"));
    fetchPlayerStats(player, poolOnly);
    return true;
  }

  private boolean answerChallenge(CommandSender sender, String[] args) {
    if (!(sender instanceof Player player)) {
      sender.sendMessage("Only players can answer a MinePulse activity check.");
      return true;
    }

    Challenge challenge = challenges.get(player.getUniqueId());
    if (challenge == null) {
      player.sendMessage(prefix() + ChatColor.GRAY + "No activity check is waiting.");
      return true;
    }
    if (Instant.now().isAfter(challenge.expiresAt)) {
      player.sendMessage(prefix() + ChatColor.RED + "That check expired. A new question will arrive shortly.");
      return true;
    }
    if (args.length == 0) {
      player.sendMessage(prefix() + ChatColor.YELLOW + challenge.question);
      return true;
    }

    challenge.submittedAnswer = args[0];
    markActive(player);
    player.sendMessage(prefix() + ChatColor.AQUA + "Answer submitted. MinePulse is verifying it.");
    return true;
  }

  private void showHelp(Player player) {
    player.sendMessage(prefix() + ChatColor.WHITE + "/points" + ChatColor.GRAY + " - wallet and session rewards");
    player.sendMessage(prefix() + ChatColor.WHITE + "/pool" + ChatColor.GRAY + " - this server's campaign balance");
    player.sendMessage(prefix() + ChatColor.WHITE + "/answer <value>" + ChatColor.GRAY + " - answer an activity check");
    player.sendMessage(prefix() + ChatColor.WHITE + "/minepulse link <code>" + ChatColor.GRAY + " - connect your website account");
  }

  private void linkAccount(Player player, String code) {
    JsonObject payload = credentials();
    payload.addProperty("code", code);
    payload.addProperty("minecraftUuid", player.getUniqueId().toString());
    payload.addProperty("minecraftName", player.getName());
    Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
      try {
        JsonObject response = post("/api/plugin/link", payload);
        String message = response.has("message") ? response.get("message").getAsString() : "Minecraft account linked.";
        Bukkit.getScheduler().runTask(this, () -> player.sendMessage(prefix() + ChatColor.GREEN + message));
      } catch (Exception error) {
        Bukkit.getScheduler().runTask(this, () -> player.sendMessage(prefix() + ChatColor.RED + "Link failed: " + error.getMessage()));
      }
    });
  }

  private void sendHeartbeats() {
    for (Player player : Bukkit.getOnlinePlayers()) {
      JsonObject payload = buildHeartbeatPayload(player);
      UUID playerId = player.getUniqueId();
      String playerName = player.getName();
      Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
        try {
          JsonObject response = post("/api/plugin/heartbeat", payload);
          Bukkit.getScheduler().runTask(this, () -> applyHeartbeatResponse(playerId, response));
        } catch (Exception error) {
          getLogger().warning("Heartbeat failed for " + playerName + ": " + error.getMessage());
        }
      });
    }
  }

  private JsonObject buildHeartbeatPayload(Player player) {
    long current = now();
    boolean afk = isAfk(player, current);
    int movementScore = Math.min(1_000_000, movementScoreSinceHeartbeat.getOrDefault(player.getUniqueId(), 0));
    int activityEvents = Math.min(10_000, activityEventsSinceHeartbeat.getOrDefault(player.getUniqueId(), 0));
    Challenge challenge = challenges.get(player.getUniqueId());
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
    if (challenge != null) {
      payload.addProperty("challengeId", challenge.id);
      if (challenge.submittedAnswer != null) {
        payload.addProperty("challengeAnswer", challenge.submittedAnswer);
      }
    }
    payload.addProperty("reportedSeconds", policy.heartbeatIntervalSeconds);
    payload.addProperty("pluginVersion", getPluginMeta().getVersion());
    payload.addProperty("signature", signHeartbeat(payload));
    return payload;
  }

  private void applyHeartbeatResponse(UUID playerId, JsonObject response) {
    Player player = Bukkit.getPlayer(playerId);
    if (player == null) {
      return;
    }

    boolean accepted = response.has("challengeAccepted") && response.get("challengeAccepted").getAsBoolean();
    if (accepted) {
      challenges.remove(playerId);
      player.sendMessage(prefix() + ChatColor.GREEN + "Activity confirmed. Rewards resumed.");
    }

    if (response.has("challenge") && !response.get("challenge").isJsonNull()) {
      JsonObject data = response.getAsJsonObject("challenge");
      String id = data.get("id").getAsString();
      Challenge current = challenges.get(playerId);
      if (current != null && current.id.equals(id) && current.submittedAnswer != null && !accepted) {
        current.submittedAnswer = null;
        player.sendMessage(prefix() + ChatColor.RED + "That answer was not correct. Try again with /answer <value>.");
      }
      if (current == null || !current.id.equals(id)) {
        Challenge challenge = new Challenge(
          id,
          data.get("question").getAsString(),
          Instant.parse(data.get("expiresAt").getAsString()),
          data.has("required") && data.get("required").getAsBoolean()
        );
        challenges.put(playerId, challenge);
        player.sendMessage("");
        player.sendMessage(prefix() + ChatColor.GOLD + ChatColor.BOLD + "ACTIVITY CHECK");
        player.sendMessage(ChatColor.YELLOW + challenge.question);
        player.sendMessage(ChatColor.GRAY + (challenge.required
          ? "Rewards pause until MinePulse verifies your answer."
          : "This server uses optional activity checks."));
        player.sendMessage("");
      }
    }
  }

  private void syncPolicy() {
    if (!configured()) {
      return;
    }

    JsonObject payload = credentials();
    try {
      JsonObject response = post("/api/plugin/config", payload);
      JsonObject data = response.getAsJsonObject("policy");
      PluginPolicy next = PluginPolicy.from(data);
      if (next.revision != policy.revision) {
        getLogger().info("MinePulse website policy synced at revision " + next.revision + ".");
      }
      policy = next;
    } catch (Exception error) {
      getLogger().warning("Policy sync failed; keeping the last safe policy: " + error.getMessage());
    }
  }

  private void fetchPlayerStats(Player player, boolean poolOnly) {
    JsonObject payload = credentials();
    payload.addProperty("minecraftUuid", player.getUniqueId().toString());
    Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
      try {
        JsonObject response = post("/api/plugin/player-stats", payload);
        Bukkit.getScheduler().runTask(this, () -> displayStats(player.getUniqueId(), response, poolOnly));
      } catch (Exception error) {
        Bukkit.getScheduler().runTask(this, () -> player.sendMessage(prefix() + ChatColor.RED + "Stats are temporarily unavailable."));
      }
    });
  }

  private void displayStats(UUID playerId, JsonObject response, boolean poolOnly) {
    Player player = Bukkit.getPlayer(playerId);
    if (player == null) {
      return;
    }
    JsonObject server = response.getAsJsonObject("server");
    player.sendMessage(prefix() + ChatColor.WHITE + server.get("name").getAsString());
    player.sendMessage(ChatColor.GRAY + "Campaign pool: " + ChatColor.AQUA + formatNumber(server.get("pointPool").getAsLong())
      + ChatColor.DARK_GRAY + " | " + ChatColor.GRAY + "Rate: " + ChatColor.GREEN + server.get("rewardRatePerSecond").getAsInt() + "/s");
    if (!poolOnly) {
      JsonObject session = response.getAsJsonObject("session");
      player.sendMessage(ChatColor.GRAY + "Wallet: " + ChatColor.GOLD + formatNumber(response.get("walletPoints").getAsLong())
        + ChatColor.DARK_GRAY + " | " + ChatColor.GRAY + "This session earned: " + ChatColor.GREEN + formatNumber(session.get("rewardedPoints").getAsLong()));
      player.sendMessage(ChatColor.GRAY + "Verified play: " + ChatColor.WHITE + duration(session.get("activeSeconds").getAsLong()));
    }
  }

  private void pollPurchases() {
    if (!configured()) {
      return;
    }
    JsonObject payload = credentials();
    payload.addProperty("limit", 25);

    try {
      JsonObject response = post("/api/plugin/purchases/pull", payload);
      JsonArray purchases = response.getAsJsonArray("purchases");
      if (purchases == null) {
        return;
      }
      for (int i = 0; i < purchases.size(); i++) {
        deliverPurchase(purchases.get(i).getAsJsonObject());
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
    JsonObject payload = credentials();
    payload.addProperty("purchaseId", purchaseId);
    payload.addProperty("status", delivered ? "DELIVERED" : "FAILED");
    payload.addProperty("message", delivered ? "Command executed" : "Command dispatcher returned false");
    try {
      post("/api/plugin/purchases/ack", payload);
    } catch (Exception error) {
      getLogger().warning("Purchase acknowledge failed: " + error.getMessage());
    }
  }

  private JsonObject credentials() {
    JsonObject payload = new JsonObject();
    payload.addProperty("serverId", serverId);
    payload.addProperty("secret", pluginSecret);
    return payload;
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
    long lastActive = lastActiveAt.getOrDefault(player.getUniqueId(), current);
    return current - lastActive >= policy.afkTimeoutSeconds;
  }

  private String signHeartbeat(JsonObject payload) {
    String challengeState = payload.has("challengePassed") ? payload.get("challengePassed").getAsString() : "none";
    String challengeId = payload.has("challengeId") ? payload.get("challengeId").getAsString() : "none";
    String challengeAnswer = payload.has("challengeAnswer") ? payload.get("challengeAnswer").getAsString() : "none";
    String canonical = String.join(
      "\n",
      payload.get("serverId").getAsString(),
      payload.get("timestamp").getAsString(),
      payload.get("nonce").getAsString(),
      payload.get("minecraftUuid").getAsString(),
      payload.get("minecraftName").getAsString(),
      payload.get("afk").getAsString(),
      payload.get("movementScore").getAsString(),
      payload.get("activityEvents").getAsString(),
      challengeState,
      challengeId,
      challengeAnswer,
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

  private long now() {
    return System.currentTimeMillis() / 1000L;
  }

  private String trimTrailingSlash(String value) {
    if (value == null || value.isBlank()) {
      return "http://localhost:3000";
    }
    return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
  }

  private String connectionValue(String environmentName, String configPath, String fallback) {
    String environmentValue = System.getenv(environmentName);
    if (environmentValue != null && !environmentValue.isBlank()) {
      return environmentValue.trim();
    }
    return getConfig().getString(configPath, fallback);
  }

  private String prefix() {
    return ChatColor.DARK_GRAY + "[" + ChatColor.AQUA + "MinePulse" + ChatColor.DARK_GRAY + "] ";
  }

  private String formatNumber(long value) {
    return String.format(Locale.US, "%,d", value);
  }

  private String duration(long seconds) {
    return (seconds / 3600) + "h " + ((seconds % 3600) / 60) + "m";
  }

  private static final class Challenge {
    private final String id;
    private final String question;
    private final Instant expiresAt;
    private final boolean required;
    private String submittedAnswer;

    private Challenge(String id, String question, Instant expiresAt, boolean required) {
      this.id = id;
      this.question = question;
      this.expiresAt = expiresAt;
      this.required = required;
    }
  }

  private static final class PluginPolicy {
    private final int revision;
    private final int heartbeatIntervalSeconds;
    private final int purchasePollSeconds;
    private final int afkTimeoutSeconds;
    private final double minimumMovementDistance;

    private PluginPolicy(int revision, int heartbeatIntervalSeconds, int purchasePollSeconds, int afkTimeoutSeconds, double minimumMovementDistance) {
      this.revision = revision;
      this.heartbeatIntervalSeconds = heartbeatIntervalSeconds;
      this.purchasePollSeconds = purchasePollSeconds;
      this.afkTimeoutSeconds = afkTimeoutSeconds;
      this.minimumMovementDistance = minimumMovementDistance;
    }

    private static PluginPolicy defaults() {
      return new PluginPolicy(0, 20, 15, 300, 0.2);
    }

    private static PluginPolicy from(JsonObject data) {
      return new PluginPolicy(
        data.get("revision").getAsInt(),
        data.get("heartbeatIntervalSeconds").getAsInt(),
        data.get("purchasePollSeconds").getAsInt(),
        data.get("afkTimeoutSeconds").getAsInt(),
        data.get("minimumMovementDistance").getAsDouble()
      );
    }
  }
}
