package com.minepulse.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.InputStream;
import java.io.File;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
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
import org.bukkit.configuration.file.YamlConfiguration;

public final class MinePulseBridgePlugin extends JavaPlugin implements Listener, CommandExecutor {
  private static final int MAX_RESPONSE_BYTES = 1024 * 1024;
  private static final int MAX_HEARTBEATS_PER_BATCH = 200;
  private static final String CONSENT_VERSION = "2026-07-28";
  private final Gson gson = new Gson();
  private final Map<UUID, Location> lastLocation = new ConcurrentHashMap<>();
  private final Map<UUID, Long> lastActiveAt = new ConcurrentHashMap<>();
  private final Map<UUID, Integer> movementScoreSinceHeartbeat = new ConcurrentHashMap<>();
  private final Map<UUID, Integer> activityEventsSinceHeartbeat = new ConcurrentHashMap<>();
  private final Map<UUID, Long> lastHeartbeatSentAt = new ConcurrentHashMap<>();
  private final Map<UUID, Challenge> challenges = new ConcurrentHashMap<>();
  private final Map<UUID, Long> lastLinkNoticeAt = new ConcurrentHashMap<>();
  private final Map<UUID, Long> lastRewardNoticeAt = new ConcurrentHashMap<>();
  private final Map<UUID, String> lastRewardState = new ConcurrentHashMap<>();
  private final Map<UUID, Long> lastStatsRequestAt = new ConcurrentHashMap<>();
  private final Map<UUID, Long> lastReceiveRequestAt = new ConcurrentHashMap<>();
  private final Map<UUID, Long> lastLinkRequestAt = new ConcurrentHashMap<>();
  private final Set<UUID> playerRequestsInFlight = ConcurrentHashMap.newKeySet();
  private final Set<UUID> consentedPlayers = ConcurrentHashMap.newKeySet();
  private final AtomicBoolean heartbeatInFlight = new AtomicBoolean();
  private final AtomicBoolean purchasePollInFlight = new AtomicBoolean();
  private final AtomicBoolean policySyncInFlight = new AtomicBoolean();
  private final AtomicLong consentRevision = new AtomicLong();
  private final Object consentFileLock = new Object();
  private HttpClient http;
  private String apiBaseUrl;
  private String serverId;
  private String pluginSecret;
  private boolean allowInsecureHttp;
  private volatile PluginPolicy policy = PluginPolicy.defaults();
  private long lastHeartbeatBatchAt;
  private long lastPurchasePollAt;
  private long lastConnectionWarningAt;

  @Override
  public void onEnable() {
    saveDefaultConfig();
    http = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(8))
      .version(HttpClient.Version.HTTP_1_1)
      .build();
    apiBaseUrl = trimTrailingSlash(connectionValue("MINEPULSE_API_BASE_URL", "api-base-url", ""));
    serverId = connectionValue("MINEPULSE_SERVER_ID", "server-id", "");
    pluginSecret = connectionValue("MINEPULSE_PLUGIN_SECRET", "plugin-secret", "");
    allowInsecureHttp = connectionBoolean("MINEPULSE_ALLOW_INSECURE_HTTP", "allow-insecure-http", false);
    loadConsent();

    if (!configured()) {
      getLogger().severe("KarixMC Bridge is not safely configured. Add an HTTPS api-base-url, server-id, and plugin-secret to plugins/KarixMCBridge/config.yml, then restart Paper. Plain HTTP is allowed only for explicit local testing.");
    }

    Bukkit.getPluginManager().registerEvents(this, this);
    registerCommand("answer");
    registerCommand("points");
    registerCommand("pool");
    registerCommand("receive");
    registerCommand("karixmc");
    registerCommand("minepulse");
    registerCommand("mpcode");

