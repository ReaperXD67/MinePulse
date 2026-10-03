"use client";

import { useState } from "react";
import "./protection-policy.css";

type ProtectionPolicy = {
  id: string;
  afkProtectionEnabled: boolean;
  pluginMessagesEnabled: boolean;
  challengeEnabled: boolean;
  challengeRequired: boolean;
  afkTimeoutSeconds: number;
  challengeIntervalSeconds: number;
  challengeAnswerWindowSeconds: number;
  heartbeatIntervalSeconds: number;
  purchasePollSeconds: number;
  minimumMovementDistance: number;
  minimumActivityEvents: number;
  botProtectionLevel: number;
};

export function protectionPolicyPayload(form: FormData) {
  const numbers = ["heartbeatIntervalSeconds", "purchasePollSeconds", "afkTimeoutSeconds", "challengeIntervalSeconds", "challengeAnswerWindowSeconds", "minimumMovementDistance", "minimumActivityEvents", "botProtectionLevel"];
  return {
    ...Object.fromEntries(numbers.filter((name) => form.has(name)).map((name) => [name, form.get(name)])),
    afkProtectionEnabled: form.get("afkProtectionEnabled") === "on",
    pluginMessagesEnabled: form.get("pluginMessagesEnabled") === "on",
    challengeEnabled: form.get("challengeEnabled") === "on",
    // This value remains submitted while its visible control is disabled.
    challengeRequired: form.get("challengeRequired") === "on"
  };
}

export function ProtectionPolicyFields({ policy }: { policy: ProtectionPolicy }) {
  const [afkEnabled, setAfkEnabled] = useState(policy.afkProtectionEnabled);
  const [checksEnabled, setChecksEnabled] = useState(policy.challengeEnabled);
  const [answerRequired, setAnswerRequired] = useState(policy.challengeRequired);
  const [messagesEnabled, setMessagesEnabled] = useState(policy.pluginMessagesEnabled);
  const id = (name: string) => `policy-${policy.id}-${name}`;

  return (
    <>
      <div className="protection-controls">
        <div className="protection-control">
          <label className="toggle-row" htmlFor={id("afk")}><input id={id("afk")} name="afkProtectionEnabled" type="checkbox" checked={afkEnabled} onChange={(event) => setAfkEnabled(event.target.checked)} aria-describedby={id("afk-help")} /> Pause rewards when AFK <span className="badge">{afkEnabled ? "On" : "Off"}</span></label>
          <p id={id("afk-help")}>{afkEnabled ? "Idle players pause earning after the timeout below." : "AFK detection is off. Linked players can earn while idle."}</p>
        </div>
        <div className="protection-control">
          <label className="toggle-row" htmlFor={id("checks")}><input id={id("checks")} name="challengeEnabled" type="checkbox" checked={checksEnabled} onChange={(event) => setChecksEnabled(event.target.checked)} aria-describedby={id("checks-help")} /> Send /answer activity checks <span className="badge">{checksEnabled ? "On" : "Off"}</span></label>
          <p id={id("checks-help")}>{checksEnabled ? "Players receive a short arithmetic question at the interval below." : "No arithmetic questions are sent. Pending checks stop blocking rewards."}</p>
        </div>
        <div className="protection-control">
          <label className="toggle-row" htmlFor={id("messages")}><input id={id("messages")} name="pluginMessagesEnabled" type="checkbox" checked={messagesEnabled} onChange={(event) => setMessagesEnabled(event.target.checked)} aria-describedby={id("messages-help")} /> Show reward and linking notices <span className="badge">{messagesEnabled ? "On" : "Off"}</span></label>
          <p id={id("messages-help")}>Turn off for quieter chat. To stop activity prompts too, turn off /answer checks. Commands such as /points still reply.</p>
        </div>
      </div>
      <div className="form-grid two">
        <div className="form-row"><label htmlFor={id("timeout")}>AFK timeout (seconds)</label><input id={id("timeout")} className="field" name="afkTimeoutSeconds" type="number" min="60" max="1800" defaultValue={policy.afkTimeoutSeconds} disabled={!afkEnabled} /></div>
        <div className="form-row"><label htmlFor={id("interval")}>Ask /answer every (seconds)</label><input id={id("interval")} className="field" name="challengeIntervalSeconds" type="number" min="60" max="3600" defaultValue={policy.challengeIntervalSeconds} disabled={!checksEnabled} /></div>
        <div className="form-row"><label htmlFor={id("window")}>Time to answer (seconds)</label><input id={id("window")} className="field" name="challengeAnswerWindowSeconds" type="number" min="30" max="300" defaultValue={policy.challengeAnswerWindowSeconds} disabled={!checksEnabled} /></div>
        <div className="form-row"><label htmlFor={id("heartbeat")}>Heartbeat (seconds)</label><input id={id("heartbeat")} className="field" name="heartbeatIntervalSeconds" type="number" min="10" max="60" defaultValue={policy.heartbeatIntervalSeconds} /></div>
        <div className="form-row"><label htmlFor={id("poll")}>Purchase poll (seconds)</label><input id={id("poll")} className="field" name="purchasePollSeconds" type="number" min="10" max="120" defaultValue={policy.purchasePollSeconds} /></div>
        <div className="form-row"><label htmlFor={id("movement")}>Movement distance</label><input id={id("movement")} className="field" name="minimumMovementDistance" type="number" min="0.05" max="3" step="0.05" defaultValue={policy.minimumMovementDistance} disabled={!afkEnabled} /></div>
        <div className="form-row"><label htmlFor={id("events")}>Events to reset AFK timer</label><input id={id("events")} className="field" name="minimumActivityEvents" type="number" min="0" max="20" defaultValue={policy.minimumActivityEvents} disabled={!afkEnabled} /><small>Movement also resets the timer.</small></div>
        <div className="form-row"><label htmlFor={id("level")}>Protection level</label><select id={id("level")} className="select" name="botProtectionLevel" defaultValue={policy.botProtectionLevel}><option value="1">Balanced</option><option value="2">Strict</option><option value="3">Maximum</option></select></div>
      </div>
      <input name="challengeRequired" type="hidden" value={answerRequired ? "on" : "off"} />
      <label className="toggle-row"><input type="checkbox" checked={answerRequired} onChange={(event) => setAnswerRequired(event.target.checked)} disabled={!checksEnabled} /> Pause rewards until the activity check is answered</label>
      <p className="credential-help">Changes reach the bridge within one minute. AFK and /answer checks can be switched off independently; no oversized timer values are needed. Quiet chat requires bridge 0.6.7 or newer.</p>
    </>
  );
}
