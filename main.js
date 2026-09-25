
const {
  Plugin,
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
  alistLanUrl: "",
  alistPublicUrl: "",
  alistUsername: "",
  alistPassword: "",
  alistToken: "",
  alistRootPath: "/Obsidian",
  alistUseDateFolders: true,
  alistAutoUpload: true,
  alistDeleteRemoteOnNoteDelete: true,
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

class ShareManagerModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    this.render();
  }

  render() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "Private Share \u7ba1\u7406" });

    const entries = Object.entries(
      this.plugin.settings.shares || {}
    );
    if (!entries.length) {
      c.createEl("p", { text: "\u5f53\u524d\u6ca1\u6709\u672c\u673a\u8bb0\u5f55\u7684\u5206\u4eab\u3002" });
      return;
    }

    c.createEl("p", {
      text:
        "\u5171 " +
        entries.length +
        " \u7bc7\u5206\u4eab\u3002\u8fd9\u91cc\u663e\u793a\u7684\u662f\u672c\u673a\u63d2\u4ef6\u8bb0\u5f55\u3002",
      cls: "private-share-muted",
    });

    const list = c.createDiv({
      cls: "private-share-manager",
    });

    for (const [notePath, share] of entries) {
      const row = list.createDiv({
        cls: "private-share-manager-row",
      });

      const info = row.createDiv({
        cls: "private-share-manager-info",
      });
      info.createEl("strong", {
        text:
          share.title ||
          notePath.split("/").pop() ||
          notePath,
      });
      info.createEl("div", {
        text: notePath,
        cls: "private-share-muted",
      });

      const badges = info.createDiv({
        cls: "private-share-badges",
      });
      if (share.passwordProtected) {
        badges.createSpan({
          text: "\u5bc6\u7801\u4fdd\u62a4",
          cls: "private-share-badge",
        });
      }
      if (share.expiresAt) {
        badges.createSpan({
          text: "\u5230\u671f\uff1a" + formatTime(share.expiresAt),
          cls: "private-share-badge",
        });
      }
        badges.createSpan({
          text: "\u5ba2\u6237\u8ba8\u8bba",
          cls: "private-share-badge",
        });
      }

      const actions = row.createDiv({
        cls: "private-share-manager-actions",
      });

      actions
        .createEl("button", { text: "\u590d\u5236\u94fe\u63a5" })
        .addEventListener("click", async () => {
          await this.plugin.copyResolvedShareUrl(
            notePath,
            share,
            false
          );
          new Notice("\u5206\u4eab\u94fe\u63a5\u5df2\u590d\u5236");
        });

      const file =
        this.app.vault.getAbstractFileByPath(notePath);
      if (file instanceof TFile) {
        actions
          .createEl("button", { text: "\u66f4\u65b0" })
          .addEventListener("click", () => {
            this.close();
            this.plugin.openShareOptions(file, "update");
          });
      }

      if (share.discussionEnabled) {
        actions
          .createEl("button", { text: "\u5ba2\u6237\u94fe\u63a5" })
          .addEventListener("click", () => {
            new InviteManagerModal(
              this.app,
              this.plugin,
              notePath,
              share
            ).open();
          });

        actions
          .createEl("button", { text: "\u67e5\u770b\u8ba8\u8bba" })
          .addEventListener("click", () => {
            new DiscussionModal(
              this.app,
              this.plugin,
              notePath,
              share
            ).open();
          });

      actions
        .createEl("button", {
          text: "\u53d6\u6d88\u5206\u4eab",
          cls: "mod-warning",
        })
        .addEventListener("click", async () => {
          const ok = await this.plugin.unshareByPath(
            notePath,
            false
          );
          if (ok) this.render();
        });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class PrivateSharePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
    if (!this.settings.shares) this.settings.shares = {};
    this.alistAutoTimers = new Map();
    this.alistAutoRunning = new Set();

    this.addSettingTab(
      new PrivateShareSettingTab(this.app, this)
    );

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
      name: "\u4e0a\u4f20\u5f53\u524d\u7b14\u8bb0\u9644\u4ef6\u5230 AList",
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
          if (file.extension !== "md") return;
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

  validateAListSettings(showNotice = true) {
    const lan = normalizeBase(this.settings.alistLanUrl);
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

    const lan = normalizeBase(this.settings.alistLanUrl);
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
    const server = normalizeBase(this.settings.serverUrl);
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
    return data.url;
  }
  async getAListFileSign(
    remotePath,
    token,
    maxAttempts = 8
  ) {
    const lan = normalizeBase(this.settings.alistLanUrl);
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
  async ensureAListDirectory(remotePath, token) {
    const lan = normalizeBase(this.settings.alistLanUrl);
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

  async uploadFileToAList(target, token) {
    const settings = this.validateAListSettings();
    if (!settings)
      throw new Error("AList settings missing");

    const binary = await this.app.vault.readBinary(target);
    const remotePath = this.buildAListRemotePath(
      target.name
    );
    const remoteDir = remotePath.slice(
      0,
      remotePath.lastIndexOf("/")
    );
    await this.ensureAListDirectory(remoteDir, token);

    const response = await requestUrl({
      url: settings.lan + "/api/fs/put",
      method: "PUT",
      headers: {
        Authorization: token,
        "File-Path": encodeURIComponent(remotePath),
        "As-Task": "false",
        "Content-Type":
          mimeFromName(target.name) ||
          "application/octet-stream",
      },
      body: binary,
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
          "AList upload failed: HTTP " +
            response.status
      );
    }

    const sign = await this.getAListFileSign(
      remotePath,
      token
    );

    const upstreamUrl = this.buildAListPublicUrl(
      remotePath,
      sign
    );
    const publicUrl = await this.getMediaProxyUrl(
      upstreamUrl
    );

    return {
      remotePath,
      publicUrl,
      upstreamUrl,
    };
  }
  async uploadCurrentNoteAttachmentsToAList(
    file,
    runOptions = {}
  ) {
    const automatic = !!runOptions.automatic;
    const silentNoop = !!runOptions.silentNoop;
    try {
      const settings = this.validateAListSettings(!automatic);
      if (!settings) return false;

      let markdown = await this.app.vault.read(file);
      const token = await this.getAListToken();
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
            "\u6b63\u5728\u4e0a\u4f20\u5230 AList\uff1a" +
              target.name,
            2500
          );
          }
          uploaded = await this.uploadFileToAList(
            target,
            token
          );
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
            "\u6b63\u5728\u4e0a\u4f20\u5230 AList\uff1a" +
              target.name,
            2500
          );
          }
          uploaded = await this.uploadFileToAList(
            target,
            token
          );
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
        if (automatic) {
          const attempt = Number(
            runOptions.retryAttempt || 0
          );
          if (attempt < 3) {
            await new Promise((resolve) =>
              window.setTimeout(
                resolve,
                1000 + attempt * 750
              )
            );
            return this.uploadCurrentNoteAttachmentsToAList(
              file,
              {
                automatic: true,
                silentNoop: true,
                retryAttempt: attempt + 1,
              }
            );
          }
        }
        if (!silentNoop) {
          new Notice(
            "\u5f53\u524d\u7b14\u8bb0\u6ca1\u6709\u627e\u5230\u53ef\u4e0a\u4f20\u7684\u672c\u5730\u9644\u4ef6"
          );
        }
        return false;
      }

      for (const item of replacements) {
        markdown = markdown.replace(item.from, item.to);
      }

      await this.app.vault.modify(file, markdown);
      this.recordAListAssetsForNote(
        file.path,
        seenTargets
      );
      await this.saveData(this.settings);
      new Notice(
        (automatic
          ? "\u5df2\u81ea\u52a8\u4e0a\u4f20 "
          : "\u5df2\u4e0a\u4f20 ") +
          seenTargets.size +
          " \u4e2a\u9644\u4ef6\u5230 AList\uff0c\u5e76\u66ff\u6362\u4e3a\u516c\u7f51\u94fe\u63a5",
        automatic ? 4500 : 7000
      );
      return true;
    } catch (error) {
      console.error(
        "AList attachment upload failed",
        error
      );
      new Notice(
        (automatic ? "AList \u81ea\u52a8\u4e0a\u4f20\u5931\u8d25\uff1a" : "AList \u9644\u4ef6\u4e0a\u4f20\u5931\u8d25\uff1a") +
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
      byRemotePath.set(uploaded.remotePath, {
        remotePath: uploaded.remotePath,
        publicUrl: uploaded.publicUrl || "",
        originalLocalPath: localPath || "",
        uploadedAt: new Date().toISOString(),
      });
    }

    this.settings.alistAssets[notePath] =
      [...byRemotePath.values()];
  }

  async deleteAListRemoteAsset(remotePath, token) {
    const lan = normalizeBase(this.settings.alistLanUrl);
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

  async handleDeletedNoteAListAssets(notePath) {
    const assetMap = this.settings.alistAssets || {};
    const assets = Array.isArray(assetMap[notePath])
      ? assetMap[notePath]
      : [];
    if (!assets.length) return;

    if (
      this.settings.alistDeleteRemoteOnNoteDelete ===
      false
    ) {
      return;
    }

    if (
      this.settings.alistConfirmRemoteDelete !== false
    ) {
      const confirmed =
        typeof window !== "undefined" &&
        typeof window.confirm === "function"
          ? window.confirm(
              "\u5df2\u5220\u9664\u7b14\u8bb0\uff1a" +
                notePath +
                "\n\n\u662f\u5426\u540c\u65f6\u5220\u9664 " +
                assets.length +
                " \u4e2a AList / R2 \u8fdc\u7a0b\u9644\u4ef6\uff1f\n\n\u53ea\u4f1a\u5220\u9664 Private Share \u63d2\u4ef6\u81ea\u5df1\u4e0a\u4f20\u5e76\u8bb0\u5f55\u7684\u9644\u4ef6\u3002"
            )
          : false;
      if (!confirmed) {
        new Notice(
          "\u5df2\u4fdd\u7559 AList / R2 \u8fdc\u7a0b\u9644\u4ef6"
        );
        return;
      }
    }

    try {
      const token = await this.getAListToken();
      let deleted = 0;
      const failed = [];

      for (const asset of assets) {
        if (
          !asset ||
          typeof asset.remotePath !== "string"
        )
          continue;
        try {
          await this.deleteAListRemoteAsset(
            asset.remotePath,
            token
          );
          deleted += 1;
        } catch (error) {
          failed.push({
            remotePath: asset.remotePath,
            error:
              error && error.message
                ? error.message
                : String(error),
          });
        }
      }

      if (failed.length === 0) {
        delete this.settings.alistAssets[notePath];
        await this.saveData(this.settings);
        new Notice(
          "\u5df2\u540c\u6b65\u5220\u9664 " +
            deleted +
            " \u4e2a AList / R2 \u8fdc\u7a0b\u9644\u4ef6",
          6000
        );
        return;
      }

      const failedPaths = new Set(
        failed.map((item) => item.remotePath)
      );
      this.settings.alistAssets[notePath] =
        assets.filter(
          (asset) =>
            asset &&
            failedPaths.has(asset.remotePath)
        );
      await this.saveData(this.settings);

      console.error(
        "Some AList remote attachments failed to delete",
        failed
      );
      new Notice(
        "\u8fdc\u7a0b\u9644\u4ef6\u5220\u9664\u90e8\u5206\u5931\u8d25\uff1a\u5df2\u5220 " +
          deleted +
          "\uff0c\u5931\u8d25 " +
          failed.length +
          "\u3002\u5931\u8d25\u9879\u5df2\u4fdd\u7559\u5728\u672c\u5730\u8bb0\u5f55\u4e2d\u3002",
        9000
      );
    } catch (error) {
      console.error(
        "AList remote cleanup failed",
        error
      );
      new Notice(
        "AList / R2 \u8fdc\u7a0b\u9644\u4ef6\u5220\u9664\u5931\u8d25\uff1a" +
          (error && error.message
            ? error.message
            : error),
        9000
      );
    }
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

  openShareOptions(file, mode) {
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

  async preparePayload(file, options, existing) {
    let markdown = await this.app.vault.read(file);
    const attachments = [];
    const uploads = [];
    let assetIndex = 0;

    const re =
      /!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
    const matches = [...markdown.matchAll(re)];

    for (const match of matches) {
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

      const ext = target.extension
        ? "." + target.extension.toLowerCase()
        : "";
      const key =
        "asset-" + ++assetIndex + ext;
      const label = alias || target.name;
      const replacement = isImageName(
        target.name
      )
        ? "![" +
          label +
          "]({{ASSET_BASE}}/" +
          key +
          ")"
        : "[" +
          label +
          "]({{ASSET_BASE}}/" +
          key +
          ")";

      markdown = markdown.replace(
        match[0],
        replacement
      );
      attachments.push({
        key,
        name: target.name,
        mime: mimeFromName(target.name),
      });
      uploads.push({
        key,
        path: target.path,
        name: target.name,
        mime: mimeFromName(target.name),
      });
    }

    markdown = markdown.replace(
      /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
      (_m, target, alias) => alias || target
    );

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

  async uploadAttachments(shareId, editToken, uploads) {
    if (!uploads || !uploads.length) return;
    const server = this.validateSettings();
    if (!server) throw new Error("missing settings");

    const maxChunks = 2;
    const chunkTimeoutMs = 20000;
    const statusTimeoutMs = 10000;
    const maxRetries = 3;

    const sleep = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("upload timeout")),
            ms
          )
        ),
      ]);

    const getUploadStatus = async (item) => {
      const response = await withTimeout(
        requestUrl({
          url:
            server +
            "/api/share/" +
            encodeURIComponent(shareId) +
            "/assets/" +
            encodeURIComponent(item.key) +
            "/upload-status",
          method: "GET",
          headers: {
            Authorization:
              "Bearer " + this.settings.apiToken,
            "X-Edit-Token": editToken,
          },
          throw: false,
        }),
        statusTimeoutMs
      );

      if (response.status < 200 || response.status >= 300) {
        return null;
      }
      try {
        return (
          response.json ||
          JSON.parse(response.text || "{}")
        );
      } catch (_) {
        return null;
      }
    };

    for (let i = 0; i < uploads.length; i++) {
      const item = uploads[i];
      const file =
        this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof TFile)) {
        throw new Error(
          "attachment not found: " + item.name
        );
      }

      const binary =
        await this.app.vault.readBinary(file);
      const total = binary.byteLength;
      if (total > 80 * 1024 * 1024) {
        throw new Error(
          "attachment too large: " +
            item.name +
            " (max 80 MB)"
        );
      }
      if (total === 0) {
        throw new Error(
          "attachment is empty: " + item.name
        );
      }

      const localUploadServer = normalizeBase(
        this.settings.localUploadUrl || ""
      );

      if (localUploadServer) {
        try {
          new Notice(
            "\u6b63\u5728\u901a\u8fc7\u5c40\u57df\u7f51\u4e0a\u4f20\u9644\u4ef6\uff1a" +
              item.name,
            3500
          );

          const lanResponse = await withTimeout(
            requestUrl({
              url:
                localUploadServer +
                "/api/share/" +
                encodeURIComponent(shareId) +
                "/assets/" +
                encodeURIComponent(item.key) +
                "/raw",
              method: "PUT",
              headers: {
                Authorization:
                  "Bearer " + this.settings.apiToken,
                "X-Edit-Token": editToken,
                "Content-Type":
                  "application/octet-stream",
              },
              body: binary,
              throw: false,
            }),
            90000
          );

          if (
            lanResponse.status >= 200 &&
            lanResponse.status < 300
          ) {
            new Notice(
              "\u9644\u4ef6\u5c40\u57df\u7f51\u4e0a\u4f20\u5b8c\u6210\uff1a" +
                item.name,
              3000
            );
            continue;
          }

          let lanMessage = "HTTP " + lanResponse.status;
          try {
            const lanData =
              lanResponse.json ||
              JSON.parse(lanResponse.text || "{}");
            if (lanData && lanData.error) {
              lanMessage = lanData.error;
            }
          } catch (_) {}
          throw new Error(lanMessage);
        } catch (error) {
          new Notice(
            "\u5c40\u57df\u7f51\u4e0a\u4f20\u5931\u8d25\uff0c\u6b63\u5728\u5207\u6362\u516c\u7f51\u4e0a\u4f20\uff1a" +
              item.name,
            4500
          );
        }
      }

      const chunkSize = Math.ceil(total / maxChunks);
      let offset = 0;
      let retries = 0;

      while (offset < total) {
        const end = Math.min(offset + chunkSize, total);
        const chunk = binary.slice(offset, end);
        const percent = Math.round((end / total) * 100);

        new Notice(
          "\u6b63\u5728\u4e0a\u4f20\u9644\u4ef6 " +
            (i + 1) +
            "/" +
            uploads.length +
            "\uff1a" +
            item.name +
            " " +
            percent +
            "%",
          2500
        );

        try {
          const response = await withTimeout(
            requestUrl({
              url:
                server +
                "/api/share/" +
                encodeURIComponent(shareId) +
                "/assets/" +
                encodeURIComponent(item.key),
              method: "PUT",
              headers: {
                Authorization:
                  "Bearer " + this.settings.apiToken,
                "X-Edit-Token": editToken,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                offset,
                total,
                dataBase64: arrayBufferToBase64(chunk),
              }),
              throw: false,
            }),
            chunkTimeoutMs
          );

          let data = {};
          try {
            data =
              response.json ||
              JSON.parse(response.text || "{}");
          } catch (_) {}

          if (response.status >= 200 && response.status < 300) {
            const received = Number(data.received);
            offset =
              Number.isSafeInteger(received) && received > offset
                ? Math.min(received, total)
                : end;
            retries = 0;
            continue;
          }

          if (response.status === 409) {
            const expected = Number(data.expectedOffset);
            if (Number.isSafeInteger(expected) && expected >= 0) {
              offset = Math.min(expected, total);
              retries = 0;
              continue;
            }
          }

          throw new Error(
            data.error || "HTTP " + response.status
          );
        } catch (error) {
          retries += 1;

          let status = null;
          try {
            status = await getUploadStatus(item);
          } catch (_) {}

          if (status) {
            const received = Number(status.received);
            if (status.complete && received >= total) {
              offset = total;
              retries = 0;
              continue;
            }
            if (
              Number.isSafeInteger(received) &&
              received > offset &&
              received <= total
            ) {
              offset = received;
              retries = 0;
              continue;
            }
          }

          if (retries >= maxRetries) {
            throw new Error(
              "\u9644\u4ef6\u4e0a\u4f20\u5931\u8d25\uff1a" +
                item.name +
                " \u00b7 " +
                percent +
                "% \u00b7 " +
                (error && error.message
                  ? error.message
                  : error)
            );
          }

          new Notice(
            "\u4e0a\u4f20\u4e2d\u65ad\uff0c\u6b63\u5728\u81ea\u52a8\u91cd\u8bd5 " +
              retries +
              "/" +
              maxRetries +
              "\uff1a" +
              item.name,
            3500
          );
          await sleep(1000 * retries);
        }
      }
    }
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
      throw new Error(
        data.error ||
          "HTTP " + response.status
      );
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

      try {
        await this.uploadAttachments(
          data.shareId,
          data.editToken,
          prepared.uploads
        );
      } catch (error) {
        try {
          await this.api(
            "/api/unpublish/" +
              encodeURIComponent(data.shareId),
            "DELETE",
            null,
            data.editToken
          );
        } catch (_) {}
        throw error;
      }

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

      await this.uploadAttachments(
        existing.shareId,
        existing.editToken,
        prepared.uploads
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
        allowMissing &&
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

  async unshareByPath(
    notePath,
    showNotice = true
  ) {
    try {
      const existing =
        await this.claimManageShareForPath(
          notePath,
          this.settings.shares[notePath] || null,
          true
        );
      if (!existing) {
        if (showNotice)
          new Notice(
            "\u8fd9\u7bc7\u7b14\u8bb0\u6ca1\u6709\u5206\u4eab\u8bb0\u5f55"
          );
        return false;
      }

      await this.api(
        "/api/unpublish/" +
          encodeURIComponent(
            existing.shareId
          ),
        "DELETE",
        null,
        existing.editToken
      );

      delete this.settings.shares[notePath];
      await this.saveData(this.settings);
      if (showNotice)
        new Notice("\u5206\u4eab\u5df2\u53d6\u6d88");
      return true;
    } catch (error) {
      console.error(
        "Private Share unpublish failed",
        error
      );
      new Notice(
        "\u53d6\u6d88\u5206\u4eab\u5931\u8d25\uff1a" +
          (error && error.message
            ? error.message
            : error),
        8000
      );
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
      .setName("\u5c40\u57df\u7f51\u4e0a\u4f20\u5730\u5740")
      .setDesc(
        "\u53ef\u9009\u3002\u5728\u5bb6\u91cc\u65f6\u9644\u4ef6\u4f18\u5148\u76f4\u4f20 OpenWrt\uff0c\u5931\u8d25\u65f6\u81ea\u52a8\u56de\u9000\u516c\u7f51\u4e0a\u4f20"
      )
      .addText((text) =>
        text
          .setPlaceholder(
            "http://192.168.x.x:8090"
          )
          .setValue(
            this.plugin.settings.localUploadUrl ||
              ""
          )
          .onChange(async (value) => {
            this.plugin.settings.localUploadUrl =
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
      text: "AList / R2 \u9644\u4ef6",
    });

    new Setting(c)
      .setName("AList \u5c40\u57df\u7f51\u4e0a\u4f20\u5730\u5740")
      .setDesc(
        "\u4ec5\u7528\u4e8e\u4e0a\u4f20\uff0c\u4f8b\u5982 http://192.168.x.x:5244"
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
        "\u5199\u56de\u7b14\u8bb0\u7684\u9644\u4ef6\u94fe\u63a5\u4f7f\u7528\u8fd9\u4e2a\u5730\u5740"
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
      .setName("\u8fdc\u7a0b\u6839\u76ee\u5f55")
      .setDesc("\u4f8b\u5982 /Obsidian")
      .addText((text) =>
        text
          .setPlaceholder("/Obsidian")
          .setValue(
            this.plugin.settings.alistRootPath ||
              "/Obsidian"
          )
          .onChange(async (value) => {
            this.plugin.settings.alistRootPath =
              normalizeRemotePath(value || "/Obsidian");
            await this.plugin.saveData(
              this.plugin.settings
            );
          })
      );

    new Setting(c)
      .setName("\u9644\u4ef6\u81ea\u52a8\u4e0a\u4f20\u5230 AList")
      .setDesc(
        "\u5f00\u542f\u540e\uff0c\u62d6\u5165\u6216\u7c98\u8d34\u672c\u5730\u9644\u4ef6\u5230\u7b14\u8bb0\u65f6\uff0c\u4f1a\u81ea\u52a8\u4e0a\u4f20\u5230 AList / R2 \u5e76\u66ff\u6362\u4e3a\u516c\u7f51\u94fe\u63a5"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.alistAutoUpload !== false
          )
          .onChange(async (value) => {
            this.plugin.settings.alistAutoUpload = value;
            await this.plugin.saveData(
              this.plugin.settings
            );
          })
      );

    new Setting(c)
      .setName("\u6309\u5e74/\u6708\u81ea\u52a8\u5206\u76ee\u5f55")
      .setDesc(
        "\u5f00\u542f\u540e\u5c06\u4e0a\u4f20\u5230 /Obsidian/YYYY/MM/"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.alistUseDateFolders !==
              false
          )
          .onChange(async (value) => {
            this.plugin.settings.alistUseDateFolders =
              value;
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
