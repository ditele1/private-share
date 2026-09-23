
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
  apiToken: "",
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
      this.share = await this.plugin.resolveShareForPath(
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
      this.share = await this.plugin.resolveShareForPath(
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
          await this.plugin.copyUrl(share.url, false);
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
          file.extension !== "md" ||
          !this.settings.shares[file.path]
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
        const share = this.settings.shares[file.path];
        if (!share || !share.url) return false;
        if (!checking) this.copyUrl(share.url);
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
        const share = this.settings.shares[file.path];
        if (!share)
          return false;
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
        const share = this.settings.shares[file.path];
        if (!share)
          return false;
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
          file.extension !== "md" ||
          !this.settings.shares[file.path]
        )
          return false;
        if (!checking) this.unshareFile(file);
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
                  this.copyUrl(existing.url)
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
          const existing =
            this.settings.shares[oldPath];
          if (!existing) return;
          delete this.settings.shares[oldPath];
          this.settings.shares[file.path] =
            existing;
          await this.saveData(this.settings);
        }
      )
    );
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
      if (binary.byteLength > 80 * 1024 * 1024) {
        throw new Error(
          "attachment too large: " +
            item.name +
            " (max 80 MB)"
        );
      }

      new Notice(
        "\u6b63\u5728\u4e0a\u4f20\u9644\u4ef6 " +
          (i + 1) + "/" + uploads.length +
          "\uff1a" + item.name
      );

      const response = await requestUrl({
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
          "Content-Type": "application/octet-stream",
        },
        body: binary,
        throw: false,
      });

      if (response.status < 200 || response.status >= 300) {
        let message = "HTTP " + response.status;
        try {
          const data =
            response.json ||
            JSON.parse(response.text || "{}");
          if (data && data.error) message = data.error;
        } catch (_) {}
        throw new Error(
          "\u9644\u4ef6\u4e0a\u4f20\u5931\u8d25\uff1a" +
            item.name + " \u00b7 " + message
        );
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

  async shareFile(file, options = {}) {
    try {
      const existing =
        this.settings.shares[file.path];
      if (existing) {
        return await this.updateShare(
          file,
          options
        );
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

  async updateShare(file, options = {}) {
    try {
      const existing =
        this.settings.shares[file.path];
      if (!existing)
        return this.shareFile(file, options);

      new Notice("\u6b63\u5728\u66f4\u65b0\u5206\u4eab...");
      const prepared =
        await this.preparePayload(
          file,
          options,
          existing
        );
      const data = await this.api(
        "/api/update/" +
          encodeURIComponent(
            existing.shareId
          ),
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
        this.settings.shares[notePath];
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
