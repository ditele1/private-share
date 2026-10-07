
const {
  Plugin,
  Platform,
  PluginSettingTab,
  Setting,
  Notice,
  TFile,
  requestUrl,
  Modal,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  serverUrl: "",
  localUploadUrl: "",
  apiToken: "",
  attachmentUploadBackend: "alist",
  alistLanUrl: "",
  alistPublicUrl: "",
  alistUsername: "",
  alistPassword: "",
  alistToken: "",
  alistRootPath: "/Obsidian",
  alistUseDateFolders: true,
  alistAutoUpload: true,
  alistDeleteRemoteOnNoteDelete: true,
  alistDeleteRemoteOnLinkRemove: true,
  alistConfirmRemoteDelete: true,
  alistAssets: {},
  shares: {},
};

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, part);
  }
  return btoa(binary);
}
function normalizeBase(url) {
  return (url || "").trim().replace(/\/+$/, "");
}
function normalizeRemotePath(value) {
  let pathValue = String(value || "").trim().replace(/\\/g, "/");
  if (!pathValue) return "/";
  if (!pathValue.startsWith("/")) pathValue = "/" + pathValue;
  return pathValue.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
}
function encodeUrlPath(value) {
  return normalizeRemotePath(value)
    .split("/")
    .map((part, index) =>
      index === 0 ? "" : encodeURIComponent(part)
    )
    .join("/");
}
function safeRemoteName(name) {
  const value = String(name || "file").trim();
  const dot = value.lastIndexOf(".");
  const ext = dot > 0 ? value.slice(dot).toLowerCase() : "";
  const stem = dot > 0 ? value.slice(0, dot) : value;
  const cleaned = stem
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "file";
  return cleaned + ext;
}
function uploadStamp() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    two(d.getMonth() + 1) +
    two(d.getDate()) +
    "-" +
    two(d.getHours()) +
    two(d.getMinutes()) +
    two(d.getSeconds())
  );
}
function randomShortId() {
  return Math.random().toString(36).slice(2, 8);
}
function mimeFromName(name) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    xlsx:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    zip: "application/zip",
    txt: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}
function isImageName(name) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
}
function isAudioName(name) {
  return /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(name);
}
function isVideoName(name) {
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(name);
}
function isExcelName(name) {
  return /\.(xlsx|xls)$/i.test(name);
}
function htmlAttr(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function aListReplacement(
  name,
  label,
  publicUrl,
  embedded = false
) {
  const safeUrl = htmlAttr(publicUrl);
  if (isImageName(name)) {
    return "!" + "[" + (label || name) + "](" + publicUrl + ")";
  }
  if (isVideoName(name)) {
    return (
      '<video controls preload="metadata" playsinline style="width:100%;max-width:100%;height:auto" src="' +
      safeUrl +
      '"></video>'
    );
  }
  if (isAudioName(name)) {
    return (
      '<audio controls preload="metadata" style="width:100%" src="' +
      safeUrl +
      '"></audio>'
    );
  }
  return (
    (embedded ? "!" : "") +
    "[" +
    (label || name) +
    "](" +
    publicUrl +
    ")"
  );
}
function computeExpiry(choice) {
  if (!choice || choice === "none" || choice === "keep") return null;
  const map = { "1h": 1, "1d": 24, "7d": 168, "30d": 720 };
  const hours = map[choice];
  if (!hours) return null;
  return new Date(Date.now() + hours * 3600000).toISOString();
}
function statusLabel(status) {
  if (status === "confirmed") return "\u786e\u8ba4\u6536\u5230";
  if (status === "needs_changes") return "\u9700\u8981\u4fee\u6539";
  if (status === "question") return "\u6709\u95ee\u9898";
  return status || "";
}
function formatTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return value;
  }
}

class ShareOptionsModal extends Modal {
  constructor(app, plugin, file, mode, existing, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.mode = mode;
    this.existing = existing || null;
    this.onSubmit = onSubmit;
    this.passwordEnabled = !!(existing && existing.passwordProtected);
    this.password = "";
    this.expiryChoice = mode === "update" ? "keep" : "none";
    this.discussionEnabled = !!(existing && existing.discussionEnabled);
  }

  onOpen() {
    this.render();
  }

