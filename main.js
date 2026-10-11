
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
function mimeFromName(name) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp", avif: "image/avif", apng: "image/apng", ico: "image/x-icon", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif",
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
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif|apng|ico|tiff?|heic|heif)$/i.test(name);
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
function attachmentMarkup(
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
      .setName("允许确认 / 评论")
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

const LEGACY_PROFILE_FIELDS=['attachmentUploadBackend','alistPublicUrl','alistUsername','alistPassword','alistToken','alistRootPath','localUploadUrl','alistLanUrl','alistUseDateFolders','alistAutoUpload','alistDeleteRemoteOnNoteDelete','alistDeleteRemoteOnLinkRemove','alistConfirmRemoteDelete'];
const PROFILE_FIELDS={serverUrl:'string',apiToken:'string'};
function migrateSettings(raw={}) {
  return {
    serverUrl:typeof raw.serverUrl==='string'?raw.serverUrl:'',
    apiToken:typeof raw.apiToken==='string'?raw.apiToken:'',
    shares:raw.shares||{},
    attachmentAssets:raw.attachmentAssets||raw.alistAssets||{},
    pendingUploads:raw.pendingUploads||raw.pendingAListUploads||{},
    pendingUploadedShareRefresh:raw.pendingUploadedShareRefresh||{},
  };
}
const PROFILE_AAD = "obsidian-private-share-config:1:AES-256-GCM:PBKDF2-SHA256:600000";
function portableConfig(settings) {
  const out={};for(const [key,type]of Object.entries(PROFILE_FIELDS))if(typeof settings[key]===type)out[key]=settings[key];return validatePortableConfig(out);
}
function validatePortableConfig(config) {
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('配置格式不正确');
  const out={};
  for(const [key,value]of Object.entries(config)){
    if(LEGACY_PROFILE_FIELDS.includes(key)){if(!['string','boolean'].includes(typeof value))throw Error('旧配置字段不正确');continue;}
    if(!Object.prototype.hasOwnProperty.call(PROFILE_FIELDS,key)||typeof value!==PROFILE_FIELDS[key])throw Error('配置包含不支持的字段');
    if(value.length>4096)throw Error('配置字段过长');
    if(key==='serverUrl'&&value){let u;try{u=new URL(value)}catch{throw Error('配置地址不正确')};if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('配置地址不正确');}
    out[key]=value;
  }
  return out;
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
class AttachmentCleanupModal extends Modal {
  constructor(app,plugin,candidates){super(app);Object.assign(this,{plugin,candidates});}
  onOpen(){
    const c=this.contentEl;c.createEl('h2',{text:'清理无引用的 VPS 副本'});
    c.createEl('p',{text:'发现 '+this.candidates.length+' 条本地未引用记录。确认后还会检查分享网页与其他笔记；无法核实的文件不会删除。删除 VPS 文件不可撤销，本地原件保留。'});
    const list=c.createEl('ul');for(const {notePath,asset}of this.candidates)list.createEl('li',{text:(asset.originalLocalPath||asset.remotePath)+' · '+notePath});
    new Setting(c).addButton(b=>b.setButtonText('取消').onClick(()=>this.close())).addButton(b=>b.setButtonText('确认检查并清理').setWarning().onClick(async()=>{
      b.setDisabled(true);try{for(const {asset}of this.candidates){asset.pendingDelete=true;asset.deleteReason='manual';}await this.plugin.saveData(this.plugin.settings);await this.plugin.retryAttachmentCleanup({manual:true});const remaining=this.candidates.filter(({notePath,asset})=>(this.plugin.settings.attachmentAssets[notePath]||[]).includes(asset));new Notice('检查完成：'+(this.candidates.length-remaining.length)+' 条已清理，'+remaining.length+' 条仍有引用或需重试',8000);this.close();}catch(e){new Notice('清理未完成：'+e.message);b.setDisabled(false);}
    }));
  }
  onClose(){this.contentEl.empty();}
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
  constructor(app,plugin,mode){super(app);Object.assign(this,{plugin,mode});this.password="";this.confirm="";this.text="";this.config=null;this.busy=false;}
  onOpen(){const c=this.contentEl;c.createEl("h2",{text:this.mode==="export"?"导出加密配置":this.mode==="restore"?"撤销上次配置导入":"导入加密配置"});
    if(this.mode==="export"){
      c.createEl("p",{text:"导出分享地址和连接密钥。文件加密后可传给自己的新设备。"});
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
      this.text=await encryptProfile(portableConfig(this.plugin.settings),this.password,this.plugin.manifest.version);
      this.result.empty();this.result.createEl("p",{text:"加密配置已生成，请保存文件或复制加密文本。"});
      new Setting(this.result).addButton(v=>v.setButtonText("保存到 Vault").onClick(()=>this.run(v,async()=>{const name="private-share-config-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";await this.app.vault.create(name,this.text);new Notice("已保存："+name)}))).addButton(v=>v.setButtonText("复制加密配置").onClick(async()=>{try{await navigator.clipboard.writeText(this.text);new Notice("加密配置已复制")}catch{new Notice("复制失败，请保存到 Vault")}}));
    })));
    else{
      action.addButton(b=>b.setButtonText("解密预览").onClick(()=>this.run(b,async()=>{
        const text=this.mode==="restore"?await this.app.vault.adapter.read(this.plugin.profileBackupPath()):this.text;
        this.config=await decryptProfile(text,this.password);this.preview.empty();
        new Setting(this.preview).setName("分享地址").setDesc(this.config.serverUrl||"未配置");
        this.preview.createEl("p",{text:"连接密钥已解密，确认后应用，不显示明文。"});
      })));
      action.addButton(b=>b.setButtonText(this.mode==="restore"?"确认恢复":"确认应用").setCta().onClick(()=>this.run(b,async()=>{
        if(!this.config)throw Error("请先解密预览配置");
        const imported=this.config;await this.plugin.applyPortableConfig(imported,this.password,{restore:this.mode==="restore"});
        this.result.empty();this.result.createEl("p",{text:"配置已保存，正在检查连接…"});
        let connected=false;try{await this.plugin.api("/api/shares","GET");connected=true}catch{}
        if(connected)await this.plugin.syncAllSharesFromServer({silent:true});
        this.result.empty();this.result.createEl("p",{text:connected?"分享服务已连接；已同步 "+Object.keys(this.plugin.settings.shares||{}).length+" 条分享记录。":"配置已保存，分享服务暂时连接失败。可以关闭弹窗后重试或撤销导入。"});
        new Setting(this.result).addButton(v=>v.setButtonText("撤销本次导入").onClick(()=>new ConfigTransferModal(this.app,this.plugin,"restore").open()));
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
      if(share.discussionEnabled){button("查看讨论",()=>new DiscussionModal(this.app,this.plugin,notePath,share).open());}
      button("删除分享",async()=>{const yes=await new Promise(resolve=>new ActionConfirmModal(this.app,"删除分享","此笔记的分享链接将失效，相关讨论会删除。本地原笔记和 VPS 附件副本保留。",resolve).open());if(yes&&await this.plugin.unshareByPath(notePath,false)){this.render();new Notice("分享已删除")}}).addClass("mod-warning");
    }
  }
  onClose(){this.contentEl.empty()}
}


class PrivateSharePlugin extends Plugin {
  profileBackupPath() {return this.app.vault.configDir+"/plugins/"+this.manifest.id+"/config-before-import.json";}
  async applyPortableConfig(config,password,options={}) {
    config=validatePortableConfig(config);
    if(!options.restore&&(!config.serverUrl||!config.apiToken))throw Error("配置缺少分享服务地址或 API Token");
    if(this.configTransferRunning||this.backupJobs?.size||this.attachmentCleanupRunning||this.fullShareSyncRunning||this.backupRunning?.size)throw Error("上传、清理或同步正在进行，请稍后再试");
    const hasRecords=Object.keys(this.settings.shares||{}).length||Object.keys(this.settings.attachmentAssets||{}).length||Object.keys(this.settings.pendingUploads||{}).length;
    const changedService=["serverUrl","apiToken"].some(k=>Object.prototype.hasOwnProperty.call(config,k)&&this.settings[k]&&normalizeBase(this.settings[k])!==normalizeBase(config[k]));
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
    this.settings=migrateSettings(await this.loadData()||{});
    if (!this.settings.shares) this.settings.shares = {};
    this.app.workspace.onLayoutReady(async()=>{

      await this.saveData(this.settings);
      this.scheduleDesktopUploadScan();
    });
    this.registerInterval(window.setInterval(()=>this.scanDesktopAttachments(),300000));
    this.registerEvent(this.app.metadataCache.on('resolved',()=>this.scheduleDesktopUploadScan()));
    this.registerEvent(this.app.vault.on('create',()=>this.scheduleDesktopUploadScan()));
    this.register(()=>{if(this.desktopScanTimer)window.clearTimeout(this.desktopScanTimer);this.desktopUploadsStopped=true;});
    this.addCommand({id:'upload-synced-local-attachments',name:'检查附件备份并重试',callback:()=>this.scanDesktopAttachments({manual:true})});
    this.backupTimers = new Map();
    this.backupRunning = new Set();
    this.referenceTimers = new Map();
    this.privateShareStateSyncTimers = new Map();
    this.shareStateRevision = 0;
    this.registerInterval(window.setInterval(() => {
      if (!document.hidden) this.syncAllSharesFromServer({silent:true});
    }, 30000));
    this.registerDomEvent(document, "visibilitychange", () => {
      if (!document.hidden) this.syncAllSharesFromServer({silent:true});
    });
    this.registerDomEvent(window, "focus", () => this.syncAllSharesFromServer({silent:true}));
    this.addCommand({id:"cleanup-unused-attachments",name:"检查并清理无引用附件",callback:()=>this.openAttachmentCleanup()});
    this.register(() => {
      for (const map of [this.backupTimers,this.referenceTimers,this.privateShareStateSyncTimers]) for (const timer of map.values()) window.clearTimeout(timer);
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
      id: "view-current-discussion",
      name: "查看当前笔记的讨论",
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
                  .setTitle("查看讨论")
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
            this.settings.attachmentAssets &&
            this.settings.attachmentAssets[oldPath];
          if (assets) {
            delete this.settings.attachmentAssets[oldPath];
            this.settings.attachmentAssets[file.path] =
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
          this.scheduleReferenceCheck(file);

          this.scheduleAttachmentBackup(file);
        }
      )
    );

    this.registerEvent(
      this.app.vault.on(
        "delete",
        async (file) => {
          if (!(file instanceof TFile)) return;
          if (file.extension !== "md") return;
          await this.queueDeletedNoteAttachments(
            file.path
          );
        }
      )
    );
  }
  scheduleAttachmentBackup(file) {
    if(this.isMobileDevice())return;
    if (!(file instanceof TFile) || file.extension !== "md")
      return;

    const oldTimer = this.backupTimers.get(file.path);
    if (oldTimer) {
      window.clearTimeout(oldTimer);
    }

    const timer = window.setTimeout(async () => {
      this.backupTimers.delete(file.path);

      if (this.backupRunning.has(file.path)) {
        this.scheduleAttachmentBackup(file);
        return;
      }

      this.backupRunning.add(file.path);
      try {
        await this.backupCurrentNote(
          file,
          { automatic: true, silentNoop: true }
        );
      } finally {
        this.backupRunning.delete(file.path);
      }
    }, 2500);

    this.backupTimers.set(file.path, timer);
  }

  isMobileDevice() { return Platform?.isMobile===true; }

  async desktopUploadAvailable() {return !this.isMobileDevice()&&!!(this.settings.serverUrl&&this.settings.apiToken);}

  scheduleDesktopUploadScan() {
    if(this.isMobileDevice()||this.desktopUploadsStopped)return;
    if(this.desktopScanTimer)window.clearTimeout(this.desktopScanTimer);
    this.desktopScanTimer=window.setTimeout(()=>{this.desktopScanTimer=null;this.scanDesktopAttachments();},4000);
  }

  hasLocalAttachmentLinks(text,file) {
    return [...this.localAttachmentTargets(text,file).values()].some(target=>!this.localBackupFor(target,file.path));
  }

  async scanDesktopAttachments(options={}) {
    if(this.isMobileDevice()){if(options.manual)new Notice('手机不上传附件，请将笔记和附件同步到电脑');return false;}
    if(this.desktopScanRunning||this.configTransferRunning||this.desktopUploadsStopped)return false;
    this.desktopScanRunning=true;
    try{
      if(!await this.desktopUploadAvailable()){if(options.manual)new Notice('分享服务暂不可用，附件继续保留本地，稍后自动重试');return false;}
      let uploaded=0;
      const queue=this.app.vault.getMarkdownFiles().slice();
      await Promise.all(Array.from({length:2},async()=>{
        while(queue.length&&!this.desktopUploadsStopped){
          const file=queue.shift();
          if(this.hasLocalAttachmentLinks(await this.app.vault.read(file),file)){
            const changed=await this.backupCurrentNote(file,{automatic:true,silentNoop:true});
            if(changed)uploaded++;
          }
        }
      }));
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

  async backupCurrentNote(file, runOptions = {}) {
    if(this.isMobileDevice()){if(!runOptions.automatic&&!runOptions.silentNoop)new Notice('手机不上传附件，请同步到电脑后上传');return false;}
    if (this.configTransferRunning) return false;
    this.backupJobs ||= new Map();
    if (this.backupJobs.has(file.path)) return this.backupJobs.get(file.path);
    const job = this.backupNoteAttachments(file, runOptions);
    this.backupJobs.set(file.path, job);
    try { return await job; } finally { this.backupJobs.delete(file.path); }
  }

  async directRequest(base, route, ticket, method = 'POST', body, partNumber) {
    for(let attempt=0;attempt<4;attempt++){
      try{
        const binary=body instanceof ArrayBuffer;
        const headers={'X-Upload-Ticket':ticket};
        if(body!==undefined)headers['Content-Type']=binary?'application/octet-stream':'application/json';
        if(partNumber)headers['X-Part-Number']=String(partNumber);
        const data=body===undefined?undefined:binary?Buffer.from(body):Buffer.from(JSON.stringify(body));
        const r=await new Promise((resolve,reject)=>{
          const u=new URL(base+route);if(u.protocol!=='https:')return reject(new Error('直传必须使用 HTTPS'));
          if(data)headers['Content-Length']=String(data.length);
          const req=require('https').request(u,{method,headers},response=>{
            const chunks=[];let length=0;response.on('data',chunk=>{length+=chunk.length;if(length>1048576)req.destroy(new Error('上传响应过大'));else chunks.push(chunk);});
            response.on('error',reject);response.on('end',()=>{try{resolve({status:response.statusCode,json:JSON.parse(Buffer.concat(chunks).toString())});}catch{reject(new Error('上传响应无效'));}});
          });req.setTimeout(180000,()=>req.destroy(new Error('上传分片超时，已完成分片保留')));req.on('error',reject);req.end(data);
        });
        if(r.status>=200&&r.status<300)return r.json;
        if(r.status<500&&![408,429].includes(r.status))throw Object.assign(new Error('VPS 上传请求失败：HTTP '+r.status),{permanent:true});
        throw new Error('VPS 上传暂时失败：HTTP '+r.status);
      }catch(e){if(e.permanent||attempt===3)throw e;await new Promise(resolve=>window.setTimeout(resolve,1000*2**attempt));}
    }
  }

  async uploadFileToVPS(target) {
    if(this.isMobileDevice())throw new Error('手机不上传附件');
    this.directFileJobs ||= new Map();
    const identity=target.path+':'+target.stat.mtime+':'+target.stat.size;
    if(this.directFileJobs.has(identity))return this.directFileJobs.get(identity);
    // The desktop scan bounds concurrent notes; identical files share one job.
    const job=this.performVPSUpload(target,identity);

    this.directFileJobs.set(identity,job);
    try{return await job;}finally{this.directFileJobs.delete(identity);}
  }

  async performVPSUpload(target,identity) {
    const size=target.stat.size,mtime=target.stat.mtime;
    if(!Number.isSafeInteger(size)||size<1||size>2*1024**3)throw new Error('直传附件必须介于 1 字节和 2 GiB 之间');
    if(this.isMobileDevice())throw new Error('仅电脑直传附件');
    const adapter=this.app.vault.adapter;
    const fullPath=typeof adapter.getFullPath==='function'?adapter.getFullPath(target.path):null;
    if(!fullPath&&size>128*1024**2)throw new Error('手机暂支持最多 128 MiB；更大的附件请从电脑分片上传');
    const previous=Object.values(this.settings.attachmentAssets||{}).flat().find(a=>a.uploadIdentity===identity&&!a.pendingDelete);
    if(previous){
      const r=await requestUrl({url:previous.publicUrl,method:'HEAD',throw:false});
      if(r.status===200&&Number(r.headers['content-length'])===size)return {...previous,uploadIdentity:identity};
      if(r.status!==404)throw new Error('无法核实已有附件，已保留本地链接');
    }
    this.settings.pendingUploads ||= {};
    const uploadKey='vps:'+identity;
    let pending=this.settings.pendingUploads[uploadKey];
    if(!pending){const bytes=require('crypto').randomBytes(16);pending={backend:'vps',requestId:[...bytes].map(n=>n.toString(16).padStart(2,'0')).join(''),parts:[]};this.settings.pendingUploads[uploadKey]=pending;await this.saveData(this.settings);}
    if(!pending.ticket||pending.expiresAt<Date.now()+60000){
      const fresh=await this.api('/api/media/upload-ticket','POST',{requestId:pending.requestId,name:target.name,size});
      const u=new URL(fresh.base);
      if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!/^private-share-direct\//.test(fresh.key)||fresh.chunk!==8*1024**2)throw new Error('服务端返回了无效的 VPS 上传配置');
      Object.assign(pending,fresh,{session:null,parts:[]});await this.saveData(this.settings);
    }
    let done=await this.directRequest(pending.base,'/upload/status',pending.ticket);
    if(!done.done){
      pending.parts=Array.isArray(done.parts)?done.parts:[];
      if(!pending.session){const started=await this.directRequest(pending.base,'/upload/start',pending.ticket,'POST',{name:target.name});if(started.done)done=started;else{pending.session=started.session;await this.saveData(this.settings);}}
      if(!done.done){
        new Notice('正在直传 VPS：'+target.name,5000);
        const total=Math.ceil(size/pending.chunk);let handle,mobile;
        try{
          if(fullPath)handle=await require('fs').promises.open(fullPath,'r');
          else mobile=await this.app.vault.readBinary(target);
          for(let number=1;number<=total;number++){
            if(pending.parts.some(p=>p.partNumber===number))continue;
            if(this.desktopUploadsStopped)throw new Error('上传暂停，分片已保存');
            const before=await adapter.stat(target.path);
            if(!before||before.size!==size||before.mtime!==mtime)throw new Error('本地附件已删除或改变，停止上传');
            const start=(number-1)*pending.chunk,length=Math.min(pending.chunk,size-start);
            let body;
            if(handle){const buffer=new Uint8Array(length);let offset=0;while(offset<length){const r=await handle.read(buffer,offset,length-offset,start+offset);if(!r.bytesRead)throw new Error('附件读取不完整，请重试');offset+=r.bytesRead;}body=buffer.buffer;}
            else body=mobile.slice(start,start+length);
            const part=await this.directRequest(pending.base,'/upload/part',pending.session,'PUT',body,number);
            if(part.part?.partNumber!==number||typeof part.part.etag!=='string')throw new Error('无效的分片确认');
            pending.parts.push(part.part);pending.parts.sort((a,b)=>a.partNumber-b.partNumber);await this.saveData(this.settings);
            if(total>1)new Notice('VPS 上传 '+target.name+'：'+Math.round(number/total*100)+'%',1500);
          }
        }finally{await handle?.close();}
        const current=await adapter.stat(target.path);
        if(!current||current.size!==size||current.mtime!==mtime){await this.directRequest(pending.base,'/upload/abort',pending.session).catch(()=>{});delete this.settings.pendingUploads[uploadKey];await this.saveData(this.settings);throw new Error('上传期间附件发生变化，已保留本地链接，请重试');}
        done=await this.directRequest(pending.base,'/upload/complete',pending.session,'POST',{parts:pending.parts});
      }
    }
    if(!done.done||done.key!==pending.key||done.size!==size||!/^[A-Za-z0-9_-]{16}$/.test(done.code||''))throw new Error('VPS 上传确认不完整，本地链接保留');
    const publicUrl=pending.base+'/m/'+done.code;
    // Preserve ownership until the public file can be read.
    let visible=false;
    for(let attempt=0;attempt<21;attempt++){
      try{const r=await requestUrl({url:publicUrl,method:'GET',headers:{Range:'bytes=0-0'},throw:false});if(r.status===206&&r.headers['content-range']?.endsWith('/'+size)){visible=true;break;}}catch{}
      if(attempt<20)await new Promise(resolve=>window.setTimeout(resolve,3000));
    }
    if(!visible)throw new Error('VPS 已上传，短链接暂未生效；稍后重试会复用文件');
    const current=await adapter.stat(target.path);
    if(!current||current.size!==size||current.mtime!==mtime)throw new Error('附件已变化，旧上传记录保留，请重试');
    return {backend:'vps',remotePath:pending.remotePath,publicUrl,uploadKey,uploadIdentity:identity};
  }

  async collectVaultMediaUrls() {
    const urls=new Set();
    for(const file of this.app.vault.getMarkdownFiles()){
      const text=await this.app.vault.read(file);
      for(const url of text.match(/https?:\/\/[^\s<>"')]+/g)||[])urls.add(url.replaceAll('&amp;','&'));
      const local=this.localAttachmentTargets(text,file);
      for(const asset of Object.values(this.settings.attachmentAssets||{}).flat())if(asset.publicUrl&&local.has(asset.originalLocalPath))urls.add(asset.publicUrl);
    }
    return [...urls];
  }

  localAttachmentTargets(text,file) {
    const targets=new Map(),refs=[...text.matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map(m=>m[1]);
    for(const m of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g))refs.push(m[1]);
    for(const m of text.matchAll(/<(?:img|audio|video|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi))refs.push(m[1]);
    for(let raw of refs){raw=raw.trim();if(/^(?:https?:|data:|app:|obsidian:|mailto:)/i.test(raw))continue;raw=raw.replace(/^<|>$/g,'').split('#')[0];try{raw=decodeURIComponent(raw);}catch{}const target=this.app.metadataCache.getFirstLinkpathDest(raw,file.path);if(target instanceof TFile&&target.extension!=='md')targets.set(target.path,target);}
    return targets;
  }

  localBackupFor(target,notePath) {
    const identity=target.path+':'+target.stat.mtime+':'+target.stat.size;
    return [...(this.settings.attachmentAssets?.[notePath]||[]),...Object.values(this.settings.attachmentAssets||{}).flat()].find(a=>a.originalLocalPath===target.path&&a.publicUrl&&(a.uploadIdentity===identity||a.localSize===target.stat.size&&Math.abs(a.localMtime-target.stat.mtime)<1));
  }

  async backupNoteAttachments(file,runOptions={}) {
    if(this.isMobileDevice())return false;
    try {
      const text=await this.app.vault.read(file),targets=this.localAttachmentTargets(text,file),uploaded=new Map();
      for(const [localPath,target] of targets){
        if(this.localBackupFor(target,file.path))continue;
        if(!await this.desktopUploadAvailable())return false;
        const localSize=target.stat.size,localMtime=target.stat.mtime;
        const asset=await this.uploadFileToVPS(target);
        // The note may have changed while bytes were uploading. Do not claim a removed reference.
        if(!this.localAttachmentTargets(await this.app.vault.read(file),file).has(localPath)||target.stat.size!==localSize||target.stat.mtime!==localMtime){
          this.recordAttachmentAssets(file.path,new Map([[localPath,{...asset,localSize,localMtime}]]));
          const orphan=this.settings.attachmentAssets[file.path].find(a=>a.remotePath===asset.remotePath);orphan.pendingDelete=true;orphan.deleteReason='link';
          await this.saveData(this.settings);continue;
        }
        uploaded.set(localPath,{...asset,localSize,localMtime});
      }
      if(!uploaded.size)return false;
      this.recordAttachmentAssets(file.path,uploaded);
      this.settings.pendingUploadedShareRefresh ||= {};this.settings.pendingUploadedShareRefresh[file.path]=true;
      await this.saveData(this.settings);
      if(runOptions.automatic)await this.retryUploadedShareRefresh();
      new Notice('已备份 '+uploaded.size+' 个附件到 VPS，本地引用保留',4500);return true;
    }catch(error){console.error('Attachment backup failed',error);new Notice('附件备份失败，本地文件保留：'+error.message,9000);return false;}
  }

  recordAttachmentAssets(notePath, uploadedMap) {
    if (!this.settings.attachmentAssets) {
      this.settings.attachmentAssets = {};
    }
    const current = Array.isArray(
      this.settings.attachmentAssets[notePath]
    )
      ? this.settings.attachmentAssets[notePath]
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
      if (uploaded.uploadKey) delete this.settings.pendingUploads?.[uploaded.uploadKey];
      if (uploaded.legacyUploadKey) delete this.settings.pendingUploads?.[uploaded.legacyUploadKey];
      byRemotePath.set(uploaded.remotePath, {
        backend: "vps",
        uploadIdentity: uploaded.uploadIdentity || "",
        remotePath: uploaded.remotePath,
        publicUrl: uploaded.publicUrl || "",
        originalLocalPath: localPath || "",
        localSize: uploaded.localSize,
        localMtime: uploaded.localMtime,
        uploadedAt: new Date().toISOString(),
        seenInNote: true,
      });
    }

    this.settings.attachmentAssets[notePath] =
      [...byRemotePath.values()];
  }

  scheduleReferenceCheck(file) {
    if (!(file instanceof TFile) || file.extension !== "md")
      return;

    const oldTimer =
      this.referenceTimers.get(file.path);
    if (oldTimer) window.clearTimeout(oldTimer);

    const timer = window.setTimeout(async () => {
      this.referenceTimers.delete(file.path);
      try {
        await this.markRemovedAttachmentReferences(file);
      } catch (error) {
        console.error(
          "Attachment reference check failed",
          error
        );
      }
    }, 5000);

    this.referenceTimers.set(
      file.path,
      timer
    );
  }

  async markRemovedAttachmentReferences(file) {
    if (this.configTransferRunning) return false;
    if (this.backupRunning?.has(file.path) || this.backupJobs?.has(file.path)) return;
    const assets = this.settings.attachmentAssets?.[file.path] || [];
    if (!assets.length) return;
    const text = (await this.app.vault.read(file)).replaceAll("&amp;", "&");
    for (const asset of assets) {
      if (asset.publicUrl && (text.includes(asset.publicUrl)||this.localAttachmentTargets(text,file).has(asset.originalLocalPath))) {
        asset.seenInNote = true; delete asset.pendingDelete;
      } else if (asset.seenInNote) {
        asset.pendingDelete = true; asset.deleteReason = "link";
      }
    }
    await this.saveData(this.settings);
    await this.retryAttachmentCleanup();
  }

  async verifyAttachmentReferences() {
    const urls=new Set(await this.collectVaultMediaUrls());
    const data = await this.api("/api/media/references", "POST", {urls:[...urls]});
    if (!Array.isArray(data.remotePaths) || data.unresolved !== false) throw new Error("存在未能核实的附件引用，已保留远程文件");
    return new Set(data.remotePaths.map(normalizeRemotePath));
  }

  async openAttachmentCleanup() {
    if(this.isMobileDevice()){new Notice("请在电脑上管理 VPS 副本");return;}
    if(this.backupJobs?.size||this.backupRunning?.size||this.desktopScanRunning||this.attachmentCleanupRunning){new Notice("附件任务正在进行，请稍后重试");return;}
    try{
    const referenced=new Set(await this.collectVaultMediaUrls()),candidates=[];
    for(const [notePath,assets]of Object.entries(this.settings.attachmentAssets||{}))for(const asset of assets)if(asset.remotePath&&asset.publicUrl&&!referenced.has(asset.publicUrl))candidates.push({notePath,asset});
    if(!candidates.length){new Notice("没有可清理的附件");return;}
    new AttachmentCleanupModal(this.app,this,candidates).open();
    }catch(e){new Notice("附件检查失败，VPS 副本保留："+e.message);}
  }

  async retryAttachmentCleanup(options={}) {
    if(!options.manual)return false;
    if(this.isMobileDevice())return false;
    if (this.configTransferRunning) return false;
    if (this.attachmentCleanupRunning) return;
    this.attachmentCleanupRunning = true;
    try {
      const entries = Object.entries(this.settings.attachmentAssets || {});
      for (const [notePath, assets] of entries) {
        if (!Array.isArray(assets)) continue;
        for (const asset of [...assets]) {
          if (!asset.pendingDelete || !asset.remotePath) continue;
          if (this.backupRunning?.size || this.backupJobs?.size) continue;
          try {
            // Re-read all notes immediately before each delete. Unavailable checks fail closed.
            const references = await this.verifyAttachmentReferences();
            if (references.has(normalizeRemotePath(asset.remotePath))) {
              asset.cleanupStatus = "referenced"; continue;
            }
            // Unknown historical ownership records protect the object as well.
            const uncertain = entries.some(([owner, list]) => owner !== notePath && Array.isArray(list) && list.some(x => x.remotePath === asset.remotePath && !x.pendingDelete));
            if (uncertain) {asset.cleanupStatus = "tracked-elsewhere";continue;}
            const removed=await this.api('/api/media/direct-delete','POST',{remotePath:asset.remotePath,urls:await this.collectVaultMediaUrls()});
            if(removed.ok!==true)throw new Error('远程删除未确认，记录保留');
            const index = assets.indexOf(asset); if (index >= 0) assets.splice(index, 1);
          } catch (_) {
            asset.cleanupStatus = "retry";
            asset.lastAttempt = new Date().toISOString();
          }
        }
        if (!assets.length) delete this.settings.attachmentAssets[notePath];
      }
      await this.saveData(this.settings);
    } finally { this.attachmentCleanupRunning = false; }
  }

  async queueDeletedNoteAttachments(notePath) {
    for(const asset of this.settings.attachmentAssets?.[notePath]||[]){asset.pendingDelete=true;asset.deleteReason="note";}
    await this.saveData(this.settings);
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

  async localImagesForShare(markdown,file) {
    const images=new Map();let total=0;
    const resolve=raw=>{
      if(/^(?:https?:|data:|app:|obsidian:|mailto:)/i.test(raw.trim()))return null;
      let link=raw.trim().replace(/^<|>$/g,'').split('#')[0];try{link=decodeURIComponent(link);}catch{}
      const target=this.app.metadataCache.getFirstLinkpathDest(link,file.path);
      return target instanceof TFile&&isImageName(target.name)?target:null;
    };
    const refs=[...markdown.matchAll(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map(m=>m[1]);
    for(const m of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g))refs.push(m[1]);
    for(const m of markdown.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi))refs.push(m[1]);
    for(const raw of refs){
      const target=resolve(raw);if(!target||images.has(target.path)||this.localBackupFor(target,file.path))continue;
      if(images.size>=60||target.stat.size>16*1024**2||total+target.stat.size>48*1024**2)throw Error('分享图片最多 60 张、单张 16 MiB、合计 48 MiB；Vault 图片保留');
      const size=target.stat.size,mtime=target.stat.mtime,binary=await this.app.vault.readBinary(target);
      const current=await this.app.vault.adapter.stat(target.path);
      if(binary.byteLength!==size||!current||current.size!==size||current.mtime!==mtime)throw Error('分享图片正在同步或变化，请稍后重试');
      const ext=target.name.split('.').pop().toLowerCase(),key='asset-'+(images.size+1)+'.'+ext;
      images.set(target.path,{key,name:target.name,mime:mimeFromName(target.name),dataBase64:arrayBufferToBase64(binary)});total+=size;
    }
    return {images,resolve};
  }

  async preparePayload(file, options, existing, runOptions={}) {
    if(!runOptions.skipUpload)await this.backupCurrentNote(file,{silentNoop:true});
    let markdown=await this.app.vault.read(file);
    const local=await this.localImagesForShare(markdown,file);
    const attachments=[...local.images.values()],uploads=[];
    const labelText=value=>String(value).replace(/[\[\]<>]/g,'');
    const placeholder=(target,label)=>{
      const backup=this.localBackupFor(target,file.path);
      if(backup)return attachmentMarkup(target.name,label||target.name,backup.publicUrl,true);
      const image=local.images.get(target.path);
      if(image)return attachmentMarkup(target.name,label||target.name,'{{ASSET_BASE}}/'+image.key,true);
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
    markdown=markdown.replace(/<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi,(match,quote,raw)=>{
      const target=local.resolve(raw),image=target&&local.images.get(target.path);
      const backup=target&&this.localBackupFor(target,file.path);
      return backup?match.replace(quote+raw+quote,quote+htmlAttr(backup.publicUrl)+quote):image?match.replace(quote+raw+quote,quote+'{{ASSET_BASE}}/'+image.key+quote):match;
    });
    markdown=markdown.replace(/<(?:audio|video|source)\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi,(match,quote,raw)=>{let link=raw.trim().replace(/^<|>$/g,'').split('#')[0];try{link=decodeURIComponent(link);}catch{}const target=this.app.metadataCache.getFirstLinkpathDest(link,file.path),backup=target instanceof TFile&&this.localBackupFor(target,file.path);return backup?match.replace(quote+raw+quote,quote+htmlAttr(backup.publicUrl)+quote):match;});
    markdown=markdown.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,(_m,raw,alias)=>{const target=this.app.metadataCache.getFirstLinkpathDest(raw.trim(),file.path),backup=target instanceof TFile&&this.localBackupFor(target,file.path);return backup?attachmentMarkup(target.name,alias||target.name,backup.publicUrl,false):alias||raw;});

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

    const request = base => requestUrl({url:base+apiPath,method,headers,body:body?JSON.stringify(body):undefined,throw:false});
    let response;
    const attempts=method==='GET'||apiPath.startsWith('/api/media/')?3:1;
    for(let attempt=0;attempt<attempts;attempt++){
      try{response=await request(server);break;}
      catch(error){if(attempt===attempts-1)throw error;await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));}
    }

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
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
  display(){
    const c=this.containerEl;c.empty();
    c.createEl('p',{text:this.plugin.isMobileDevice()?'本地附件直接显示。手机不上传，附件同步到电脑后自动备份到 VPS。':'本地附件直接显示，电脑自动直传 VPS 保存副本；分享网页使用 VPS 链接。'});
    new Setting(c).setName('分享地址').setDesc('发布和管理笔记的服务地址。').addText(t=>t.setPlaceholder('https://share.example.com').setValue(this.plugin.settings.serverUrl||'').onChange(async value=>{this.plugin.settings.serverUrl=value.trim();await this.plugin.saveData(this.plugin.settings)}));
    new Setting(c).setName('连接密钥').setDesc('用于发布、管理和附件备份，不会出现在分享链接中。').addText(t=>{t.inputEl.type='password';t.setValue(this.plugin.settings.apiToken||'').onChange(async value=>{this.plugin.settings.apiToken=value.trim();await this.plugin.saveData(this.plugin.settings)});});
    new Setting(c).setName('新设备配置').setDesc('导入或导出加密的连接配置。').addButton(b=>b.setButtonText('导入').onClick(()=>new ConfigTransferModal(this.app,this.plugin,'import').open())).addButton(b=>b.setButtonText('导出').onClick(()=>new ConfigTransferModal(this.app,this.plugin,'export').open()));
    new Setting(c).setName('连接检查').addButton(b=>b.setButtonText('检查连接').onClick(async()=>{b.setDisabled(true);try{await this.plugin.api('/api/shares','GET');new Notice('分享服务连接正常')}catch(e){new Notice('连接失败：'+e.message)}finally{b.setDisabled(false)}}));
    new Setting(c).setName('分享管理').setDesc('查看分享、修改到期时间、删除分享及查看讨论。').addButton(b=>b.setButtonText('打开').onClick(()=>new ShareManagerModal(this.app,this.plugin).open()));
    if(!this.plugin.isMobileDevice()){
      new Setting(c).setName('附件备份').setDesc('自动备份已开启；可手动检查并重试。不会改写本地引用。').addButton(b=>b.setButtonText('检查并重试').onClick(()=>this.plugin.scanDesktopAttachments({manual:true})));
      new Setting(c).setName('附件清理').setDesc('仅手动清理。先查看候选文件，确认后核实所有引用；无法核实的文件保留。').addButton(b=>b.setButtonText('检查可清理附件').onClick(()=>this.plugin.openAttachmentCleanup()));
    }
  }
}


module.exports = PrivateSharePlugin;