    Bukkit.getScheduler().runTaskTimer(this, this::tickBridge, 40L, 100L);
    Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::syncPolicy, 20L, 1200L);
    getLogger().info("KarixMC bridge enabled. Protection policy will sync from the website.");
  }

  @Override
  public void onDisable() {
    Bukkit.getScheduler().cancelTasks(this);
    lastLocation.clear();
    lastActiveAt.clear();
    movementScoreSinceHeartbeat.clear();
    activityEventsSinceHeartbeat.clear();
    lastHeartbeatSentAt.clear();
    challenges.clear();
    lastLinkNoticeAt.clear();
    lastRewardNoticeAt.clear();
    lastRewardState.clear();
    lastStatsRequestAt.clear();
    lastReceiveRequestAt.clear();
    lastLinkRequestAt.clear();
    playerRequestsInFlight.clear();
    consentedPlayers.clear();
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
      if (purchasePollInFlight.compareAndSet(false, true)) {
        Bukkit.getScheduler().runTaskAsynchronously(this, this::pollPurchases);
      }
    }
  }

  @EventHandler
  public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    lastLocation.put(player.getUniqueId(), player.getLocation());
    lastActiveAt.put(player.getUniqueId(), now());
    movementScoreSinceHeartbeat.put(player.getUniqueId(), 0);
    activityEventsSinceHeartbeat.put(player.getUniqueId(), 0);
    lastHeartbeatSentAt.put(player.getUniqueId(), now());
    if (!consentedPlayers.contains(player.getUniqueId())) {
      player.sendMessage(prefix() + ChatColor.GRAY + "KarixMC activity sharing is off. Use /karixmc link <code> to opt in; player IP addresses are never sent.");
    }
  }

  @EventHandler
  public void onQuit(PlayerQuitEvent event) {
    UUID id = event.getPlayer().getUniqueId();
    lastLocation.remove(id);
    lastActiveAt.remove(id);
    movementScoreSinceHeartbeat.remove(id);
    activityEventsSinceHeartbeat.remove(id);
    lastHeartbeatSentAt.remove(id);
    challenges.remove(id);
    lastLinkNoticeAt.remove(id);
    lastRewardNoticeAt.remove(id);
    lastRewardState.remove(id);
    lastStatsRequestAt.remove(id);
    lastReceiveRequestAt.remove(id);
    lastLinkRequestAt.remove(id);
    playerRequestsInFlight.remove(id);
  }

  @EventHandler
  public void onMove(PlayerMoveEvent event) {
    Player player = event.getPlayer();
    Location from = lastLocation.get(player.getUniqueId());
    Location to = event.getTo();
    if (to == null) return;
    double minimumSquared = policy.minimumMovementDistance * policy.minimumMovementDistance;

    boolean sameWorld = from != null && from.getWorld() != null && from.getWorld().equals(to.getWorld());
    if (!sameWorld || from.distanceSquared(to) >= minimumSquared) {
      if (sameWorld) {
        int score = (int) Math.min(1_000_000, Math.round(from.distanceSquared(to) * 1000));
        movementScoreSinceHeartbeat.compute(player.getUniqueId(), (id, previous) ->
          (int) Math.min(1_000_000L, (long) (previous == null ? 0 : previous) + score)
        );
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
    boolean bridgeCommand = name.equals("karixmc") || name.equals("minepulse");
    if (name.equals("answer") || name.equals("mpcode")) {
      return answerChallenge(sender, args);
    }

    if (!(sender instanceof Player player)) {
      sender.sendMessage("Only players can view KarixMC statistics.");
      return true;
    }

    if (bridgeCommand && args.length > 0 && args[0].equalsIgnoreCase("help")) {
      showHelp(player);
      return true;
    }

    if (bridgeCommand && args.length > 0 && args[0].equalsIgnoreCase("link")) {
      if (args.length < 2) {
        player.sendMessage(prefix() + ChatColor.YELLOW + "Use /karixmc link <code> from your KarixMC account.");
      } else {
        linkAccount(player, args[1]);
      }
      return true;
    }

    if (bridgeCommand && args.length > 0 && args[0].equalsIgnoreCase("privacy")) {
      player.sendMessage(prefix() + ChatColor.WHITE + "Privacy status: " + (consentedPlayers.contains(player.getUniqueId()) ? ChatColor.GREEN + "opted in" : ChatColor.GRAY + "off"));
      player.sendMessage(ChatColor.GRAY + "KarixMC sends your UUID, Minecraft name, activity counters, AFK state, and challenge answers only after you link. It never sends your IP address.");
      player.sendMessage(ChatColor.GRAY + "Use /karixmc forget to stop future activity sharing on this server.");
      return true;
    }

    if (bridgeCommand && args.length > 0 && args[0].equalsIgnoreCase("forget")) {
      if (consentedPlayers.remove(player.getUniqueId())) {
        saveConsentAsync();
      }
      challenges.remove(player.getUniqueId());
      player.sendMessage(prefix() + ChatColor.GREEN + "Activity sharing stopped on this server. No more reward heartbeats will be sent for you.");
      return true;
    }

    if (name.equals("receive") || (bridgeCommand && args.length > 0 && args[0].equalsIgnoreCase("receive"))) {
      receivePurchases(player);
      return true;
    }

    boolean poolOnly = name.equals("pool") || (bridgeCommand && args.length > 0 && args[0].equalsIgnoreCase("pool"));
    fetchPlayerStats(player, poolOnly);
    return true;
  }

  private boolean answerChallenge(CommandSender sender, String[] args) {
    if (!(sender instanceof Player player)) {
      sender.sendMessage("Only players can answer a KarixMC activity check.");
      return true;
    }

    Challenge challenge = challenges.get(player.getUniqueId());
    if (challenge == null) {
      player.sendMessage(prefix() + ChatColor.GRAY + "No activity check is waiting.");
      return true;
    }
    if (Instant.now().isAfter(challenge.expiresAt)) {
      challenges.remove(player.getUniqueId(), challenge);
      player.sendMessage(prefix() + ChatColor.RED + "That check expired. A new question will arrive shortly.");
      return true;
    }
    if (args.length == 0) {
      player.sendMessage(prefix() + ChatColor.YELLOW + challenge.question);
      return true;
    }

    challenge.submittedAnswer = args[0];
    markActive(player);
    player.sendMessage(prefix() + ChatColor.AQUA + "Answer submitted. KarixMC is verifying it.");
    return true;
  }

  private void showHelp(Player player) {
    player.sendMessage(prefix() + ChatColor.WHITE + "/points" + ChatColor.GRAY + " - wallet and session rewards");
    player.sendMessage(prefix() + ChatColor.WHITE + "/pool" + ChatColor.GRAY + " - this server's campaign balance");
    player.sendMessage(prefix() + ChatColor.WHITE + "/answer <value>" + ChatColor.GRAY + " - answer an activity check");
    player.sendMessage(prefix() + ChatColor.WHITE + "/karixmc link <code>" + ChatColor.GRAY + " - connect your website account");
    player.sendMessage(prefix() + ChatColor.WHITE + "/karixmc privacy" + ChatColor.GRAY + " - view data sharing and consent status");
    player.sendMessage(prefix() + ChatColor.WHITE + "/karixmc forget" + ChatColor.GRAY + " - stop future activity sharing on this server");
    player.sendMessage(prefix() + ChatColor.WHITE + "/receive" + ChatColor.GRAY + " - retry queued KarixMC store deliveries");
  }

  private void linkAccount(Player player, String code) {
    UUID playerId = player.getUniqueId();
    if (!beginPlayerRequest(player, lastLinkRequestAt, 10)) return;
    JsonObject payload = credentials();
    payload.addProperty("code", code);
    payload.addProperty("minecraftUuid", playerId.toString());
    payload.addProperty("minecraftName", player.getName());
    payload.addProperty("consentVersion", CONSENT_VERSION);
    Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
      try {
        JsonObject response = post("/api/plugin/link", payload);
        String message = response.has("message") ? response.get("message").getAsString() : "Minecraft account linked.";
        consentedPlayers.add(playerId);
        saveConsentAsync();
        Bukkit.getScheduler().runTask(this, () -> {
          Player online = Bukkit.getPlayer(playerId);
          if (online != null) online.sendMessage(prefix() + ChatColor.GREEN + message + " Activity sharing is now enabled; no IP address is sent.");
        });
      } catch (Exception error) {
        String detail = safeError(error);
        Bukkit.getScheduler().runTask(this, () -> {
          Player online = Bukkit.getPlayer(playerId);
          if (online != null) online.sendMessage(prefix() + ChatColor.RED + "Link failed: " + detail);
        });
      } finally {
        playerRequestsInFlight.remove(playerId);
      }
    });
  }

  private void sendHeartbeats() {
    if (!heartbeatInFlight.compareAndSet(false, true)) {
      return;
    }

    List<JsonObject> heartbeats = new ArrayList<>();
    List<UUID> playerIds = new ArrayList<>();
    for (Player player : Bukkit.getOnlinePlayers()) {
      if (!consentedPlayers.contains(player.getUniqueId())) continue;
      heartbeats.add(buildHeartbeatPayload(player));
      playerIds.add(player.getUniqueId());
    }
    if (heartbeats.isEmpty()) {
      heartbeatInFlight.set(false);
      return;
    }

    Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
      try {
        for (int start = 0; start < heartbeats.size(); start += MAX_HEARTBEATS_PER_BATCH) {
          int end = Math.min(start + MAX_HEARTBEATS_PER_BATCH, heartbeats.size());
          JsonArray batch = new JsonArray();
          for (int index = start; index < end; index++) {
            batch.add(heartbeats.get(index));
          }

          JsonObject payload = credentials();
          payload.addProperty("pluginVersion", getDescription().getVersion());
          payload.add("heartbeats", batch);
          try {
            JsonObject response = post("/api/plugin/heartbeat/batch", payload);
            JsonArray results = response.getAsJsonArray("results");
            List<UUID> batchPlayerIds = List.copyOf(playerIds.subList(start, end));
            Bukkit.getScheduler().runTask(this, () -> {
              for (int index = 0; index < Math.min(batchPlayerIds.size(), results.size()); index++) {
                applyHeartbeatResponse(batchPlayerIds.get(index), results.get(index).getAsJsonObject());
              }
            });
          } catch (Exception error) {
            warnConnection("Heartbeat batch failed: " + safeError(error));
          }
        }
      } finally {
        heartbeatInFlight.set(false);
      }
    });
  }

  private JsonObject buildHeartbeatPayload(Player player) {
    long current = now();
    boolean afk = isAfk(player, current);
    int movementScore = Math.min(1_000_000, movementScoreSinceHeartbeat.getOrDefault(player.getUniqueId(), 0));
    int activityEvents = Math.min(10_000, activityEventsSinceHeartbeat.getOrDefault(player.getUniqueId(), 0));
    long previousHeartbeat = lastHeartbeatSentAt.getOrDefault(player.getUniqueId(), current);
    long reportedSeconds = Math.max(0, Math.min(60, current - previousHeartbeat));
    Challenge challenge = challenges.get(player.getUniqueId());
    movementScoreSinceHeartbeat.put(player.getUniqueId(), 0);
    activityEventsSinceHeartbeat.put(player.getUniqueId(), 0);
    lastHeartbeatSentAt.put(player.getUniqueId(), current);

    JsonObject payload = new JsonObject();
    payload.addProperty("minecraftUuid", player.getUniqueId().toString());
    payload.addProperty("minecraftName", player.getName());
    payload.addProperty("afk", afk);
    payload.addProperty("movementScore", movementScore);
    payload.addProperty("activityEvents", activityEvents);
    if (challenge != null) {
      payload.addProperty("challengeId", challenge.id);
      if (challenge.submittedAnswer != null) {
        payload.addProperty("challengeAnswer", challenge.submittedAnswer);
      }
    }
    payload.addProperty("reportedSeconds", reportedSeconds);
    return payload;
  }

  private void applyHeartbeatResponse(UUID playerId, JsonObject response) {
    Player player = Bukkit.getPlayer(playerId);
    if (player == null) {
      return;
    }

    if (response.has("linked") && !response.get("linked").getAsBoolean()) {
      long current = now();
      long lastNotice = lastLinkNoticeAt.getOrDefault(playerId, 0L);
      if (current - lastNotice >= 60) {
        lastLinkNoticeAt.put(playerId, current);
        String message = response.has("message")
          ? response.get("message").getAsString()
          : "Link your KarixMC account before rewards can start.";
        player.sendMessage(prefix() + ChatColor.YELLOW + message);
      }
      return;
    }

    boolean accepted = response.has("challengeAccepted") && response.get("challengeAccepted").getAsBoolean();
    if (accepted) {
      challenges.remove(playerId);
      player.sendMessage(prefix() + ChatColor.GREEN + "Activity check confirmed.");
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
          ? "Rewards pause until KarixMC verifies your answer."
          : "This server uses optional activity checks."));
        player.sendMessage("");
      }
    }

    applyRewardState(player, response);
  }

  private void applyRewardState(Player player, JsonObject response) {
    if (!response.has("rewardState") || !response.has("rewardMessage")) {
      return;
    }

    UUID playerId = player.getUniqueId();
    String state = response.get("rewardState").getAsString();
    String message = response.get("rewardMessage").getAsString();
    String previous = lastRewardState.put(playerId, state);
    long current = now();
    long lastNotice = lastRewardNoticeAt.getOrDefault(playerId, 0L);
    boolean changed = previous == null || !previous.equals(state);

    if (state.equals("EARNING")) {
      if (changed) {
        lastRewardNoticeAt.put(playerId, current);
        player.sendMessage(prefix() + ChatColor.GREEN + message);
      }
      return;
    }

    if (changed || current - lastNotice >= 60) {
      lastRewardNoticeAt.put(playerId, current);
      player.sendMessage(prefix() + ChatColor.YELLOW + message);
    }
  }

  private void syncPolicy() {
    if (!configured() || !policySyncInFlight.compareAndSet(false, true)) {
      return;
    }

    JsonObject payload = credentials();
    payload.addProperty("pluginVersion", getDescription().getVersion());
    try {
      JsonObject response = post("/api/plugin/config", payload);
      JsonObject data = response.getAsJsonObject("policy");
      PluginPolicy next = PluginPolicy.from(data);
      if (next.revision != policy.revision) {
        getLogger().info("KarixMC website policy synced at revision " + next.revision + ".");
      }
      policy = next;
    } catch (Exception error) {
      warnConnection("Policy sync failed; keeping the last safe policy: " + safeError(error));
    } finally {
      policySyncInFlight.set(false);
    }
  }

  private void fetchPlayerStats(Player player, boolean poolOnly) {
    if (!consentedPlayers.contains(player.getUniqueId())) {
      player.sendMessage(prefix() + ChatColor.YELLOW + "Activity sharing is off. Link your KarixMC account first with /karixmc link <code>.");
      return;
    }
    UUID playerId = player.getUniqueId();
    if (!beginPlayerRequest(player, lastStatsRequestAt, 5)) return;
    JsonObject payload = credentials();
    payload.addProperty("minecraftUuid", playerId.toString());
    Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
      try {
        JsonObject response = post("/api/plugin/player-stats", payload);
        Bukkit.getScheduler().runTask(this, () -> displayStats(playerId, response, poolOnly));
      } catch (Exception error) {
        Bukkit.getScheduler().runTask(this, () -> {
          Player online = Bukkit.getPlayer(playerId);
          if (online != null) online.sendMessage(prefix() + ChatColor.RED + "Stats are temporarily unavailable.");
        });
      } finally {
        playerRequestsInFlight.remove(playerId);
      }
    });
  }

  private void displayStats(UUID playerId, JsonObject response, boolean poolOnly) {
    Player player = Bukkit.getPlayer(playerId);
    if (player == null) {
      return;
    }
    if (response.has("linked") && !response.get("linked").getAsBoolean()) {
      player.sendMessage(prefix() + ChatColor.YELLOW + "Link your KarixMC account before rewards and wallet stats can start.");
      player.sendMessage(ChatColor.GRAY + "Open KarixMC account settings, create a code, then run /karixmc link <code>.");
      return;
    }
    JsonObject server = response.getAsJsonObject("server");
    player.sendMessage(prefix() + ChatColor.WHITE + server.get("name").getAsString());
    player.sendMessage(ChatColor.GRAY + "Campaign pool: " + ChatColor.AQUA + formatNumber(server.get("pointPool").getAsLong())
      + ChatColor.DARK_GRAY + " | " + ChatColor.GRAY + "Rate: " + ChatColor.GREEN + formatRate(server.get("rewardRatePerSecond").getAsDouble()) + "/s");
    if (!poolOnly) {
      JsonObject session = response.getAsJsonObject("session");
      player.sendMessage(ChatColor.GRAY + "Wallet: " + ChatColor.GOLD + formatNumber(response.get("walletPoints").getAsLong())
        + ChatColor.DARK_GRAY + " | " + ChatColor.GRAY + "This session earned: " + ChatColor.GREEN + formatNumber(session.get("rewardedPoints").getAsLong()));
      player.sendMessage(ChatColor.GRAY + "Verified play: " + ChatColor.WHITE + duration(session.get("activeSeconds").getAsLong()));
    }
  }

  private void pollPurchases() {
    if (!configured()) {
      purchasePollInFlight.set(false);
      return;
    }
    JsonObject payload = credentials();
    payload.addProperty("limit", 25);

    try {
      deliverPulledPurchases(post("/api/plugin/purchases/pull", payload), null);
    } catch (Exception error) {
      warnConnection("Purchase polling failed: " + safeError(error));
    } finally {
      purchasePollInFlight.set(false);
    }
  }

  private void receivePurchases(Player player) {
    UUID playerId = player.getUniqueId();
    if (!beginPlayerRequest(player, lastReceiveRequestAt, 10)) return;
    JsonObject payload = credentials();
    payload.addProperty("limit", 25);
    payload.addProperty("minecraftUuid", playerId.toString());
    Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
      try {
        JsonObject response = post("/api/plugin/purchases/pull", payload);
        deliverPulledPurchases(response, playerId);
      } catch (Exception error) {
        Bukkit.getScheduler().runTask(this, () -> {
          Player online = Bukkit.getPlayer(playerId);
          if (online != null) online.sendMessage(prefix() + ChatColor.RED + "Could not check queued deliveries right now.");
        });
      } finally {
        playerRequestsInFlight.remove(playerId);
      }
    });
  }

  private void deliverPulledPurchases(JsonObject response, UUID requestedBy) {
    JsonArray purchases = response.getAsJsonArray("purchases");
    if (purchases == null || purchases.size() == 0) {
      if (requestedBy != null) {
        Bukkit.getScheduler().runTask(this, () -> {
          Player player = Bukkit.getPlayer(requestedBy);
          if (player != null) {
            player.sendMessage(prefix() + ChatColor.GRAY + "No queued KarixMC deliveries for you on this server.");
          }
        });
      }
      return;
    }
    for (int i = 0; i < purchases.size(); i++) {
      deliverPurchase(purchases.get(i).getAsJsonObject());
    }
  }

  private void deliverPurchase(JsonObject purchase) {
    String purchaseId = purchase.get("id").getAsString();
    String command = purchase.get("command").getAsString();
    String item = purchase.has("item") ? purchase.get("item").getAsString() : "KarixMC item";
    String playerName = purchase.has("player") ? purchase.get("player").getAsString() : "";
    String uuid = purchase.has("uuid") && !purchase.get("uuid").isJsonNull() ? purchase.get("uuid").getAsString() : "";
    boolean requiresOnline = !purchase.has("requiresOnline") || purchase.get("requiresOnline").getAsBoolean();
    Bukkit.getScheduler().runTask(this, () -> {
      Player target = null;
      if (!uuid.isBlank()) {
        try {
          target = Bukkit.getPlayer(UUID.fromString(uuid));
        } catch (IllegalArgumentException ignored) {
          target = null;
        }
      }
      if (target == null && !playerName.isBlank()) {
        target = Bukkit.getPlayerExact(playerName);
      }

      if (requiresOnline && target == null) {
        return;
      }

      boolean delivered;
      String message;
      try {
        delivered = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
        message = delivered ? "Command executed" : "Command dispatcher returned false";
      } catch (Exception error) {
        delivered = false;
        message = safeError(error);
      }

      if (target != null) {
        target.sendMessage(prefix() + (delivered ? ChatColor.GREEN : ChatColor.RED)
          + (delivered ? "Delivered " : "Could not deliver ") + item + ".");
      }

      boolean finalDelivered = delivered;
      String finalMessage = message;
      Bukkit.getScheduler().runTaskAsynchronously(this, () -> acknowledge(purchaseId, finalDelivered, finalMessage));
    });
  }

  private void acknowledge(String purchaseId, boolean delivered, String message) {
    JsonObject payload = credentials();
    payload.addProperty("purchaseId", purchaseId);
    payload.addProperty("status", delivered ? "DELIVERED" : "FAILED");
    payload.addProperty("message", message);
    try {
      post("/api/plugin/purchases/ack", payload);
    } catch (Exception error) {
      warnConnection("Purchase acknowledge failed: " + safeError(error));
    }
  }

  private JsonObject credentials() {
    JsonObject payload = new JsonObject();
    payload.addProperty("serverId", serverId);
    return payload;
  }

  private JsonObject post(String path, JsonObject payload) throws IOException, InterruptedException {
    String body = gson.toJson(payload);
    long timestamp = now();
    String requestNonce = UUID.randomUUID().toString();
    String canonical = String.join(
      "\n",
      "POST",
      path,
      serverId,
      Long.toString(timestamp),
      requestNonce,
      sha256(body)
    );
    HttpRequest request = HttpRequest.newBuilder()
      .uri(URI.create(apiBaseUrl + path))
      .timeout(Duration.ofSeconds(10))
      .header("Content-Type", "application/json")
      .header("X-KarixMC-Protocol", "2")
      .header("X-KarixMC-Server-Id", serverId)
      .header("X-KarixMC-Timestamp", Long.toString(timestamp))
      .header("X-KarixMC-Nonce", requestNonce)
      .header("X-KarixMC-Signature", hmac(canonical))
      .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
      .build();

    HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
    long declaredLength = response.headers().firstValueAsLong("content-length").orElse(-1L);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      try (InputStream ignored = response.body()) {
        // Close the oversized response without buffering it.
      }
      throw new IOException("KarixMC response exceeded the size limit");
    }

    byte[] responseBytes;
    try (InputStream stream = response.body()) {
      responseBytes = stream.readNBytes(MAX_RESPONSE_BYTES + 1);
    }
    if (responseBytes.length > MAX_RESPONSE_BYTES) {
      throw new IOException("KarixMC response exceeded the size limit");
    }
    String responseBody = new String(responseBytes, StandardCharsets.UTF_8);
    if (response.statusCode() == 401 || response.statusCode() == 403) {
      throw new IOException("Bridge authentication failed. Check the server ID, plugin secret, API URL, and plugin version.");
    }
    verifyResponse(response, requestNonce, responseBody);
    if (response.statusCode() < 200 || response.statusCode() >= 300) {
      String message = "KarixMC returned HTTP " + response.statusCode();
      try {
        JsonObject errorBody = JsonParser.parseString(responseBody).getAsJsonObject();
        if (errorBody.has("error")) message = errorBody.get("error").getAsString();
      } catch (RuntimeException ignored) {
        // Keep the status-only fallback when the signed response is not JSON.
      }
      throw new IOException(message);
    }

    try {
      JsonObject parsed = JsonParser.parseString(responseBody).getAsJsonObject();
      if (parsed == null) throw new IOException("KarixMC returned an empty response");
      return parsed;
    } catch (RuntimeException error) {
      throw new IOException("KarixMC returned invalid JSON", error);
    }
  }

  private boolean configured() {
    if (serverId == null || serverId.isBlank() || pluginSecret == null || pluginSecret.isBlank()) {
      return false;
    }
    try {
      URI uri = URI.create(apiBaseUrl);
      String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
      String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
      boolean loopback = host.equals("localhost") || host.equals("127.0.0.1") || host.equals("::1");
      boolean secure = scheme.equals("https") || (scheme.equals("http") && (loopback || allowInsecureHttp));
      return secure && uri.getRawUserInfo() == null && uri.getRawQuery() == null && uri.getRawFragment() == null;
    } catch (IllegalArgumentException error) {
      return false;
    }
  }

  private boolean beginPlayerRequest(Player player, Map<UUID, Long> cooldowns, int cooldownSeconds) {
    UUID playerId = player.getUniqueId();
    long current = now();
    long lastRequest = cooldowns.getOrDefault(playerId, 0L);
    if (current - lastRequest < cooldownSeconds || !playerRequestsInFlight.add(playerId)) {
      player.sendMessage(prefix() + ChatColor.GRAY + "Please wait before requesting that again.");
      return false;
    }
    cooldowns.put(playerId, current);
    return true;
  }

  private void markActive(Player player) {
    lastActiveAt.put(player.getUniqueId(), now());
    activityEventsSinceHeartbeat.compute(player.getUniqueId(), (id, previous) ->
      Math.min(10_000, (previous == null ? 0 : previous) + 1)
    );
  }

  private boolean isAfk(Player player, long current) {
    long lastActive = lastActiveAt.getOrDefault(player.getUniqueId(), current);
    return current - lastActive >= policy.afkTimeoutSeconds;
  }

  private void verifyResponse(HttpResponse<?> response, String requestNonce, String body) throws IOException {
    String protocol = response.headers().firstValue("X-KarixMC-Protocol").orElse("");
    String timestampValue = response.headers().firstValue("X-KarixMC-Timestamp").orElse("");
    String responseNonce = response.headers().firstValue("X-KarixMC-Nonce").orElse("");
    String receivedSignature = response.headers().firstValue("X-KarixMC-Signature").orElse("");
    long timestamp;
    try {
      timestamp = Long.parseLong(timestampValue);
    } catch (NumberFormatException error) {
      throw new IOException("KarixMC response was not authenticated");
    }
    if (!protocol.equals("2") || Math.abs(now() - timestamp) > 90 || !responseNonce.matches("[a-fA-F0-9-]{20,80}")) {
      throw new IOException("KarixMC response was not authenticated");
    }

    String canonical = String.join(
      "\n",
      "RESPONSE",
      requestNonce,
      timestampValue,
      responseNonce,
      Integer.toString(response.statusCode()),
      sha256(body)
    );
    byte[] expected = decodeHex(hmac(canonical));
    byte[] received = decodeHex(receivedSignature);
    if (expected == null || received == null || !MessageDigest.isEqual(expected, received)) {
      throw new IOException("KarixMC response signature was invalid");
    }
  }

  private String sha256(String value) throws IOException {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception error) {
      throw new IOException("Could not hash KarixMC request", error);
    }
  }

  private String hmac(String value) throws IOException {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(pluginSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception error) {
      throw new IOException("Could not sign KarixMC request", error);
    }
  }

  private byte[] decodeHex(String value) {
    if (value == null || !value.matches("[a-fA-F0-9]{64}")) return null;
    try {
      return HexFormat.of().parseHex(value);
    } catch (IllegalArgumentException error) {
      return null;
    }
  }

  private void loadConsent() {
    File file = new File(getDataFolder(), "consent.yml");
    if (!file.isFile()) return;
    YamlConfiguration data = YamlConfiguration.loadConfiguration(file);
    if (!CONSENT_VERSION.equals(data.getString("consent-version", ""))) return;
    for (String value : data.getStringList("consented-players")) {
      try {
        consentedPlayers.add(UUID.fromString(value));
      } catch (IllegalArgumentException ignored) {
        // Ignore malformed legacy entries.
      }
    }
  }

  private void saveConsentAsync() {
    long revision = consentRevision.incrementAndGet();
    List<String> snapshot = consentedPlayers.stream()
      .map(UUID::toString)
      .sorted(Comparator.naturalOrder())
      .toList();
    Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
      try {
        synchronized (consentFileLock) {
          if (revision != consentRevision.get()) return;
          if (!getDataFolder().exists() && !getDataFolder().mkdirs()) {
            throw new IOException("Could not create plugin data directory");
          }
          YamlConfiguration data = new YamlConfiguration();
          data.set("consent-version", CONSENT_VERSION);
          data.set("consented-players", snapshot);
          data.save(new File(getDataFolder(), "consent.yml"));
        }
      } catch (IOException error) {
        warnConnection("Could not save player privacy choices: " + safeError(error));
      }
    });
  }

  private void warnConnection(String message) {
    long current = now();
    if (current - lastConnectionWarningAt < 60) return;
    lastConnectionWarningAt = current;
    getLogger().warning(message);
  }

  private String safeError(Exception error) {
    String value = error.getMessage();
    if (value == null || value.isBlank()) value = error.getClass().getSimpleName();
    value = value.replace('\r', ' ').replace('\n', ' ').trim();
    return value.length() <= 160 ? value : value.substring(0, 160);
  }

  private long now() {
    return System.currentTimeMillis() / 1000L;
  }

  private String trimTrailingSlash(String value) {
    if (value == null || value.isBlank()) {
      return "";
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

  private boolean connectionBoolean(String environmentName, String configPath, boolean fallback) {
    String environmentValue = System.getenv(environmentName);
    return environmentValue == null || environmentValue.isBlank()
      ? getConfig().getBoolean(configPath, fallback)
      : Boolean.parseBoolean(environmentValue.trim());
  }

  private String prefix() {
    return ChatColor.DARK_GRAY + "[" + ChatColor.AQUA + "KarixMC" + ChatColor.DARK_GRAY + "] ";
  }

  private String formatNumber(long value) {
    return String.format(Locale.US, "%,d", value);
  }

  private String formatRate(double value) {
    if (Math.rint(value) == value) {
      return String.format(Locale.US, "%.0f", value);
    }
    return String.format(Locale.US, "%.1f", value);
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