  render() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", {
      text: this.mode === "update" ? "\u66f4\u65b0\u5206\u4eab\u8bbe\u7f6e" : "\u5206\u4eab\u6b64\u7b14\u8bb0",
    });
    c.createEl("p", {
      text: this.file.path,
      cls: "private-share-muted",
    });

    new Setting(c)
      .setName("\u8bbf\u95ee\u5bc6\u7801")
      .setDesc(
        this.mode === "update" &&
          this.existing &&
          this.existing.passwordProtected
          ? "\u5df2\u542f\u7528\u5bc6\u7801\u3002\u4fdd\u6301\u5f00\u542f\u4e14\u5bc6\u7801\u7559\u7a7a\uff0c\u4f1a\u4fdd\u7559\u539f\u5bc6\u7801\u3002"
          : "\u5f00\u542f\u540e\uff0c\u8bbf\u95ee\u8005\u9700\u8981\u8f93\u5165\u5bc6\u7801\u624d\u80fd\u67e5\u770b\u6b63\u6587\u548c\u9644\u4ef6\u3002"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.passwordEnabled)
          .onChange((value) => {
            this.passwordEnabled = value;
            this.render();
          })
      );

    if (this.passwordEnabled) {
      new Setting(c)
        .setName(
          this.mode === "update" &&
            this.existing &&
            this.existing.passwordProtected
            ? "\u65b0\u5bc6\u7801\uff08\u53ef\u7559\u7a7a\uff09"
            : "\u5bc6\u7801"
        )
        .setDesc(
          this.mode === "update" &&
            this.existing &&
            this.existing.passwordProtected
            ? "\u7559\u7a7a\u8868\u793a\u7ee7\u7eed\u4f7f\u7528\u5f53\u524d\u5bc6\u7801\u3002"
            : "\u5efa\u8bae\u4f7f\u7528\u4e0d\u5bb9\u6613\u731c\u5230\u7684\u5bc6\u7801\u3002"
        )
        .addText((text) => {
          text.inputEl.type = "password";
          text.setPlaceholder(
            this.mode === "update" &&
              this.existing &&
              this.existing.passwordProtected
              ? "\u7559\u7a7a\u4fdd\u7559\u539f\u5bc6\u7801"
              : "\u8f93\u5165\u8bbf\u95ee\u5bc6\u7801"
          );
          text.onChange((value) => {
            this.password = value;
          });
        });
    }

    new Setting(c)
      .setName("\u6709\u6548\u671f")
      .setDesc(
        this.mode === "update"
          ? "\u53ef\u4ee5\u4fdd\u6301\u5f53\u524d\u6709\u6548\u671f\uff0c\u6216\u91cd\u65b0\u8bbe\u7f6e\u3002"
          : "\u5230\u671f\u540e\u5206\u4eab\u9875\u9762\u548c\u9644\u4ef6\u4f1a\u81ea\u52a8\u5931\u6548\u3002"
      )
      .addDropdown((dropdown) => {
        if (this.mode === "update") {
          dropdown.addOption("keep", "\u4fdd\u6301\u5f53\u524d\u8bbe\u7f6e");
        }
        dropdown
          .addOption("none", "\u6c38\u4e45\u6709\u6548")
          .addOption("1h", "1 \u5c0f\u65f6")
          .addOption("1d", "1 \u5929")
          .addOption("7d", "7 \u5929")
          .addOption("30d", "30 \u5929")
          .setValue(this.expiryChoice)
          .onChange((value) => {
            this.expiryChoice = value;
          });
      });

    new Setting(c)
      .setName("\u5141\u8bb8\u5ba2\u6237\u786e\u8ba4 / \u8bc4\u8bba")
      .setDesc(
        "\u5f00\u542f\u540e\u53ef\u4ee5\u4e3a\u4e0d\u540c\u5ba2\u6237\u751f\u6210\u4e13\u5c5e\u9080\u8bf7\u94fe\u63a5\u3002\u5ba2\u6237\u65e0\u9700\u6ce8\u518c\uff0c\u9996\u6b21\u586b\u5199\u59d3\u540d\u548c\u516c\u53f8\u540e\u5373\u53ef\u786e\u8ba4\u6536\u5230\u3001\u63d0\u51fa\u4fee\u6539\u610f\u89c1\u548c\u56de\u590d\u8ba8\u8bba\u3002\u666e\u901a\u5206\u4eab\u94fe\u63a5\u4ecd\u7136\u4fdd\u6301\u53ea\u8bfb\u3002"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.discussionEnabled)
          .onChange((value) => {
            this.discussionEnabled = value;
          })
      );

    const footer = c.createDiv({
      cls: "private-share-modal-footer",
    });
    footer
      .createEl("button", { text: "\u53d6\u6d88" })
      .addEventListener("click", () => this.close());

    footer
      .createEl("button", {
        text:
          this.mode === "update" ? "\u66f4\u65b0\u5206\u4eab" : "\u521b\u5efa\u5206\u4eab",
        cls: "mod-cta",
      })
      .addEventListener("click", async () => {
        if (
          this.passwordEnabled &&
          (!this.existing ||
            !this.existing.passwordProtected) &&
          !this.password.trim()
        ) {
          new Notice("\u8bf7\u8f93\u5165\u8bbf\u95ee\u5bc6\u7801\uff0c\u6216\u5173\u95ed\u5bc6\u7801\u4fdd\u62a4");
          return;
        }

        const options = {
          passwordProtected: this.passwordEnabled,
          password: this.password,
          expiryMode: this.expiryChoice,
          discussionEnabled: this.discussionEnabled,
        };
        this.close();
        await this.onSubmit(options);
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CreateInviteModal extends Modal {
  constructor(app, plugin, share, onCreated) {
    super(app);
    this.plugin = plugin;
    this.share = share;
    this.onCreated = onCreated;
    this.label = "";
    this.company = "";
  }

  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "\u751f\u6210\u5ba2\u6237\u4e13\u5c5e\u94fe\u63a5" });
    c.createEl("p", {
      text:
        "\u59d3\u540d\u548c\u516c\u53f8\u53ea\u7528\u4e8e\u9884\u586b\u3002\u5ba2\u6237\u9996\u6b21\u6253\u5f00\u65f6\u4ecd\u53ef\u786e\u8ba4\u6216\u4fee\u6539\u81ea\u5df1\u7684\u59d3\u540d\u548c\u516c\u53f8\u3002",
      cls: "private-share-muted",
    });

    new Setting(c)
      .setName("\u5ba2\u6237\u59d3\u540d / \u5907\u6ce8")
      .setDesc("\u4f8b\u5982\uff1a\u5f20\u5de5")
      .addText((text) =>
        text.onChange((value) => {
          this.label = value;
        })
      );

    new Setting(c)
      .setName("\u516c\u53f8")
      .setDesc("\u4f8b\u5982\uff1aABC Motor")
      .addText((text) =>
        text.onChange((value) => {
          this.company = value;
        })
      );

    const footer = c.createDiv({
      cls: "private-share-modal-footer",
    });
    footer
      .createEl("button", { text: "\u53d6\u6d88" })
      .addEventListener("click", () => this.close());
    footer
      .createEl("button", {
        text: "\u751f\u6210\u94fe\u63a5",
        cls: "mod-cta",
      })
      .addEventListener("click", async () => {
        try {
          const invite = await this.plugin.createInvite(
            this.share,
            this.label,
            this.company
          );
          this.close();
          await this.plugin.copyUrl(invite.url, false);
          new Notice("\u5ba2\u6237\u4e13\u5c5e\u94fe\u63a5\u5df2\u751f\u6210\u5e76\u590d\u5236");
          if (this.onCreated) await this.onCreated();
        } catch (error) {
          new Notice(
            "\u751f\u6210\u5ba2\u6237\u94fe\u63a5\u5931\u8d25\uff1a" +
              (error && error.message ? error.message : error),
            8000
          );
        }
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class InviteManagerModal extends Modal {
  constructor(app, plugin, notePath, share) {
    super(app);
    this.plugin = plugin;
    this.notePath = notePath;
    this.share = share;
  }

  async onOpen() {
    await this.render();
  }

  async render() {
    const c = this.contentEl;
    c.empty();
    try {
      this.share = await this.plugin.claimManageShareForPath(
        this.notePath,
        this.share
      );
    } catch (error) {
      c.createEl("h2", { text: "\u5ba2\u6237\u4e13\u5c5e\u94fe\u63a5" });
      c.createEl("p", {
        text:
          "\u8bfb\u53d6\u5206\u4eab\u4fe1\u606f\u5931\u8d25\uff1a" +
          (error && error.message ? error.message : error),
      });
      return;
    }
    c.createEl("h2", { text: "\u5ba2\u6237\u4e13\u5c5e\u94fe\u63a5" });
    c.createEl("p", {
      text: this.share.title || this.notePath,
      cls: "private-share-muted",
    });


    const top = c.createDiv({ cls: "private-share-actions" });
    top
      .createEl("button", {
        text: "\uff0b \u65b0\u5efa\u5ba2\u6237\u94fe\u63a5",
        cls: "mod-cta",
      })
      .addEventListener("click", () => {
        new CreateInviteModal(
          this.app,
          this.plugin,
          this.share,
          async () => this.render()
        ).open();
      });

    let invites = [];
    try {
      invites = await this.plugin.listInvites(this.share);
    } catch (error) {
      c.createEl("p", {
        text:
          "\u8bfb\u53d6\u5ba2\u6237\u94fe\u63a5\u5931\u8d25\uff1a" +
          (error && error.message ? error.message : error),
      });
      return;
    }

    if (!invites.length) {
      c.createEl("p", {
        text: "\u8fd8\u6ca1\u6709\u5ba2\u6237\u4e13\u5c5e\u94fe\u63a5\u3002",
        cls: "private-share-muted",
      });
      return;
    }

    const list = c.createDiv({
      cls: "private-share-manager",
    });

    for (const invite of invites) {
      const row = list.createDiv({
        cls: "private-share-manager-row",
      });
      const info = row.createDiv({
        cls: "private-share-manager-info",
      });

      info.createEl("strong", {
        text: invite.label || "\u672a\u547d\u540d\u5ba2\u6237",
      });
      if (invite.company) {
        info.createEl("div", { text: invite.company });
      }
      info.createEl("div", {
        text:
          "\u521b\u5efa\uff1a" +
          formatTime(invite.createdAt) +
          (invite.lastOpenedAt
            ? " \u00b7 \u6700\u8fd1\u6253\u5f00\uff1a" + formatTime(invite.lastOpenedAt)
            : " \u00b7 \u5c1a\u672a\u6253\u5f00"),
        cls: "private-share-muted",
      });

      if (invite.active === false) {
        info.createSpan({
          text: "\u5df2\u64a4\u9500",
          cls: "private-share-badge",
        });
      }

      const actions = row.createDiv({
        cls: "private-share-manager-actions",
      });

      if (invite.active !== false && invite.url) {
        actions
          .createEl("button", { text: "\u590d\u5236\u94fe\u63a5" })
          .addEventListener("click", async () => {
            await this.plugin.copyUrl(invite.url);
          });

        actions
          .createEl("button", {
            text: "\u64a4\u9500",
            cls: "mod-warning",
          })
          .addEventListener("click", async () => {
            try {
              await this.plugin.revokeInvite(
                this.share,
                invite.id
              );
              new Notice("\u5ba2\u6237\u94fe\u63a5\u5df2\u64a4\u9500");
              await this.render();
            } catch (error) {
              new Notice(
                "\u64a4\u9500\u5931\u8d25\uff1a" +
                  (error && error.message
                    ? error.message
                    : error),
                8000
              );
            }
          });
      }
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class DiscussionModal extends Modal {
  constructor(app, plugin, notePath, share) {
    super(app);
    this.plugin = plugin;
    this.notePath = notePath;
    this.share = share;
  }

  async onOpen() {
    await this.render();
  }

  async render() {
    const c = this.contentEl;
    c.empty();
    try {
      this.share = await this.plugin.claimManageShareForPath(
        this.notePath,
        this.share
      );
    } catch (error) {
      c.createEl("h2", { text: "\u5ba2\u6237\u786e\u8ba4 / \u8ba8\u8bba\u8bb0\u5f55" });
      c.createEl("p", {
        text:
          "\u8bfb\u53d6\u5206\u4eab\u4fe1\u606f\u5931\u8d25\uff1a" +
          (error && error.message ? error.message : error),
      });
      return;
    }
    c.createEl("h2", { text: "\u5ba2\u6237\u786e\u8ba4 / \u8ba8\u8bba\u8bb0\u5f55" });
    c.createEl("p", {
      text: this.share.title || this.notePath,
      cls: "private-share-muted",
    });

    let data;
    try {
      data = await this.plugin.getDiscussion(this.share);
    } catch (error) {
      c.createEl("p", {
        text:
          "\u8bfb\u53d6\u8ba8\u8bba\u5931\u8d25\uff1a" +
          (error && error.message ? error.message : error),
      });
      return;
    }

    const entries = data.entries || [];
    if (!entries.length) {
      c.createEl("p", {
        text: "\u76ee\u524d\u8fd8\u6ca1\u6709\u5ba2\u6237\u786e\u8ba4\u6216\u8bc4\u8bba\u3002",
        cls: "private-share-muted",
      });
      return;
    }

    const list = c.createDiv({
      cls: "private-share-discussion-list",
    });

    const roots = entries.filter((entry) => !entry.parentId);

    const renderEntry = (entry, nested) => {
      const row = list.createDiv({
        cls:
          "private-share-discussion-entry" +
          (nested ? " is-reply" : ""),
      });

      const head = row.createDiv({
        cls: "private-share-discussion-head",
      });
      head.createEl("strong", {
        text:
          (entry.name || "\u8bbf\u5ba2") +
          (entry.company ? " \u00b7 " + entry.company : ""),
      });
      head.createSpan({
        text: formatTime(entry.createdAt),
        cls: "private-share-muted",
      });

      if (entry.kind === "status") {
        row.createEl("div", {
          text: statusLabel(entry.status),
          cls:
            "private-share-status private-share-status-" +
            entry.status,
        });
      } else {
        row.createEl("div", {
          text: entry.text || "",
          cls: "private-share-comment-text",
        });
      }

      const reviewState =
        entry.reviewState || (entry.resolved ? "resolved" : "open");

      const stateRow = row.createDiv({
        cls: "private-share-manager-actions",
      });
      stateRow.createSpan({
        text:
          reviewState === "resolved"
            ? "\u5df2\u89e3\u51b3"
            : reviewState === "needs_changes"
              ? "\u9700\u8981\u4fee\u6539"
              : "\u672a\u89e3\u51b3",
        cls: "private-share-badge",
      });

      const actions = row.createDiv({
        cls: "private-share-manager-actions",
      });

      const addStateButton = (label, targetState) => {
        actions
          .createEl("button", { text: label })
          .addEventListener("click", async () => {
            try {
              await this.plugin.setDiscussionReviewState(
                this.share,
                entry.id,
                targetState
              );
              await this.render();
            } catch (error) {
              new Notice(
                "\u66f4\u65b0\u72b6\u6001\u5931\u8d25\uff1a" +
                  (error && error.message
                    ? error.message
                    : error),
                8000
              );
            }
          });
      };

      if (reviewState === "resolved") {
        addStateButton("\u91cd\u65b0\u4fee\u6539", "needs_changes");
      } else {
        if (reviewState === "open") {
          addStateButton("\u9700\u8981\u4fee\u6539", "needs_changes");
        }
        addStateButton("\u5df2\u89e3\u51b3", "resolved");
      }

      const replies = entries.filter(
        (item) => item.parentId === entry.id
      );
      for (const reply of replies) {
        renderEntry(reply, true);
      }
    };

    for (const root of roots) {
      renderEntry(root, false);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

const PROFILE_FIELDS = {
  attachmentUploadBackend: "string", serverUrl: "string", apiToken: "string", alistPublicUrl: "string",
  alistUsername: "string", alistPassword: "string", alistToken: "string", alistRootPath: "string",
  localUploadUrl: "string", alistLanUrl: "string", alistUseDateFolders: "boolean",
  alistAutoUpload: "boolean", alistDeleteRemoteOnNoteDelete: "boolean",
  alistDeleteRemoteOnLinkRemove: "boolean", alistConfirmRemoteDelete: "boolean",
};
const PROFILE_LAN = ["localUploadUrl", "alistLanUrl"];
const PROFILE_PREFS = Object.keys(PROFILE_FIELDS).filter(k=>PROFILE_FIELDS[k]==="boolean");
const PROFILE_AAD = "obsidian-private-share-config:1:AES-256-GCM:PBKDF2-SHA256:600000";
function portableConfig(settings, options={}) {
  const out={};
  for(const [key,type] of Object.entries(PROFILE_FIELDS)){

    if(options.lan===false&&PROFILE_LAN.includes(key))continue;
    if(options.preferences===false&&PROFILE_PREFS.includes(key))continue;
    if(typeof settings[key]===type)out[key]=settings[key];
  }
  return validatePortableConfig(out);
}
function validatePortableConfig(config) {
  if(!config||typeof config!=="object"||Array.isArray(config))throw Error("配置格式不正确");
  for(const [key,value] of Object.entries(config)){
    if(!Object.prototype.hasOwnProperty.call(PROFILE_FIELDS,key)||typeof value!==PROFILE_FIELDS[key])throw Error("配置包含不支持的字段");
    if(typeof value==="string"&&value.length>4096)throw Error("配置字段过长");
    if(/Url$/.test(key)&&value){let u;try{u=new URL(value)}catch{throw Error("配置地址不正确")}
      if(!["http:","https:"].includes(u.protocol)||u.username||u.password||u.hash)throw Error("配置地址不正确");}
  }
  if(config.attachmentUploadBackend&&!['alist','worker'].includes(config.attachmentUploadBackend))throw Error('Invalid attachment upload backend');return {...config};
}
function profileBytes(value, length) {
  if(typeof value!=="string"||value.length>350000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error("配置文件格式不正确");
  const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  if(length&&bytes.length!==length)throw Error("配置文件格式不正确");return bytes;
}
function profileCrypto() {
  if(!globalThis.crypto?.subtle)throw Error("当前环境不支持加密配置，请更新 Obsidian 后重试");
  return globalThis.crypto;
}
async function profileKey(password,salt) {
  const c=profileCrypto(),enc=new TextEncoder();
  const material=await c.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveKey"]);
  return c.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:600000},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encryptProfile(config,password,version) {
  if(typeof password!=="string"||password.length<8)throw Error("导出密码至少需要 8 个字符");
  config=validatePortableConfig(config);
  const c=profileCrypto(),salt=c.getRandomValues(new Uint8Array(16)),iv=c.getRandomValues(new Uint8Array(12)),key=await profileKey(password,salt),enc=new TextEncoder();
  const ciphertext=await c.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(PROFILE_AAD),tagLength:128},key,enc.encode(JSON.stringify(config)));
  return JSON.stringify({format:"obsidian-private-share-config",schemaVersion:1,pluginVersion:version,createdAt:new Date().toISOString(),crypto:{cipher:"AES-256-GCM",kdf:"PBKDF2-SHA256",iterations:600000,salt:arrayBufferToBase64(salt),iv:arrayBufferToBase64(iv)},ciphertext:arrayBufferToBase64(ciphertext)},null,2);
}
async function decryptProfile(text,password) {
  if(typeof text!=="string"||text.length>262144)throw Error("配置文件过大");
  let file;try{file=JSON.parse(text)}catch{throw Error("请选择加密配置文件，不支持直接导入 data.json")}
  if(file?.format!=="obsidian-private-share-config"||file.schemaVersion!==1||file.crypto?.cipher!=="AES-256-GCM"||file.crypto?.kdf!=="PBKDF2-SHA256"||file.crypto?.iterations!==600000)throw Error("不支持的配置文件版本或加密格式");
  const salt=profileBytes(file.crypto.salt,16),iv=profileBytes(file.crypto.iv,12),ciphertext=profileBytes(file.ciphertext);
  if(ciphertext.length<16)throw Error("配置文件格式不正确");
  const c=profileCrypto(),key=await profileKey(password,salt);let plain;
  try{plain=await c.subtle.decrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(PROFILE_AAD),tagLength:128},key,ciphertext)}catch{throw Error("密码不正确或配置文件已损坏")}
  try{return validatePortableConfig(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(plain)))}catch{throw Error("配置文件内容不正确")}
}

class ActionConfirmModal extends Modal {
  constructor(app,title,message,done){super(app);this.title=title;this.message=message;this.done=done;this.accepted=false;}
  onOpen(){const c=this.contentEl;c.createEl("h2",{text:this.title});c.createEl("p",{text:this.message});
    new Setting(c).addButton(b=>b.setButtonText("取消").onClick(()=>this.close())).addButton(b=>b.setButtonText("确认").setWarning().onClick(()=>{this.accepted=true;this.close()}));}
  onClose(){this.contentEl.empty();this.done(this.accepted)}
}
class ShareExpiryModal extends Modal {
  constructor(app,plugin,notePath,share,done){super(app);Object.assign(this,{plugin,notePath,share,done});this.choice="keep";this.custom="";}
  onOpen(){const c=this.contentEl;c.createEl("h2",{text:"修改分享到期时间"});c.createEl("p",{text:"当前："+(this.share.expiresAt?formatTime(this.share.expiresAt):"永久有效")});
    new Setting(c).setName("有效期").addDropdown(d=>d.addOption("keep","保持当前设置").addOption("none","永久有效").addOption("1h","从现在起 1 小时").addOption("1d","从现在起 1 天").addOption("7d","从现在起 7 天").addOption("30d","从现在起 30 天").addOption("custom","指定日期和时间").setValue(this.choice).onChange(v=>this.choice=v));
    new Setting(c).setName("指定时间").setDesc("仅在选择指定日期和时间时生效，使用本设备时区。").addText(t=>{t.inputEl.type="datetime-local";t.onChange(v=>this.custom=v)});
    new Setting(c).addButton(b=>b.setButtonText("取消").onClick(()=>this.close())).addButton(b=>b.setButtonText("保存").setCta().onClick(async()=>{
      if(this.choice==="keep"){this.close();return}
      let expiry=this.choice==="custom"?(this.custom?new Date(this.custom):null):computeExpiry(this.choice);
      if(this.choice!=="none"&&(!expiry||!Number.isFinite(new Date(expiry).getTime())||new Date(expiry).getTime()<=Date.now())){new Notice("请选择未来的到期时间");return}
      b.setDisabled(true);try{await this.plugin.changeShareExpiry(this.notePath,this.share,this.choice==="none"?null:new Date(expiry).toISOString());this.close();this.done();new Notice("分享有效期已更新")}catch(e){new Notice("修改失败："+e.message);b.setDisabled(false)}
    }));
  }
  onClose(){this.contentEl.empty()}
}
class ConfigTransferModal extends Modal {
  constructor(app,plugin,mode){super(app);Object.assign(this,{plugin,mode});this.password="";this.confirm="";this.text="";this.lan=false;this.preferences=true;this.config=null;this.busy=false;}
  onOpen(){const c=this.contentEl;c.createEl("h2",{text:this.mode==="export"?"导出加密配置":this.mode==="restore"?"撤销上次配置导入":"导入加密配置"});
    if(this.mode==="export"){
      c.createEl("p",{text:"导出连接地址、认证信息和使用偏好。文件加密后可传给自己的新设备。"});
      new Setting(c).setName("包含局域网地址").setDesc("新设备默认使用公网连接；同一局域网可以勾选。").addToggle(t=>t.setValue(false).onChange(v=>this.lan=v));
      new Setting(c).setName("包含上传和清理偏好").addToggle(t=>t.setValue(true).onChange(v=>this.preferences=v));
    }else if(this.mode==="import"){
      c.createEl("p",{text:"选择配置文件或粘贴加密文本，解密预览后再应用。已有附件记录与待处理任务会保留。"});
      const picker=c.createEl("input",{attr:{type:"file",accept:".json,application/json"}});
      picker.addEventListener("change",async()=>{const f=picker.files?.[0];if(!f)return;if(f.size>262144){new Notice("配置文件过大");return}this.text=await f.text();this.textarea.value=this.text;this.config=null;this.preview.empty()});
      const files=this.app.vault.getFiles().filter(f=>/^private-share-config-.*\.json$/.test(f.name));
      if(files.length)new Setting(c).setName("从 Vault 选择").addDropdown(d=>{d.addOption("","请选择配置文件");for(const f of files)d.addOption(f.path,f.path);d.onChange(async v=>{if(!v)return;const f=this.app.vault.getAbstractFileByPath(v);if(f.stat.size>262144){new Notice("配置文件过大");return}this.text=await this.app.vault.read(f);this.textarea.value=this.text;this.config=null;this.preview.empty()})});
      this.textarea=c.createEl("textarea",{cls:"private-share-config-text",attr:{placeholder:"也可以在这里粘贴完整的加密配置",rows:"5"}});
      this.textarea.addEventListener("input",()=>{this.text=this.textarea.value;this.config=null;this.preview.empty()});
    }else c.createEl("p",{text:"输入上次导入时使用的密码，恢复导入前的连接配置。"});
    new Setting(c).setName(this.mode==="export"?"导出密码":"配置密码").addText(t=>{t.inputEl.type="password";t.onChange(v=>{this.password=v;this.config=null;if(this.preview)this.preview.empty()})});
    if(this.mode==="export")new Setting(c).setName("再次输入密码").addText(t=>{t.inputEl.type="password";t.onChange(v=>this.confirm=v)});
    this.preview=c.createDiv();this.result=c.createDiv();
    const action=new Setting(c).addButton(b=>b.setButtonText("取消").onClick(()=>this.close()));
    if(this.mode==="export")action.addButton(b=>b.setButtonText("生成加密配置").setCta().onClick(()=>this.run(b,async()=>{
      if(this.password!==this.confirm)throw Error("两次密码不一致");
      this.text=await encryptProfile(portableConfig(this.plugin.settings,{lan:this.lan,preferences:this.preferences}),this.password,this.plugin.manifest.version);
      this.result.empty();this.result.createEl("p",{text:"加密配置已生成，请保存文件或复制加密文本。"});
      new Setting(this.result).addButton(v=>v.setButtonText("保存到 Vault").onClick(()=>this.run(v,async()=>{const name="private-share-config-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";await this.app.vault.create(name,this.text);new Notice("已保存："+name)}))).addButton(v=>v.setButtonText("复制加密配置").onClick(async()=>{try{await navigator.clipboard.writeText(this.text);new Notice("加密配置已复制")}catch{new Notice("复制失败，请保存到 Vault")}}));
    })));
    else{
      action.addButton(b=>b.setButtonText("解密预览").onClick(()=>this.run(b,async()=>{
        const text=this.mode==="restore"?await this.app.vault.adapter.read(this.plugin.profileBackupPath()):this.text;
        this.config=await decryptProfile(text,this.password);this.preview.empty();
        for(const key of ["serverUrl","alistPublicUrl","alistLanUrl"])if(Object.prototype.hasOwnProperty.call(this.config,key))new Setting(this.preview).setName({serverUrl:"分享服务",alistPublicUrl:"AList 公网",localUploadUrl:"局域网上传",alistLanUrl:"AList 局域网",alistRootPath:"上传目录"}[key]).setDesc(this.config[key]||"未配置");
        this.preview.createEl("p",{text:"认证信息已解密，将在确认后应用；不显示明文。"});
        for(const key of PROFILE_PREFS)if(Object.prototype.hasOwnProperty.call(this.config,key))new Setting(this.preview).setName({alistUseDateFolders:"按日期存储",alistAutoUpload:"自动上传",alistDeleteRemoteOnNoteDelete:"删除笔记时清理附件",alistDeleteRemoteOnLinkRemove:"删除引用时清理附件",alistConfirmRemoteDelete:"清理前确认"}[key]).setDesc(this.config[key]?"开启":"关闭");
      })));
      action.addButton(b=>b.setButtonText(this.mode==="restore"?"确认恢复":"确认应用").setCta().onClick(()=>this.run(b,async()=>{
        if(!this.config)throw Error("请先解密预览配置");
        const imported=this.config;await this.plugin.applyPortableConfig(imported,this.password,{restore:this.mode==="restore"});
        this.result.empty();this.result.createEl("p",{text:"配置已保存，正在检查连接…"});
        let connected=false;try{await this.plugin.api("/api/shares","GET");connected=true}catch{}
        if(connected)await this.plugin.syncAllSharesFromServer({silent:true});
        this.result.empty();this.result.createEl("p",{text:connected?"分享服务已连接；已同步 "+Object.keys(this.plugin.settings.shares||{}).length+" 条分享记录。":"配置已保存，分享服务暂时连接失败。可以关闭弹窗后重试或撤销导入。"});
        const alist=normalizeBase(this.plugin.settings.alistPublicUrl||this.plugin.settings.alistLanUrl);
        if(alist){try{const r=await requestUrl({url:alist+"/api/public/settings",throw:false});this.result.createEl("p",{text:r.status===200?"AList 服务可访问。":"AList 暂时无法访问，请检查地址。"})}catch{this.result.createEl("p",{text:"AList 暂时无法访问，请检查网络。"})}}
        this.config=null;this.preview.empty();new Notice("配置已应用");
      })));
    }
  }
  async run(button,fn){if(this.busy)return;this.busy=true;button.setDisabled(true);try{await fn()}catch(e){new Notice(e.message||"操作失败，请重试")}finally{this.busy=false;button.setDisabled(false)}}
  onClose(){this.password="";this.confirm="";this.config=null;this.text="";this.contentEl.empty()}
}

class ShareManagerModal extends Modal {
  constructor(app,plugin){super(app);this.plugin=plugin;}
  onOpen(){this.render()}
  render(){const c=this.contentEl;c.empty();c.createEl("h2",{text:"Private Share 管理"});const entries=Object.entries(this.plugin.settings.shares||{});
    if(!entries.length){c.createEl("p",{text:"当前没有分享记录。"});return}
    c.createEl("p",{text:"共 "+entries.length+" 篇分享。修改有效期和删除分享无需打开原笔记。",cls:"private-share-muted"});
    const list=c.createDiv({cls:"private-share-manager"});
    for(const [notePath,share] of entries){const row=list.createDiv({cls:"private-share-manager-row"}),info=row.createDiv({cls:"private-share-manager-info"});info.createEl("strong",{text:share.title||notePath});info.createEl("div",{text:notePath,cls:"private-share-muted"});
      const badges=info.createDiv({cls:"private-share-badges"});if(share.passwordProtected)badges.createSpan({text:"密码保护",cls:"private-share-badge"});badges.createSpan({text:share.expiresAt?"到期："+formatTime(share.expiresAt):"永久有效",cls:"private-share-badge"});if(share.discussionEnabled)badges.createSpan({text:"客户讨论",cls:"private-share-badge"});
      const actions=row.createDiv({cls:"private-share-manager-actions"});
      const button=(text,fn)=>{const b=actions.createEl("button",{text});b.addEventListener("click",async()=>{b.disabled=true;try{await fn()}catch(e){new Notice(e.message||"操作失败")}finally{b.disabled=false}});return b;};
      button("复制链接",async()=>{await this.plugin.copyResolvedShareUrl(notePath,share,false);new Notice("分享链接已复制")});
      button("修改到期时间",()=>new ShareExpiryModal(this.app,this.plugin,notePath,share,()=>this.render()).open());
      const file=this.app.vault.getAbstractFileByPath(notePath);if(file instanceof TFile)button("更新正文",()=>{this.close();this.plugin.openShareOptions(file,"update")});
      if(share.discussionEnabled){button("客户链接",()=>new InviteManagerModal(this.app,this.plugin,notePath,share).open());button("查看讨论",()=>new DiscussionModal(this.app,this.plugin,notePath,share).open());}
      button("删除分享",async()=>{const yes=await new Promise(resolve=>new ActionConfirmModal(this.app,"删除分享","此笔记的所有历史分享和客户链接将失效，相关讨论会删除。Vault 原笔记和 AList/R2 自动上传的原附件会保留。",resolve).open());if(yes&&await this.plugin.unshareByPath(notePath,false)){this.render();new Notice("分享已删除")}}).addClass("mod-warning");
    }
  }
  onClose(){this.contentEl.empty()}
}


class PrivateSharePlugin extends Plugin {
  profileBackupPath() {return this.app.vault.configDir+"/plugins/"+this.manifest.id+"/config-before-import.json";}
  async applyPortableConfig(config,password,options={}) {
    config=validatePortableConfig(config);
    if(!options.restore&&(!config.serverUrl||!config.apiToken))throw Error("配置缺少分享服务地址或 API Token");
    if(this.configTransferRunning||this.alistUploadJobs?.size||this.alistCleanupRunning||this.fullShareSyncRunning||this.alistAutoRunning?.size)throw Error("上传、清理或同步正在进行，请稍后再试");
    const hasRecords=Object.keys(this.settings.shares||{}).length||Object.keys(this.settings.alistAssets||{}).length||Object.keys(this.settings.pendingAListUploads||{}).length;
    const changedService=["serverUrl","alistPublicUrl","apiToken"].some(k=>Object.prototype.hasOwnProperty.call(config,k)&&this.settings[k]&&normalizeBase(this.settings[k])!==normalizeBase(config[k]));
    if(hasRecords&&changedService&&!options.restore)throw Error("当前设备已有分享或附件记录，不能直接导入另一服务的配置；请在新的 Vault 中配置");
    this.configTransferRunning=true;this.shareStateRevision=(this.shareStateRevision||0)+1;
    const before=this.settings;
    try{
      if(!options.restore){const backup=await encryptProfile(portableConfig(before),password,this.manifest.version);await this.app.vault.adapter.write(this.profileBackupPath(),backup);}
      this.settings={...this.settings,...config};
      try{await this.saveData(this.settings)}catch{this.settings=before;throw Error("配置保存失败，已恢复原设置")}
      this.settingsTab?.display();
    }finally{this.configTransferRunning=false;}
  }
  async changeShareExpiry(notePath,share,expiresAt) {
    if(expiresAt!==null&&(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now()))throw Error("到期时间必须在未来");
    const claimed=await this.claimManageShareForPath(notePath,share,true);
    if(!claimed)throw Error("服务端已没有该分享，本机记录已清理");
    const data=await this.api("/api/share/"+encodeURIComponent(claimed.shareId)+"/expiry","PATCH",{expiresAt},claimed.editToken);
    const stored=this.settings.shares[notePath];
    if(stored&&stored.shareId===claimed.shareId){stored.expiresAt=data.expiresAt||null;await this.saveData(this.settings);}
    return data;
  }

  async onload() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
    if (!this.settings.shares) this.settings.shares = {};
    this.app.workspace.onLayoutReady(async()=>{
      this.settings.attachmentUploadBackend='alist';
      await this.saveData(this.settings);
      this.scheduleDesktopUploadScan();
    });
    this.registerInterval(window.setInterval(()=>this.scanDesktopAttachments(),300000));
    this.registerEvent(this.app.metadataCache.on('resolved',()=>this.scheduleDesktopUploadScan()));
    this.registerEvent(this.app.vault.on('create',()=>this.scheduleDesktopUploadScan()));
    this.register(()=>{if(this.desktopScanTimer)window.clearTimeout(this.desktopScanTimer);this.desktopUploadsStopped=true;});
    this.addCommand({id:'upload-synced-local-attachments',name:'电脑检查并上传已同步的本地附件',callback:()=>this.scanDesktopAttachments({manual:true})});
    this.alistAutoTimers = new Map();
    this.alistAutoRunning = new Set();
    this.alistReferenceCleanupTimers = new Map();
    this.privateShareStateSyncTimers = new Map();
    this.shareStateRevision = 0;
    this.registerInterval(window.setInterval(() => {
      if (!document.hidden) this.syncAllSharesFromServer({silent:true});
    }, 30000));
    this.registerDomEvent(document, "visibilitychange", () => {
      if (!document.hidden) this.syncAllSharesFromServer({silent:true});
    });
    this.registerDomEvent(window, "focus", () => this.syncAllSharesFromServer({silent:true}));
    this.registerInterval(window.setInterval(() => this.retryAListCleanup(), 60000));
    this.addCommand({id:"retry-remote-attachment-cleanup",name:"重试待清理的远程附件",callback:()=>this.retryAListCleanup()});
    this.register(() => {
      for (const map of [this.alistAutoTimers,this.alistReferenceCleanupTimers,this.privateShareStateSyncTimers]) for (const timer of map.values()) window.clearTimeout(timer);
    });

    this.registerEvent(
      this.app.workspace.on(
        "file-open",
        (file) => {
          if (
            !(file instanceof TFile) ||
            file.extension !== "md"
          ) {
            return;
          }
          const oldTimer =
            this.privateShareStateSyncTimers.get(file.path);
          if (oldTimer) window.clearTimeout(oldTimer);
          const timer = window.setTimeout(() => {
            this.privateShareStateSyncTimers.delete(file.path);
            this.syncShareStateForFile(file, {
              silent: true,
            });
          }, 250);
          this.privateShareStateSyncTimers.set(
            file.path,
            timer
          );
        }
      )
    );

    this.app.workspace.onLayoutReady(async () => {
      await this.syncAllSharesFromServer({
        silent: true,
      });
      const file =
        this.app.workspace.getActiveFile();
      if (file instanceof TFile) {
        await this.syncShareStateForFile(file, {
          silent: true,
        });
      }
    });

    for(const [id,name,mode] of [["export-encrypted-config","导出加密配置","export"],["import-encrypted-config","导入加密配置","import"]])this.addCommand({id,name,callback:()=>new ConfigTransferModal(this.app,this,mode).open()});
    this.settingsTab = new PrivateShareSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    this.addCommand({
      id: "share-current-note",
      name: "\u5206\u4eab\u5f53\u524d\u7b14\u8bb0",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (
          !(file instanceof TFile) ||
          file.extension !== "md"
        )
          return false;
        if (!checking) {
          this.openShareOptions(
            file,
            this.settings.shares[file.path]
              ? "update"
              : "create"
          );
        }
        return true;
      },
    });

    this.addCommand({
      id: "update-current-share",
      name: "\u66f4\u65b0\u5f53\u524d\u5206\u4eab",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (
          !(file instanceof TFile) ||
          file.extension !== "md"
        )
          return false;
        if (!checking)
          this.openShareOptions(file, "update");
        return true;
      },
    });

    this.addCommand({
      id: "copy-current-share-link",
      name: "\u590d\u5236\u5f53\u524d\u5206\u4eab\u94fe\u63a5",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (
          !(file instanceof TFile) ||
          file.extension !== "md"
        )
          return false;
        const share = this.settings.shares[file.path] || {};
        if (!checking) {
          this.copyResolvedShareUrl(
            file.path,
            share
          );
        }
        return true;
      },
    });

    this.addCommand({
      id: "manage-current-customer-links",
      name: "\u7ba1\u7406\u5f53\u524d\u7b14\u8bb0\u7684\u5ba2\u6237\u94fe\u63a5",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (
          !(file instanceof TFile) ||
          file.extension !== "md"
        )
          return false;
        const share = this.settings.shares[file.path] || {};
        if (!checking) {
          new InviteManagerModal(
            this.app,
            this,
            file.path,
            share
          ).open();
        }
        return true;
      },
    });

    this.addCommand({
      id: "view-current-discussion",
      name: "\u67e5\u770b\u5f53\u524d\u7b14\u8bb0\u7684\u5ba2\u6237\u8ba8\u8bba",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (
          !(file instanceof TFile) ||
          file.extension !== "md"
        )
          return false;
        const share = this.settings.shares[file.path] || {};
        if (!checking) {
          new DiscussionModal(
            this.app,
            this,
            file.path,
            share
          ).open();
        }
        return true;
      },
    });

    this.addCommand({
      id: "unshare-current-note",
      name: "\u53d6\u6d88\u5f53\u524d\u5206\u4eab",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (
          !(file instanceof TFile) ||
          file.extension !== "md"
        )
          return false;
        if (!checking) this.unshareFile(file);
        return true;
      },
    });

    this.addCommand({
      id: "upload-current-note-attachments-to-alist",
      name: "上传当前笔记附件到远程存储",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (
          !(file instanceof TFile) ||
          file.extension !== "md"
        )
          return false;
        if (!checking) {
          this.uploadCurrentNoteAttachmentsToAList(file);
        }
        return true;
      },
    });

    this.addCommand({
      id: "manage-shares",
      name: "\u7ba1\u7406\u6240\u6709\u5206\u4eab",
      callback: () =>
        new ShareManagerModal(this.app, this).open(),
    });

    this.addRibbonIcon(
      "share-2",
      "Private Share",
      () => {
        const file = this.app.workspace.getActiveFile();
        if (
          file instanceof TFile &&
          file.extension === "md"
        ) {
          this.openShareOptions(
            file,
            this.settings.shares[file.path]
              ? "update"
              : "create"
          );
        } else {
          new ShareManagerModal(
            this.app,
            this
          ).open();
        }
      }
    );

    this.registerEvent(
      this.app.workspace.on(
        "file-menu",
        (menu, file) => {
          if (
            !(file instanceof TFile) ||
            file.extension !== "md"
          )
            return;
          menu.addSeparator();

          const existing =
            this.settings.shares[file.path];

          menu.addItem((item) =>
            item
              .setTitle(
                existing
                  ? "\u66f4\u65b0\u6b64\u5206\u4eab"
                  : "\u5206\u4eab\u6b64\u7b14\u8bb0"
              )
              .setIcon(
                existing ? "refresh-cw" : "share-2"
              )
              .onClick(() =>
                this.openShareOptions(
                  file,
                  existing ? "update" : "create"
                )
              )
          );

          if (existing && existing.url) {
            menu.addItem((item) =>
              item
                .setTitle("\u590d\u5236\u5206\u4eab\u94fe\u63a5")
                .setIcon("copy")
                .onClick(() =>
                  this.copyResolvedShareUrl(
                    file.path,
                    existing
                  )
                )
            );

              menu.addItem((item) =>
                item
                  .setTitle("\u5ba2\u6237\u4e13\u5c5e\u94fe\u63a5")
                  .setIcon("users")
                  .onClick(() =>
                    new InviteManagerModal(
                      this.app,
                      this,
                      file.path,
                      existing
                    ).open()
                  )
              );
              menu.addItem((item) =>
                item
                  .setTitle("\u67e5\u770b\u5ba2\u6237\u8ba8\u8bba")
                  .setIcon("messages-square")
                  .onClick(() =>
                    new DiscussionModal(
                      this.app,
                      this,
                      file.path,
                      existing
                    ).open()
                  )
              );

            menu.addItem((item) =>
              item
                .setTitle("\u53d6\u6d88\u5206\u4eab")
                .setIcon("link-2-off")
                .onClick(() =>
                  this.unshareFile(file)
                )
            );
          }
        }
      )
    );

    this.registerEvent(
      this.app.vault.on(
        "rename",
        async (file, oldPath) => {
          if (!(file instanceof TFile)) return;
          let changed = false;

          const existing =
            this.settings.shares[oldPath];
          if (existing) {
            delete this.settings.shares[oldPath];
            this.settings.shares[file.path] =
              existing;
            changed = true;
          }

          const assets =
            this.settings.alistAssets &&
            this.settings.alistAssets[oldPath];
          if (assets) {
            delete this.settings.alistAssets[oldPath];
            this.settings.alistAssets[file.path] =
              assets;
            changed = true;
          }

          if (changed) {
            await this.saveData(this.settings);
          }
        }
      )
    );

    this.registerEvent(
      this.app.vault.on(
        "modify",
        (file) => {
          if (!(file instanceof TFile)) return;
          if (file.extension !== "md") {this.scheduleDesktopUploadScan();return;}
          this.scheduleAListReferenceCleanup(file);
          if (this.settings.alistAutoUpload === false) return;
          this.scheduleAListAutoUpload(file);
        }
      )
    );

    this.registerEvent(
      this.app.vault.on(
        "delete",
        async (file) => {
          if (!(file instanceof TFile)) return;
          if (file.extension !== "md") return;
          await this.handleDeletedNoteAListAssets(
            file.path
          );
        }
      )
    );
  }
  scheduleAListAutoUpload(file) {
    if(this.isMobileDevice())return;
    if (!(file instanceof TFile) || file.extension !== "md")
      return;

    const oldTimer = this.alistAutoTimers.get(file.path);
    if (oldTimer) {
      window.clearTimeout(oldTimer);
    }

    const timer = window.setTimeout(async () => {
      this.alistAutoTimers.delete(file.path);
      if (this.settings.alistAutoUpload === false) return;
      if (this.alistAutoRunning.has(file.path)) {
        this.scheduleAListAutoUpload(file);
        return;
      }

      this.alistAutoRunning.add(file.path);
      try {
        await this.uploadCurrentNoteAttachmentsToAList(
          file,
          { automatic: true, silentNoop: true }
        );
      } finally {
        this.alistAutoRunning.delete(file.path);
      }
    }, 2500);

    this.alistAutoTimers.set(file.path, timer);
  }

  isMobileDevice() { return Platform?.isMobile===true; }

  desktopAListBase() {return this.privateLanBase(this.settings.alistLanUrl);}
  privateLanBase(value) {
    if(this.isMobileDevice())return '';
    try{
      const u=new URL(normalizeBase(value));
      const h=u.hostname.toLowerCase(),parts=h.split('.').map(Number);
      const ipv4=/^\d+\.\d+\.\d+\.\d+$/.test(h)&&parts.every(n=>n>=0&&n<=255);
      const privateHost=ipv4&&(parts[0]===10||parts[0]===127||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31);
      if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(privateHost||h==='localhost'||h==='[::1]'||/^\[f[cd][0-9a-f:]+\]$/.test(h)||/\.(local|lan)$/.test(h)))return '';
      return u.origin;
    }catch{return '';}
  }

  async desktopAListAvailable() {
    const base=this.desktopAListBase();if(!base)return false;
    if(this.desktopProbe?.base===base&&Date.now()<this.desktopProbe.until)return this.desktopProbe.ok;
    const ok=await new Promise(resolve=>{
      let settled=false,req;
      const done=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
      const timer=setTimeout(()=>{req?.destroy();done(false);},4000);
      try{req=require(base.startsWith('https:')?'https':'http').get(base+'/api/public/settings',res=>{
        let body='';res.on('data',chunk=>{body+=chunk;if(body.length>262144){req.destroy();done(false);}});
        res.on('error',()=>done(false));res.on('end',()=>{try{done(res.statusCode===200&&JSON.parse(body).code===200);}catch{done(false);}});
      });req.on('error',()=>done(false));}catch{done(false);}
    });
    this.desktopProbe={base,ok,until:Date.now()+15000};return ok;
  }

  scheduleDesktopUploadScan() {
    if(this.isMobileDevice()||this.settings.alistAutoUpload===false||this.desktopUploadsStopped)return;
    if(this.desktopScanTimer)window.clearTimeout(this.desktopScanTimer);
    this.desktopScanTimer=window.setTimeout(()=>{this.desktopScanTimer=null;this.scanDesktopAttachments();},4000);
  }

  hasLocalAttachmentLinks(text,file) {
    const refs=[...text.matchAll(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map(m=>m[1]);
    for(const m of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g))if(!/^(?:https?:|data:|app:|obsidian:|mailto:)/i.test(m[1].trim()))refs.push(m[1].trim().replace(/^<|>$/g,''));
    return refs.some(raw=>{let link=raw.split('#')[0].trim();try{link=decodeURIComponent(link);}catch{}const target=this.app.metadataCache.getFirstLinkpathDest(link,file.path);return target instanceof TFile&&target.extension!=='md';});
  }

  async scanDesktopAttachments(options={}) {
    if(this.isMobileDevice()){if(options.manual)new Notice('手机不上传附件，请将笔记和附件同步到电脑');return false;}
    if(this.desktopScanRunning||this.configTransferRunning||this.desktopUploadsStopped||this.settings.alistAutoUpload===false&&!options.manual)return false;
    this.desktopScanRunning=true;
    try{
      if(!await this.desktopAListAvailable()){if(options.manual)new Notice('家里的 AList 暂不可用，附件继续保留本地，稍后自动重试');return false;}
      let uploaded=0;
      for(const file of this.app.vault.getMarkdownFiles()){
        if(this.desktopUploadsStopped)break;
        if(this.hasLocalAttachmentLinks(await this.app.vault.read(file),file)){
          const changed=await this.uploadCurrentNoteAttachmentsToAList(file,{automatic:true,silentNoop:true});
          if(changed)uploaded++;
        }
      }
      await this.retryUploadedShareRefresh();
      if(options.manual)new Notice('检查完成，已处理 '+uploaded+' 篇笔记');return uploaded>0;
    }catch{if(options.manual)new Notice('附件检查未完成，本地文件保留，稍后重试');return false;}
    finally{this.desktopScanRunning=false;}
  }

  async retryUploadedShareRefresh() {
    if(this.isMobileDevice()||this.uploadedShareRefreshRunning)return;
    this.uploadedShareRefreshRunning=true;
    try{
      for(const notePath of Object.keys(this.settings.pendingUploadedShareRefresh||{})){
        if(this.desktopUploadsStopped)break;
        const file=this.app.vault.getAbstractFileByPath(notePath);
        if(!(file instanceof TFile)){delete this.settings.pendingUploadedShareRefresh[notePath];continue;}
        try{
          const existing=await this.claimManageShareForPath(notePath,this.settings.shares[notePath],true);
          if(existing){
            const prepared=await this.preparePayload(file,{passwordProtected:existing.passwordProtected,expiryMode:'keep',discussionEnabled:existing.discussionEnabled},existing,{skipUpload:true});
            await this.api('/api/update/'+encodeURIComponent(existing.shareId),'PUT',prepared.payload,existing.editToken);
          }
          delete this.settings.pendingUploadedShareRefresh[notePath];
        }catch{ /* Keep only the refresh marker; never recreate a revoked share. */ }
      }
      await this.saveData(this.settings);
    }finally{this.uploadedShareRefreshRunning=false;}
  }

  validateAListSettings(showNotice = true) {
    const lan = normalizeBase(this.settings.alistLanUrl || this.settings.alistPublicUrl);
    const publicBase = normalizeBase(
      this.settings.alistPublicUrl
    );
    if (!lan) {
      if (showNotice) {
      new Notice(
        "\u8bf7\u5148\u5728 Private Share \u8bbe\u7f6e\u4e2d\u586b\u5199 AList \u5c40\u57df\u7f51\u5730\u5740"
      );
      }
      return null;
    }
    if (!publicBase) {
      if (showNotice) {
      new Notice(
        "\u8bf7\u5148\u586b\u5199 AList \u516c\u7f51\u8bbf\u95ee\u5730\u5740"
      );
      }
      return null;
    }
    if (
      !this.settings.alistToken &&
      !this.settings.alistUsername
    ) {
      if (showNotice) {
      new Notice(
        "\u8bf7\u586b\u5199 AList Token\uff0c\u6216\u586b\u5199\u7528\u6237\u540d\u548c\u5bc6\u7801"
      );
      }
      return null;
    }
    return { lan, publicBase };
  }

  async getAListToken() {
    const configured = String(
      this.settings.alistToken || ""
    ).trim();
    if (configured) return configured;

    const lan = normalizeBase(this.settings.alistLanUrl || this.settings.alistPublicUrl);
    const username = String(
      this.settings.alistUsername || ""
    ).trim();
    const password = String(
      this.settings.alistPassword || ""
    );
    if (!lan || !username) {
      throw new Error("AList credentials missing");
    }

    const response = await requestUrl({
      url: lan + "/api/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        password,
      }),
      throw: false,
    });

    let data = {};
    try {
      data =
        response.json ||
        JSON.parse(response.text || "{}");
    } catch (_) {}

    const token =
      data &&
      data.data &&
      typeof data.data.token === "string"
        ? data.data.token
        : "";

    if (
      response.status < 200 ||
      response.status >= 300 ||
      !token
    ) {
      throw new Error(
        (data && (data.message || data.error)) ||
          "AList login failed: HTTP " +
            response.status
      );
    }
    return token;
  }

  buildAListRemotePath(originalName) {
    const root = normalizeRemotePath(
      this.settings.alistRootPath || "/Obsidian"
    );
    const parts = [root];
    if (this.settings.alistUseDateFolders !== false) {
      const d = new Date();
      parts.push(String(d.getFullYear()));
      parts.push(
        String(d.getMonth() + 1).padStart(2, "0")
      );
    }
    const uniqueName =
      uploadStamp() +
      "-" +
      randomShortId() +
      "-" +
      safeRemoteName(originalName);
    return normalizeRemotePath(
      parts.join("/") + "/" + uniqueName
    );
  }

  buildAListPublicUrl(remotePath, sign = "") {
    const publicBase = normalizeBase(
      this.settings.alistPublicUrl
    );
    let url =
      publicBase + "/d" + encodeUrlPath(remotePath);
    if (sign) {
      url += "?sign=" + encodeURIComponent(sign);
    }
    return url;
  }

  async getMediaProxyUrl(upstreamUrl, remotePath = "") {
    const server = this.privateLanBase(this.settings.localUploadUrl)||normalizeBase(this.settings.serverUrl);
    const token = String(this.settings.apiToken || "").trim();
    if (!server || !token) return "";

    const response = await requestUrl({
      url: server + "/api/media-link",
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: upstreamUrl,
        remotePath,
      }),
      throw: false,
    });

    let data = {};
    try {
      data =
        response.json ||
        JSON.parse(response.text || "{}");
    } catch (_) {}

    if (
      response.status < 200 ||
      response.status >= 300 ||
      !data ||
      typeof data.url !== "string" ||
      !data.url
    ) {
      throw new Error(
        (data && (data.error || data.message)) ||
          "Private Share media proxy link failed"
      );
    }
    const parsed = new URL(data.url);
    if (parsed.protocol !== "https:" || !/^\/m\/[A-Za-z0-9_-]{16}$/.test(parsed.pathname) || parsed.search) {
      throw new Error("服务端未返回稳定短链，已保留本地附件。请检查媒体服务配置。");
    }
    return data.url;
  }
  async getAListFileSign(
    remotePath,
    token,
    maxAttempts = 8
  ) {
    const lan = normalizeBase(this.settings.alistLanUrl || this.settings.alistPublicUrl);
    const normalized = normalizeRemotePath(remotePath);
    const slash = normalized.lastIndexOf("/");
    const parentPath =
      slash > 0 ? normalized.slice(0, slash) : "/";
    const fileName = normalized.slice(slash + 1);
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await requestUrl({
          url: lan + "/api/fs/get",
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: normalized,
            password: "",
          }),
          throw: false,
        });

        let data = {};
        try {
          data =
            response.json ||
            JSON.parse(response.text || "{}");
        } catch (_) {}

        const sign =
          data &&
          data.data &&
          typeof data.data.sign === "string"
            ? data.data.sign
            : "";

        if (
          response.status >= 200 &&
          response.status < 300 &&
          (!data.code || data.code === 200) &&
          sign
        ) {
          return sign;
        }

        lastError = new Error(
          (data && (data.message || data.error)) ||
            "AList file info not ready"
        );
      } catch (error) {
        lastError = error;
      }

      try {
        const listResponse = await requestUrl({
          url: lan + "/api/fs/list",
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: parentPath,
            password: "",
            page: 1,
            per_page: 200,
            refresh: true,
          }),
          throw: false,
        });

        let listData = {};
        try {
          listData =
            listResponse.json ||
            JSON.parse(listResponse.text || "{}");
        } catch (_) {}

        const content =
          listData &&
          listData.data &&
          Array.isArray(listData.data.content)
            ? listData.data.content
            : [];

        const item = content.find(
          (entry) =>
            entry &&
            entry.name === fileName &&
            typeof entry.sign === "string" &&
            entry.sign
        );

        if (item) {
          return item.sign;
        }

        if (
          listResponse.status < 200 ||
          listResponse.status >= 300 ||
          (listData.code && listData.code !== 200)
        ) {
          lastError = new Error(
            (listData &&
              (listData.message || listData.error)) ||
              "AList directory refresh failed"
          );
        }
      } catch (error) {
        lastError = error;
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            Math.min(500 * attempt, 2500)
          )
        );
      }
    }

    throw (
      lastError ||
      new Error("AList file sign unavailable")
    );
  }
  async uploadCurrentNoteAttachmentsToAList(file, runOptions = {}) {
    if(this.isMobileDevice()){if(!runOptions.automatic&&!runOptions.silentNoop)new Notice('手机不上传附件，请同步到电脑后上传');return false;}
    if (this.configTransferRunning) return false;
    this.alistUploadJobs ||= new Map();
    if (this.alistUploadJobs.has(file.path)) return this.alistUploadJobs.get(file.path);
    const job = this.performAListUpload(file, runOptions);
    this.alistUploadJobs.set(file.path, job);
    try { return await job; } finally { this.alistUploadJobs.delete(file.path); }
  }

  async ensureAListDirectory(remotePath, token) {
    const lan = this.desktopAListBase();
    const normalized = normalizeRemotePath(remotePath);
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length <= 1) return;

    // The first segment is normally the AList mount itself
    // (for example /Obsidian), so only create folders below it.
    let current = "/" + parts[0];
    for (let i = 1; i < parts.length; i++) {
      current += "/" + parts[i];
      const response = await requestUrl({
        url: lan + "/api/fs/mkdir",
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: current }),
        throw: false,
      });

      let data = {};
      try {
        data =
          response.json ||
          JSON.parse(response.text || "{}");
      } catch (_) {}

      const message = String(
        (data && (data.message || data.error)) || ""
      );
      const alreadyExists =
        /exist|already|存在/i.test(message);
      const ok =
        (response.status >= 200 &&
          response.status < 300 &&
          (!data.code || data.code === 200)) ||
        alreadyExists;

      if (!ok) {
        throw new Error(
          message ||
            "AList mkdir failed: HTTP " +
              response.status
        );
      }
    }
  }


  async uploadFileToAList(target,token) {
    if(this.isMobileDevice()||!this.desktopAListBase())throw Error('附件只由电脑通过家里的 AList 上传');
    const identity=target.path+':'+target.stat.mtime+':'+target.stat.size;
    this.desktopFileJobs ||= new Map();
    if(this.desktopFileJobs.has(identity))return this.desktopFileJobs.get(identity);
    const job=(this.desktopFileTail||Promise.resolve()).catch(()=>{}).then(()=>this.performDesktopAListUpload(target,token,identity));
    this.desktopFileTail=job.then(()=>{},()=>{});this.desktopFileJobs.set(identity,job);
    try{return await job;}finally{this.desktopFileJobs.delete(identity);}
  }

  async performDesktopAListUpload(target,token,identity) {
    const {size,mtime}=target.stat;
    if(identity!==target.path+':'+mtime+':'+size)throw Error('附件在等待上传时发生变化，请稍后重试');
    const base=this.desktopAListBase();if(!base||this.desktopUploadsStopped)throw Error('电脑附件上传已暂停');
    this.settings.pendingAListUploads ||= {};
    const uploadKey='alist:'+identity;
    let pending=this.settings.pendingAListUploads[uploadKey];
    const legacy=this.settings.pendingAListUploads[identity];
    if(!pending&&legacy?.remotePath&&!legacy.backend){pending={backend:'alist',remotePath:legacy.remotePath,uploaded:true,legacyUploadKey:identity};this.settings.pendingAListUploads[uploadKey]=pending;await this.saveData(this.settings);}
    const previous=Object.values(this.settings.alistAssets||{}).flat().find(a=>a.backend!=='worker'&&a.uploadIdentity===identity&&!a.pendingDelete);
    if(!pending&&previous)pending={backend:'alist',remotePath:previous.remotePath,uploaded:true};
    // Reuse a confirmed AList upload if only link registration failed.
    if(!pending){pending={backend:'alist',remotePath:this.buildAListRemotePath(target.name),uploaded:false};this.settings.pendingAListUploads[uploadKey]=pending;await this.saveData(this.settings);}
    // A successful synchronous PUT is persisted before link registration.
    // Registration itself HEAD-checks R2, so AList listing/cache failures do
    // not trigger another upload of a confirmed object.
    if(!pending.uploaded){
      const binary=await this.app.vault.readBinary(target);
      if(binary.byteLength!==size)throw Error('附件正在同步，请稍后重试');
      await this.ensureAListDirectory(pending.remotePath.slice(0,pending.remotePath.lastIndexOf('/')),token);
      const r=await requestUrl({url:base+'/api/fs/put',method:'PUT',headers:{Authorization:token,'File-Path':encodeURIComponent(pending.remotePath),'As-Task':'false','Content-Type':mimeFromName(target.name)},body:binary,throw:false});
      if(r.status<200||r.status>=300||r.json?.code!==200)throw Error('AList 上传失败，本地附件保留');
      pending.uploaded=true;await this.saveData(this.settings);
    }
    const current=await this.app.vault.adapter.stat(target.path);
    if(!current||current.size!==size||current.mtime!==mtime)throw Error('附件同步过程中发生变化，本地链接保留，请重试');
    if(this.desktopUploadsStopped)throw Error('插件已停止，已上传记录保留');
    const publicUrl=await this.getMediaProxyUrl('',pending.remotePath);
    return {backend:'alist',remotePath:pending.remotePath,publicUrl,uploadKey,legacyUploadKey:pending.legacyUploadKey,uploadIdentity:identity};
  }

  async collectVaultMediaUrls() {
    const urls=new Set();
    for(const file of this.app.vault.getMarkdownFiles()){
      const text=await this.app.vault.read(file);
      for(const url of text.match(/https?:\/\/[^\s<>"')]+/g)||[])urls.add(url.replaceAll('&amp;','&'));
    }
    return [...urls];
  }

  async performAListUpload(file, runOptions = {}) {
    const automatic = !!runOptions.automatic;
    const silentNoop = !!runOptions.silentNoop;
    try {
      if(this.isMobileDevice())return false;
      if(!await this.desktopAListAvailable()){if(!automatic&&!silentNoop)new Notice('家里的 AList 暂不可用，附件继续保留本地');return false;}
      const settings=!!(this.settings.serverUrl&&this.settings.apiToken);
      if (!settings) return false;

      if(!this.validateAListSettings(!automatic))return false;
      const token=await this.getAListToken();
      let markdown = await this.app.vault.read(file);

      const replacements = [];
      const seenTargets = new Map();

      const wikiRe =
        /!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
      for (const match of [...markdown.matchAll(wikiRe)]) {
        const raw = match[1].trim();
        const alias = (match[2] || "").trim();
        const target =
          this.app.metadataCache.getFirstLinkpathDest(
            raw,
            file.path
          );
        if (
          !(target instanceof TFile) ||
          target.extension === "md"
        )
          continue;

        let uploaded = seenTargets.get(target.path);
        if (!uploaded) {
          if (!automatic) {
          new Notice(
            "正在上传附件：" +
              target.name,
            2500
          );
          }
          uploaded=await this.uploadFileToAList(target,token);
          seenTargets.set(target.path, uploaded);
        }

        const label = alias || target.name;
        const replacement = aListReplacement(
          target.name,
          label,
          uploaded.publicUrl,
          isImageName(target.name)
        );
        replacements.push({
          from: match[0],
          to: replacement,
        });
      }

      const mdRe =
        /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
      for (const match of [...markdown.matchAll(mdRe)]) {
        const rawTarget = String(match[3] || "").trim();
        if (
          /^(?:https?:|data:|app:|obsidian:|mailto:)/i.test(
            rawTarget
          )
        )
          continue;

        const cleanTarget = rawTarget
          .replace(/^<|>$/g, "")
          .split("#")[0]
          .trim();
        let decoded = cleanTarget;
        try {
          decoded = decodeURIComponent(cleanTarget);
        } catch (_) {}

        const target =
          this.app.metadataCache.getFirstLinkpathDest(
            decoded,
            file.path
          );
        if (
          !(target instanceof TFile) ||
          target.extension === "md"
        )
          continue;

        let uploaded = seenTargets.get(target.path);
        if (!uploaded) {
          if (!automatic) {
          new Notice(
            "正在上传附件：" +
              target.name,
            2500
          );
          }
          uploaded=await this.uploadFileToAList(target,token);
          seenTargets.set(target.path, uploaded);
        }

        const embedded =
          match[1] === "!" || isImageName(target.name);
        const label = match[2] || target.name;
        replacements.push({
          from: match[0],
          to: aListReplacement(
            target.name,
            label,
            uploaded.publicUrl,
            embedded
          ),
        });
      }

      if (!replacements.length) {
        if (!silentNoop) {
          new Notice(
            "\u5f53\u524d\u7b14\u8bb0\u6ca1\u6709\u627e\u5230\u53ef\u4e0a\u4f20\u7684\u672c\u5730\u9644\u4ef6"
          );
        }
        return false;
      }

      await this.app.vault.process(file, (latest) => {
        for (const item of replacements) latest = latest.split(item.from).join(item.to);
        markdown = latest;
        return latest;
      });
      this.recordAListAssetsForNote(
        file.path,
        new Map([...seenTargets].filter(([, asset]) => markdown.includes(asset.publicUrl)))
      );
      if(automatic){this.settings.pendingUploadedShareRefresh ||= {};this.settings.pendingUploadedShareRefresh[file.path]=true;}
      await this.saveData(this.settings);
      if(automatic)await this.retryUploadedShareRefresh();
      new Notice(
        (automatic
          ? "\u5df2\u81ea\u52a8\u4e0a\u4f20 "
          : "\u5df2\u4e0a\u4f20 ") +
          seenTargets.size +
          " 个附件，并替换为稳定公网链接",
        automatic ? 4500 : 7000
      );
      return true;
    } catch (error) {
      console.error(
        "Remote attachment upload failed",
        error
      );
      new Notice(
        (automatic ? "附件自动上传失败\uff1a" : "附件上传失败\uff1a") +
          (error && error.message
            ? error.message
            : error),
        9000
      );
      return false;
    }
  }

  recordAListAssetsForNote(notePath, uploadedMap) {
    if (!this.settings.alistAssets) {
      this.settings.alistAssets = {};
    }
    const current = Array.isArray(
      this.settings.alistAssets[notePath]
    )
      ? this.settings.alistAssets[notePath]
      : [];
    const byRemotePath = new Map(
      current
        .filter(
          (item) =>
            item &&
            typeof item.remotePath === "string"
        )
        .map((item) => [item.remotePath, item])
    );

    for (const [localPath, uploaded] of uploadedMap) {
      if (
        !uploaded ||
        typeof uploaded.remotePath !== "string"
      )
        continue;
      if (uploaded.uploadKey) delete this.settings.pendingAListUploads?.[uploaded.uploadKey];
      if (uploaded.legacyUploadKey) delete this.settings.pendingAListUploads?.[uploaded.legacyUploadKey];
      byRemotePath.set(uploaded.remotePath, {
        backend: uploaded.backend || "alist",
        uploadIdentity: uploaded.uploadIdentity || "",
        remotePath: uploaded.remotePath,
        publicUrl: uploaded.publicUrl || "",
        originalLocalPath: localPath || "",
        uploadedAt: new Date().toISOString(),
        seenInNote: true,
      });
    }

    this.settings.alistAssets[notePath] =
      [...byRemotePath.values()];
  }

  scheduleAListReferenceCleanup(file) {
    if (!(file instanceof TFile) || file.extension !== "md")
      return;
    if (
      this.settings.alistDeleteRemoteOnLinkRemove ===
      false
    ) {
      return;
    }

    const oldTimer =
      this.alistReferenceCleanupTimers.get(file.path);
    if (oldTimer) window.clearTimeout(oldTimer);

    const timer = window.setTimeout(async () => {
      this.alistReferenceCleanupTimers.delete(file.path);
      try {
        await this.cleanupRemovedAListAssetLinks(file);
      } catch (error) {
        console.error(
          "AList orphan attachment cleanup failed",
          error
        );
      }
    }, 5000);

    this.alistReferenceCleanupTimers.set(
      file.path,
      timer
    );
  }

  async cleanupRemovedAListAssetLinks(file) {
    if (this.configTransferRunning) return false;
    if (this.settings.alistDeleteRemoteOnLinkRemove === false) return;
    if (this.alistAutoRunning?.has(file.path) || this.alistUploadJobs?.has(file.path)) return;
    const assets = this.settings.alistAssets?.[file.path] || [];
    if (!assets.length) return;
    const text = (await this.app.vault.read(file)).replaceAll("&amp;", "&");
    for (const asset of assets) {
      if (asset.publicUrl && text.includes(asset.publicUrl)) {
        asset.seenInNote = true; delete asset.pendingDelete;
      } else if (asset.seenInNote) {
        asset.pendingDelete = true; asset.deleteReason = "link";
      }
    }
    await this.saveData(this.settings);
    await this.retryAListCleanup();
  }

  async verifyAListReferences() {
    const urls = new Set();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const text = await this.app.vault.read(file);
      for (const url of text.match(/https?:\/\/[^\s<>"')]+/g) || []) urls.add(url.replaceAll("&amp;", "&"));
    }
    const data = await this.api("/api/media/references", "POST", {urls:[...urls]});
    if (!Array.isArray(data.remotePaths) || data.unresolved !== false) throw new Error("存在未能核实的附件引用，已保留远程文件");
    return new Set(data.remotePaths.map(normalizeRemotePath));
  }

  async retryAListCleanup() {
    if(this.isMobileDevice())return false;
    if (this.configTransferRunning) return false;
    if (this.alistCleanupRunning) return;
    this.alistCleanupRunning = true;
    try {
      const entries = Object.entries(this.settings.alistAssets || {});
      for (const [notePath, assets] of entries) {
        if (!Array.isArray(assets)) continue;
        for (const asset of [...assets]) {
          if (!asset.pendingDelete || !asset.remotePath) continue;
          if (asset.deleteReason === "note" && this.settings.alistDeleteRemoteOnNoteDelete === false) continue;
          if (asset.deleteReason === "link" && this.settings.alistDeleteRemoteOnLinkRemove === false) continue;
          if (this.alistAutoRunning?.size || this.alistUploadJobs?.size) continue;
          try {
            // Re-read all notes immediately before each delete. Unavailable checks fail closed.
            const references = await this.verifyAListReferences();
            if (references.has(normalizeRemotePath(asset.remotePath))) {
              asset.cleanupStatus = "referenced"; continue;
            }
            // Unknown historical ownership records protect the object as well.
            const uncertain = entries.some(([owner, list]) => owner !== notePath && Array.isArray(list) && list.some(x => x.remotePath === asset.remotePath && !x.pendingDelete));
            if (uncertain) {asset.cleanupStatus = "tracked-elsewhere";continue;}
            if(asset.backend==='worker')await this.api('/api/media/direct-delete','POST',{remotePath:asset.remotePath,urls:await this.collectVaultMediaUrls()});
            else {const token = await this.getAListToken();await this.deleteAListRemoteAsset(asset.remotePath, token);}
            const index = assets.indexOf(asset); if (index >= 0) assets.splice(index, 1);
          } catch (_) {
            asset.cleanupStatus = "retry";
            asset.lastAttempt = new Date().toISOString();
          }
        }
        if (!assets.length) delete this.settings.alistAssets[notePath];
      }
      await this.saveData(this.settings);
    } finally { this.alistCleanupRunning = false; }
  }

  async deleteAListRemoteAsset(remotePath, token) {
    const lan = normalizeBase(this.settings.alistLanUrl || this.settings.alistPublicUrl);
    const normalized = normalizeRemotePath(remotePath);
    const slash = normalized.lastIndexOf("/");
    const dir =
      slash > 0 ? normalized.slice(0, slash) : "/";
    const name = normalized.slice(slash + 1);
    if (!name) {
      throw new Error("invalid remote asset path");
    }

    const response = await requestUrl({
      url: lan + "/api/fs/remove",
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dir,
        names: [name],
      }),
      throw: false,
    });

    let data = {};
    try {
      data =
        response.json ||
        JSON.parse(response.text || "{}");
    } catch (_) {}

    const ok =
      response.status >= 200 &&
      response.status < 300 &&
      (!data.code || data.code === 200);
    if (!ok) {
      throw new Error(
        (data && (data.message || data.error)) ||
          "AList delete failed: HTTP " +
            response.status
      );
    }
  }

  async confirmRemoteCleanup(notePath) {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      let finished = false;
      const done = (answer) => { if (finished) return; finished = true; resolve(answer); modal.close(); };
      modal.onOpen = () => {
        modal.contentEl.createEl("h3", {text:"清理已删除笔记的远程附件？"});
        modal.contentEl.createEl("p", {text:notePath});
        modal.contentEl.createEl("p", {text:"只清理插件上传且没有其他引用的文件。核实失败的文件将保留。"});
        const buttons = modal.contentEl.createDiv();
        buttons.createEl("button", {text:"保留"}).onclick = () => done(false);
        buttons.createEl("button", {text:"检查并清理", cls:"mod-warning"}).onclick = () => done(true);
      };
      modal.onClose = () => {if (!finished) {finished = true; resolve(false);}};
      modal.open();
    });
  }

  async handleDeletedNoteAListAssets(notePath) {
    if (this.settings.alistDeleteRemoteOnNoteDelete === false) return;
    const assets = this.settings.alistAssets?.[notePath] || [];
    if (!assets.length) return;
    if (this.settings.alistConfirmRemoteDelete !== false && !await this.confirmRemoteCleanup(notePath)) return;
    for (const asset of assets) {asset.pendingDelete = true;asset.deleteReason = "note";}
    await this.saveData(this.settings);
    await this.retryAListCleanup();
  }
  validateSettings() {
    const server = normalizeBase(
      this.settings.serverUrl
    );
    if (!server) {
      new Notice(
        "\u8bf7\u5148\u5728 Private Share \u8bbe\u7f6e\u91cc\u586b\u5199\u5206\u4eab\u670d\u52a1\u5668\u5730\u5740"
      );
      return null;
    }
    if (!this.settings.apiToken) {
      new Notice("\u8bf7\u5148\u586b\u5199 API Token");
      return null;
    }
    return server;
  }

  async openShareOptions(file, mode) {
    await this.syncShareStateForFile(file, {silent:true});
    mode = this.settings.shares[file.path] ? "update" : "create";
    const existing =
      this.settings.shares[file.path] || null;
    new ShareOptionsModal(
      this.app,
      this,
      file,
      mode,
      existing,
      async (options) => {
        if (mode === "update" && existing) {
          await this.updateShare(file, options);
        } else {
          await this.shareFile(file, options);
        }
      }
    ).open();
  }

  async preparePayload(file, options, existing, runOptions={}) {
    if(!runOptions.skipUpload&&this.settings.alistAutoUpload!==false)await this.uploadCurrentNoteAttachmentsToAList(file,{silentNoop:true});
    let markdown=await this.app.vault.read(file);
    const attachments=[],uploads=[];
    const labelText=value=>String(value).replace(/[\[\]<>]/g,'');
    const placeholder=(target,label)=>{
      return '**'+labelText(label||target.name)+'（附件仅保存在本地，等待电脑上传）**';
    };
    markdown=markdown.replace(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,(match,raw,alias)=>{
      const target=this.app.metadataCache.getFirstLinkpathDest(raw.trim(),file.path);
      return target instanceof TFile&&target.extension!=='md'?placeholder(target,alias):match;
    });
    markdown=markdown.replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g,(match,embed,label,raw)=>{
      if(/^(?:https?:|data:|app:|obsidian:|mailto:)/i.test(raw.trim()))return match;
      let local=raw.trim().replace(/^<|>$/g,'').split('#')[0];try{local=decodeURIComponent(local)}catch{}
      const target=this.app.metadataCache.getFirstLinkpathDest(local,file.path);
      return target instanceof TFile&&target.extension!=='md'?placeholder(target,label):match;
    });
    markdown=markdown.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,(_m,target,alias)=>alias||target);

    const payloadOptions = {
      passwordProtected: !!(
        options && options.passwordProtected
      ),
      password:
        options && options.password
          ? options.password
          : "",
      expiryMode:
        options && options.expiryMode
          ? options.expiryMode
          : "none",
      discussionEnabled: !!(
        options && options.discussionEnabled
      ),
    };

    if (payloadOptions.expiryMode !== "keep") {
      payloadOptions.expiresAt =
        computeExpiry(payloadOptions.expiryMode);
    }

    const payload = {
      title: file.basename,
      sourcePath: file.path,
      markdown,
      attachments,
      options: payloadOptions,
      clientMeta: {
        hadPassword: !!(
          existing &&
          existing.passwordProtected
        ),
        previousExpiresAt:
          existing && existing.expiresAt
            ? existing.expiresAt
            : null,
      },
    };
    return { payload, uploads };
  }

  async api(
    apiPath,
    method,
    body,
    editToken
  ) {
    const server = this.validateSettings();
    if (!server)
      throw new Error("missing settings");

    if (method !== "GET") this.shareStateRevision = (this.shareStateRevision || 0) + 1;
    const headers = {
      Authorization:
        "Bearer " + this.settings.apiToken,
      "Content-Type": "application/json",
    };
    if (editToken) {
      headers["X-Edit-Token"] = editToken;
    }

    const response = await requestUrl({
      url: server + apiPath,
      method,
      headers,
      body: body
        ? JSON.stringify(body)
        : undefined,
      throw: false,
    });

    let data = {};
    try {
      data =
        response.json ||
        JSON.parse(response.text || "{}");
    } catch (_) {}

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      const error = new Error(data.error || "HTTP " + response.status);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async copyUrl(url, showNotice = true) {
    try {
      await navigator.clipboard.writeText(url);
      if (showNotice)
        new Notice(
          "\u5206\u4eab\u94fe\u63a5\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f"
        );
    } catch (_) {
      new Notice("\u5206\u4eab\u94fe\u63a5\uff1a" + url, 10000);
    }
  }

  async shareFile(file, options = {}, runOptions = {}) {
    try {
      if (!runOptions.skipClaim) {
        const claimed = await this.claimManageShareForPath(
          file.path,
          this.settings.shares[file.path] || null,
          true
        );
        if (claimed) {
          return await this.updateShare(
            file,
            options,
            { skipClaim: true }
          );
        }
      }

      new Notice("\u6b63\u5728\u751f\u6210\u5206\u4eab\u94fe\u63a5...");
      const prepared =
        await this.preparePayload(
          file,
          options,
          null
        );
      const data = await this.api(
        "/api/publish",
        "POST",
        prepared.payload
      );

      this.settings.shares[file.path] = {
        shareId: data.shareId,
        editToken: data.editToken,
        url: data.url,
        title: file.basename,
        passwordProtected:
          !!data.passwordProtected,
        expiresAt: data.expiresAt || null,
        discussionEnabled:
          !!data.discussionEnabled,
      };

      await this.saveData(this.settings);
      await this.copyUrl(data.url);
    } catch (error) {
      console.error(
        "Private Share publish failed",
        error
      );
      new Notice(
        "\u5206\u4eab\u5931\u8d25\uff1a" +
          (error && error.message
            ? error.message
            : error),
        8000
      );
    }
  }

  async updateShare(
    file,
    options = {},
    runOptions = {}
  ) {
    try {
      let existing =
        this.settings.shares[file.path] || null;
      if (!runOptions.skipClaim) {
        existing = await this.claimManageShareForPath(
          file.path,
          existing,
          true
        );
      }
      if (!existing) {
        return this.shareFile(
          file,
          options,
          { skipClaim: true }
        );
      }

      new Notice("\u6b63\u5728\u66f4\u65b0\u5206\u4eab...");
      const prepared =
        await this.preparePayload(
          file,
          options,
          existing
        );
      const data = await this.api(
        "/api/update/" +
          encodeURIComponent(existing.shareId),
        "PUT",
        prepared.payload,
        existing.editToken
      );


      if (data.url) existing.url = data.url;
      existing.title = file.basename;
      existing.passwordProtected =
        !!data.passwordProtected;
      existing.expiresAt =
        data.expiresAt || null;
      existing.discussionEnabled =
        !!data.discussionEnabled;

      await this.saveData(this.settings);
      await this.copyUrl(existing.url);
    } catch (error) {
      console.error(
        "Private Share update failed",
        error
      );
      new Notice(
        "\u66f4\u65b0\u5931\u8d25\uff1a" +
          (error && error.message
            ? error.message
            : error),
        8000
      );
    }
  }
  async copyResolvedShareUrl(notePath, share, showNotice = true) {
    const resolved = await this.resolveShareForPath(
      notePath,
      share
    );
    const stored = this.settings.shares[notePath];
    if (stored && resolved.url) {
      stored.url = resolved.url;
      stored.shareId = resolved.shareId || stored.shareId;
      await this.saveData(this.settings);
    }
    await this.copyUrl(
      resolved.url || (share && share.url) || "",
      showNotice
    );
    return resolved.url || (share && share.url) || "";
  }

  async syncAllSharesFromServer(options = {}) {
    if(this.configTransferRunning)return this.settings.shares||{};
    const silent = options.silent !== false;
    if (this.fullShareSyncRunning) return this.settings.shares || {};
    this.fullShareSyncRunning = true;
    const revision = this.shareStateRevision || 0;
    const stateSnapshot = JSON.stringify(this.settings.shares);
    try {
      const data = await this.api(
        "/api/shares",
        "GET",
        null,
        null
      );
      if (!Array.isArray(data.shares)) throw new Error("Invalid share-state response");
      if (revision !== (this.shareStateRevision || 0) || stateSnapshot !== JSON.stringify(this.settings.shares)) return this.settings.shares;
      const remoteShares = data.shares;
      const local = this.settings.shares || {};
      const next = {};

      for (const remote of remoteShares) {
        const notePath = String(
          remote && remote.sourcePath
            ? remote.sourcePath
            : ""
        );
        if (!notePath || next[notePath]) continue;

        const existing = local[notePath] || null;
        const sameShare =
          existing &&
          existing.shareId &&
          remote.shareId &&
          existing.shareId === remote.shareId;

        next[notePath] = Object.assign(
          {},
          existing || {},
          remote,
          {
            editToken:
              sameShare && existing.editToken
                ? existing.editToken
                : "",
          }
        );
      }

      this.settings.shares = next;
      await this.saveData(this.settings);
      return next;
    } catch (error) {
      if (!silent) {
        new Notice(
          "\u540c\u6b65\u5168\u90e8\u5206\u4eab\u5931\u8d25\uff1a" +
            (error && error.message
              ? error.message
              : error),
          6000
        );
      }
      return this.settings.shares || {};
    } finally { this.fullShareSyncRunning = false; }
  }
  async syncShareStateForPath(
    notePath,
    options = {}
  ) {
    if (this.configTransferRunning) return this.settings.shares[notePath] || null;
    const silent = options.silent !== false;
    const existing =
      this.settings.shares[notePath] || null;
    const revision = this.shareStateRevision || 0;

    try {
      const data = await this.api(
        "/api/share/resolve?sourcePath=" +
          encodeURIComponent(notePath),
        "GET",
        null,
        null
      );

      if (revision !== (this.shareStateRevision || 0)) return this.settings.shares[notePath] || null;
      if (!data.shareId) throw new Error("Invalid share-state response");
      const sameShare =
        existing &&
        existing.shareId &&
        data.shareId &&
        existing.shareId === data.shareId;

      this.settings.shares[notePath] = Object.assign(
        {},
        existing || {},
        data,
        {
          editToken:
            sameShare && existing.editToken
              ? existing.editToken
              : "",
        }
      );
      await this.saveData(this.settings);
      return this.settings.shares[notePath];
    } catch (error) {
      const message =
        error && error.message
          ? String(error.message)
          : String(error || "");

      if (revision !== (this.shareStateRevision || 0)) return this.settings.shares[notePath] || null;
      if (error.status === 404 && message.toLowerCase().includes("share not found")) {
        if (existing) {
          delete this.settings.shares[notePath];
          await this.saveData(this.settings);
        }
        return null;
      }

      if (!silent) {
        new Notice(
          "\u540c\u6b65\u5206\u4eab\u72b6\u6001\u5931\u8d25\uff1a" +
            message,
          6000
        );
      }
      return existing;
    }
  }

  async syncShareStateForFile(file, options = {}) {
    if (
      !(file instanceof TFile) ||
      file.extension !== "md"
    ) {
      return null;
    }
    return this.syncShareStateForPath(
      file.path,
      options
    );
  }
  async claimManageShareForPath(
    notePath,
    fallbackShare,
    allowMissing = false
  ) {
    try {
      const data = await this.api(
        "/api/share/claim",
        "POST",
        { sourcePath: notePath },
        null
      );
      const merged = Object.assign(
        {},
        fallbackShare || {},
        data
      );
      this.settings.shares[notePath] = merged;
      await this.saveData(this.settings);
      return merged;
    } catch (error) {
      const message =
        error && error.message
          ? String(error.message)
          : String(error || "");
      if (
        allowMissing && error.status === 404 &&
        message.toLowerCase().includes("share not found")
      ) {
        if (this.settings.shares[notePath]) {
          delete this.settings.shares[notePath];
          await this.saveData(this.settings);
        }
        return null;
      }
      throw error;
    }
  }
  async resolveShareForPath(notePath, fallbackShare) {
    const data = await this.api(
      "/api/share/resolve?sourcePath=" +
        encodeURIComponent(notePath),
      "GET",
      null,
      null
    );
    return Object.assign({}, fallbackShare || {}, data, {
      editToken:
        (fallbackShare && fallbackShare.editToken) || "",
    });
  }

  async createInvite(
    share,
    label,
    company
  ) {
    const data = await this.api(
      "/api/share/" +
        encodeURIComponent(share.shareId) +
        "/invites",
      "POST",
      { label, company },
      share.editToken
    );
    return data.invite;
  }

  async listInvites(share) {
    const data = await this.api(
      "/api/share/" +
        encodeURIComponent(share.shareId) +
        "/invites",
      "GET",
      null,
      share.editToken
    );
    return data.invites || [];
  }

  async revokeInvite(share, inviteId) {
    return this.api(
      "/api/share/" +
        encodeURIComponent(share.shareId) +
        "/invites/" +
        encodeURIComponent(inviteId),
      "DELETE",
      null,
      share.editToken
    );
  }

  async getDiscussion(share) {
    return this.api(
      "/api/share/" +
        encodeURIComponent(share.shareId) +
        "/discussion",
      "GET",
      null,
      share.editToken
    );
  }

  async setDiscussionReviewState(
    share,
    entryId,
    reviewState
  ) {
    return this.api(
      "/api/share/" +
        encodeURIComponent(share.shareId) +
        "/discussion/" +
        encodeURIComponent(entryId),
      "PATCH",
      { reviewState },
      share.editToken
    );
  }

  async unshareByPath(notePath, showNotice = true) {
    try {
      const result = await this.api("/api/share/unpublish", "POST", {sourcePath:notePath});
      if (result.ok !== true) throw new Error("Invalid unshare response");
      delete this.settings.shares[notePath];
      await this.saveData(this.settings);
      if (showNotice) new Notice("分享已取消，本地状态已同步");
      return true;
    } catch (error) {
      if (showNotice) new Notice("取消分享失败：" + (error.message || "请稍后重试"), 8000);
      return false;
    }
  }
  async unshareFile(file) {
    return this.unshareByPath(
      file.path,
      true
    );
  }
}

class PrivateShareSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const c = this.containerEl;
    c.empty();
    new Setting(c).setName("配置导入 / 导出").setDesc("用加密文件配置新设备，保留本机分享和附件记录。").addButton(b=>b.setButtonText("导出配置").onClick(()=>new ConfigTransferModal(this.app,this.plugin,"export").open())).addButton(b=>b.setButtonText("导入配置").onClick(()=>new ConfigTransferModal(this.app,this.plugin,"import").open()));
    new Setting(c).setName("撤销上次配置导入").setDesc("使用上次导入密码恢复原连接配置。").addButton(b=>b.setButtonText("恢复原配置").onClick(()=>new ConfigTransferModal(this.app,this.plugin,"restore").open()));

    new Setting(c)
      .setName("\u5206\u4eab\u670d\u52a1\u5668")
      .setDesc(
        "\u4f8b\u5982 https://share.example.com"
      )
      .addText((text) =>
        text
          .setPlaceholder(
            "https://share.example.com"
          )
          .setValue(
            this.plugin.settings.serverUrl ||
              ""
          )
          .onChange(async (value) => {
            this.plugin.settings.serverUrl =
              value.trim();
            await this.plugin.saveData(
              this.plugin.settings
            );
          })
      );

    new Setting(c)
      .setName("API Token")
      .setDesc(
        "\u7528\u4e8e\u53d1\u5e03\u3001\u66f4\u65b0\u3001\u5ba2\u6237\u94fe\u63a5\u548c\u8ba8\u8bba\u7ba1\u7406\uff1b\u4e0d\u4f1a\u51fa\u73b0\u5728\u516c\u5f00\u94fe\u63a5\u4e2d"
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder(
            "\u7c98\u8d34\u670d\u52a1\u7aef API Token"
          )
          .setValue(
            this.plugin.settings.apiToken ||
              ""
          )
          .onChange(async (value) => {
            this.plugin.settings.apiToken =
              value.trim();
            await this.plugin.saveData(
              this.plugin.settings
            );
          });
      });

    c.createEl("h3", {
      text: '电脑内网附件上传',
    });

    new Setting(c).setName('附件上传方式').setDesc(this.plugin.isMobileDevice()?'手机仅同步本地附件，不上传；同步到电脑后由电脑通过内网 AList 上传。':'电脑通过内网 AList 上传到 R2；启动、同步完成及每 5 分钟检查待上传附件。不在家时等待，不走公网上传。');
    new Setting(c).setName('局域网分享服务（可选）').setDesc('电脑在家生成附件短链时优先使用；不是附件上传地址。留空使用公网分享服务。').addText(text=>text.setPlaceholder('http://192.168.x.x:8090').setValue(this.plugin.settings.localUploadUrl||'').onChange(async value=>{this.plugin.settings.localUploadUrl=value.trim();await this.plugin.saveData(this.plugin.settings);}));
    new Setting(c).setName('检查待上传附件').setDesc('只上传笔记引用的本地附件；成功后改写为稳定短链。').addButton(b=>b.setButtonText('立即检查').onClick(()=>this.plugin.scanDesktopAttachments({manual:true})));

    new Setting(c)
      .setName('AList 局域网地址')
      .setDesc(
        "电脑上传和清理使用此内网地址；手机不会使用。请填写家里的内网 IP 地址。"
      )
      .addText((text) =>
        text
          .setPlaceholder("http://192.168.x.x:5244")
          .setValue(
            this.plugin.settings.alistLanUrl || ""
          )
          .onChange(async (value) => {
            this.plugin.settings.alistLanUrl =
              value.trim();
            await this.plugin.saveData(
              this.plugin.settings
            );
          })
      );

    new Setting(c)
      .setName("AList \u516c\u7f51\u8bbf\u95ee\u5730\u5740")
      .setDesc(
        '附件管理地址；对外预览继续使用媒体服务的稳定短链'
      )
      .addText((text) =>
        text
          .setPlaceholder("https://files.example.com")
          .setValue(
            this.plugin.settings.alistPublicUrl || ""
          )
          .onChange(async (value) => {
            this.plugin.settings.alistPublicUrl =
              value.trim();
            await this.plugin.saveData(
              this.plugin.settings
            );
          })
      );

    new Setting(c)
      .setName("AList Token")
      .setDesc(
        "\u63a8\u8350\u3002\u5982\u679c\u586b\u5199 Token\uff0c\u5219\u4e0d\u4f7f\u7528\u4e0b\u9762\u7684\u7528\u6237\u540d\u548c\u5bc6\u7801\u767b\u5f55"
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("AList token")
          .setValue(
            this.plugin.settings.alistToken || ""
          )
          .onChange(async (value) => {
            this.plugin.settings.alistToken =
              value.trim();
            await this.plugin.saveData(
              this.plugin.settings
            );
          });
      });

    new Setting(c)
      .setName("AList \u7528\u6237\u540d")
      .setDesc(
        "\u4ec5\u5728\u672a\u586b\u5199 Token \u65f6\u4f7f\u7528"
      )
      .addText((text) =>
        text
          .setValue(
            this.plugin.settings.alistUsername || ""
          )
          .onChange(async (value) => {
            this.plugin.settings.alistUsername =
              value.trim();
            await this.plugin.saveData(
              this.plugin.settings
            );
          })
      );

    new Setting(c)
      .setName("AList \u5bc6\u7801")
      .setDesc(
        "\u4ec5\u5728\u672a\u586b\u5199 Token \u65f6\u4f7f\u7528"
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setValue(
            this.plugin.settings.alistPassword || ""
          )
          .onChange(async (value) => {
            this.plugin.settings.alistPassword =
              value;
            await this.plugin.saveData(
              this.plugin.settings
            );
          });
      });

    new Setting(c)
      .setName('附件自动上传')
      .setDesc(
        "\u5f00\u542f\u540e\uff0c\u62d6\u5165\u6216\u7c98\u8d34\u672c\u5730\u9644\u4ef6\u5230\u7b14\u8bb0\u65f6\uff0c仅电脑通过内网 AList 上传已同步的本地附件到 R2 \u5e76\u66ff\u6362\u4e3a\u516c\u7f51\u94fe\u63a5"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.alistAutoUpload !== false
          )
          .onChange(async (value) => {
            this.plugin.settings.alistAutoUpload = value;
            if(value)this.plugin.scheduleDesktopUploadScan();
            await this.plugin.saveData(
              this.plugin.settings
            );
          })
      );

    new Setting(c)
      .setName("\u5220\u9664\u7b14\u8bb0\u65f6\u540c\u6b65\u5220\u9664 AList / R2 \u9644\u4ef6")
      .setDesc(
        "\u53ea\u5220\u9664\u7531\u672c\u63d2\u4ef6\u4e0a\u4f20\u5e76\u4e0e\u8be5\u7b14\u8bb0\u7ed1\u5b9a\u8bb0\u5f55\u7684\u8fdc\u7a0b\u9644\u4ef6"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings
              .alistDeleteRemoteOnNoteDelete !== false
          )
          .onChange(async (value) => {
            this.plugin.settings
              .alistDeleteRemoteOnNoteDelete = value;
            await this.plugin.saveData(
              this.plugin.settings
            );
          })
      );

    new Setting(c)
      .setName("\u5220\u9664\u8fdc\u7a0b\u9644\u4ef6\u524d\u786e\u8ba4")
      .setDesc(
        "\u5efa\u8bae\u4fdd\u6301\u5f00\u542f\uff1b\u5220\u9664\u7b14\u8bb0\u540e\u4f1a\u518d\u8be2\u95ee\u662f\u5426\u5220\u9664 AList / R2 \u9644\u4ef6"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings
              .alistConfirmRemoteDelete !== false
          )
          .onChange(async (value) => {
            this.plugin.settings
              .alistConfirmRemoteDelete = value;
            await this.plugin.saveData(
              this.plugin.settings
            );
          })
      );
    const count = Object.keys(
      this.plugin.settings.shares || {}
    ).length;

    new Setting(c)
      .setName("\u672c\u673a\u8bb0\u5f55\u7684\u5206\u4eab")
      .setDesc("\u5171 " + count + " \u7bc7\u3002")
      .addButton((button) =>
        button
          .setButtonText("\u7ba1\u7406\u5206\u4eab")
          .onClick(() =>
            new ShareManagerModal(
              this.app,
              this.plugin
            ).open()
          )
      );

    c.createEl("h3", {
      text: "\u624b\u673a\u7aef\u5feb\u6377\u64cd\u4f5c",
    });
    c.createEl("p", {
      text:
        "\u624b\u673a\u7aef\u53ef\u4f7f\u7528\u547d\u4ee4\uff1a\u5206\u4eab\u5f53\u524d\u7b14\u8bb0\u3001\u590d\u5236\u5f53\u524d\u5206\u4eab\u94fe\u63a5\u3001\u7ba1\u7406\u5f53\u524d\u7b14\u8bb0\u7684\u5ba2\u6237\u94fe\u63a5\u3001\u67e5\u770b\u5f53\u524d\u7b14\u8bb0\u7684\u5ba2\u6237\u8ba8\u8bba\u3001\u7ba1\u7406\u6240\u6709\u5206\u4eab\u3002",
      cls: "private-share-muted",
    });
  }
}

module.exports = PrivateSharePlugin;
