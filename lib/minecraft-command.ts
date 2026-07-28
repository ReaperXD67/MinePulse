import { z } from "zod";

const PLACEHOLDER = /\{([^{}]+)\}/g;
const ALLOWED_PLACEHOLDERS = new Set(["player", "uuid"]);

export const minecraftDeliveryCommandSchema = z
  .string()
  .trim()
  .min(4)
  .max(240)
  .superRefine((command, context) => {
    if (command.startsWith("/")) {
      context.addIssue({ code: "custom", message: "Enter the console command without a leading slash" });
    }
    if (/[\u0000-\u001f\u007f]/.test(command)) {
      context.addIssue({ code: "custom", message: "Console commands cannot contain control characters or new lines" });
    }

    const placeholders = Array.from(command.matchAll(PLACEHOLDER), (match) => match[1]);
    if (!placeholders.some((placeholder) => ALLOWED_PLACEHOLDERS.has(placeholder))) {
      context.addIssue({ code: "custom", message: "Use {player} or {uuid} so the reward reaches the buyer" });
    }
    if (placeholders.some((placeholder) => !ALLOWED_PLACEHOLDERS.has(placeholder))) {
      context.addIssue({ code: "custom", message: "Only {player} and {uuid} placeholders are supported" });
    }
    if (command.replaceAll("{player}", "").replaceAll("{uuid}", "").includes("{")) {
      context.addIssue({ code: "custom", message: "Command braces may only contain {player} or {uuid}" });
    }
  });
