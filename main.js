
const { Plugin, PluginSettingTab, Setting, Notice, TFile, requestUrl, Modal } = require("obsidian");
const DEFAULT_SETTINGS = { serverUrl: "", apiToken: "", shares: {} };

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
function normalizeBase(url) { return (url || "").trim().replace(/\/+$/, ""); }
function mimeFromName(name) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map = { png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",pdf:"application/pdf",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",doc:"application/msword",zip:"application/zip",txt:"text/plain" };
  return map[ext] || "application/octet-stream";
}
function isImageName(name) { return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name); }
function computeExpiry(choice) {
  if (!choice || choice === "none" || choice === "keep") return null;
  const map = { "1h":1, "1d":24, "7d":168, "30d":720 };
  const hours = map[choice];
  if (!hours) return null;
  return new Date(Date.now() + hours * 3600000).toISOString();
}

class ShareOptionsModal extends Modal {
  constructor(app, plugin, file, mode, existing, onSubmit) {
    super(app); this.plugin=plugin; this.file=file; this.mode=mode; this.existing=existing||null; this.onSubmit=onSubmit;
    this.passwordEnabled=!!(existing&&existing.passwordProtected); this.password=""; this.expiryChoice=mode==="update"?"keep":"none";
  }
  onOpen(){ this.render(); }
  render(){
    const c=this.contentEl; c.empty();
    c.createEl("h2",{text:this.mode==="update"?"更新分享设置":"分享此笔记"});
    c.createEl("p",{text:this.file.path,cls:"private-share-muted"});
    new Setting(c).setName("访问密码").setDesc(this.mode==="update"&&this.existing&&this.existing.passwordProtected?"已启用密码。保持开启且密码留空，会保留原密码。":"开启后，访问者需要输入密码才能查看正文和附件。")
      .addToggle(t=>t.setValue(this.passwordEnabled).onChange(v=>{this.passwordEnabled=v;this.render();}));
    if(this.passwordEnabled){
      new Setting(c).setName(this.mode==="update"&&this.existing&&this.existing.passwordProtected?"新密码（可留空）":"密码")
        .setDesc(this.mode==="update"&&this.existing&&this.existing.passwordProtected?"留空表示继续使用当前密码。":"建议使用不容易猜到的密码。")
        .addText(t=>{t.inputEl.type="password";t.setPlaceholder(this.mode==="update"&&this.existing&&this.existing.passwordProtected?"留空保留原密码":"输入访问密码");t.onChange(v=>{this.password=v;});});
    }
    new Setting(c).setName("有效期").setDesc(this.mode==="update"?"可以保持当前有效期，或重新设置。":"到期后分享页面和附件会自动失效。")
      .addDropdown(d=>{if(this.mode==="update")d.addOption("keep","保持当前设置");d.addOption("none","永久有效").addOption("1h","1 小时").addOption("1d","1 天").addOption("7d","7 天").addOption("30d","30 天").setValue(this.expiryChoice).onChange(v=>{this.expiryChoice=v;});});
    const f=c.createDiv({cls:"private-share-modal-footer"});
    f.createEl("button",{text:"取消"}).addEventListener("click",()=>this.close());
    f.createEl("button",{text:this.mode==="update"?"更新分享":"创建分享",cls:"mod-cta"}).addEventListener("click",async()=>{
      if(this.passwordEnabled&&(!this.existing||!this.existing.passwordProtected)&&!this.password.trim()){new Notice("请输入访问密码，或关闭密码保护");return;}
      const o={passwordProtected:this.passwordEnabled,password:this.password,expiryMode:this.expiryChoice}; this.close(); await this.onSubmit(o);
    });
  }
  onClose(){this.contentEl.empty();}
}

class ShareManagerModal extends Modal {
  constructor(app,plugin){super(app);this.plugin=plugin;}
  onOpen(){this.render();}
  render(){
    const c=this.contentEl;c.empty();c.createEl("h2",{text:"Private Share 管理"});
    const entries=Object.entries(this.plugin.settings.shares||{});
    if(!entries.length){c.createEl("p",{text:"当前没有本机记录的分享。"});return;}
    c.createEl("p",{text:"共 "+entries.length+" 篇分享。这里显示的是本机插件记录。",cls:"private-share-muted"});
    const list=c.createDiv({cls:"private-share-manager"});
    for(const [notePath,share] of entries){
      const row=list.createDiv({cls:"private-share-manager-row"});
      const info=row.createDiv({cls:"private-share-manager-info"});
      info.createEl("strong",{text:share.title||notePath.split("/").pop()||notePath});
      info.createEl("div",{text:notePath,cls:"private-share-muted"});
      const badges=info.createDiv({cls:"private-share-badges"});
      if(share.passwordProtected)badges.createSpan({text:"密码保护",cls:"private-share-badge"});
      if(share.expiresAt)badges.createSpan({text:"到期："+new Date(share.expiresAt).toLocaleString(),cls:"private-share-badge"});
      const actions=row.createDiv({cls:"private-share-manager-actions"});
      actions.createEl("button",{text:"复制链接"}).addEventListener("click",async()=>{await this.plugin.copyUrl(share.url,false);new Notice("分享链接已复制");});
      const file=this.app.vault.getAbstractFileByPath(notePath);
      if(file instanceof TFile)actions.createEl("button",{text:"更新"}).addEventListener("click",()=>{this.close();this.plugin.openShareOptions(file,"update");});
      actions.createEl("button",{text:"取消分享",cls:"mod-warning"}).addEventListener("click",async()=>{const ok=await this.plugin.unshareByPath(notePath,false);if(ok)this.render();});
    }
  }
  onClose(){this.contentEl.empty();}
}

class PrivateSharePlugin extends Plugin {
  async onload(){
    this.settings=Object.assign({},DEFAULT_SETTINGS,await this.loadData());if(!this.settings.shares)this.settings.shares={};
    this.addSettingTab(new PrivateShareSettingTab(this.app,this));
    this.addCommand({id:"share-current-note",name:"分享当前笔记",checkCallback:(checking)=>{const file=this.app.workspace.getActiveFile();if(!(file instanceof TFile)||file.extension!=="md")return false;if(!checking)this.openShareOptions(file,this.settings.shares[file.path]?"update":"create");return true;}});
    this.addCommand({id:"update-current-share",name:"更新当前分享",checkCallback:(checking)=>{const file=this.app.workspace.getActiveFile();if(!(file instanceof TFile)||file.extension!=="md"||!this.settings.shares[file.path])return false;if(!checking)this.openShareOptions(file,"update");return true;}});
    this.addCommand({id:"copy-current-share-link",name:"复制当前分享链接",checkCallback:(checking)=>{const file=this.app.workspace.getActiveFile();if(!(file instanceof TFile)||file.extension!=="md")return false;const share=this.settings.shares[file.path];if(!share||!share.url)return false;if(!checking)this.copyUrl(share.url);return true;}});
    this.addCommand({id:"unshare-current-note",name:"取消当前分享",checkCallback:(checking)=>{const file=this.app.workspace.getActiveFile();if(!(file instanceof TFile)||file.extension!=="md"||!this.settings.shares[file.path])return false;if(!checking)this.unshareFile(file);return true;}});
    this.addCommand({id:"manage-shares",name:"管理所有分享",callback:()=>new ShareManagerModal(this.app,this).open()});
    this.addRibbonIcon("share-2","Private Share",()=>{const file=this.app.workspace.getActiveFile();if(file instanceof TFile&&file.extension==="md")this.openShareOptions(file,this.settings.shares[file.path]?"update":"create");else new ShareManagerModal(this.app,this).open();});
    this.registerEvent(this.app.workspace.on("file-menu",(menu,file)=>{if(!(file instanceof TFile)||file.extension!=="md")return;menu.addSeparator();const existing=this.settings.shares[file.path];menu.addItem(item=>item.setTitle(existing?"更新此分享":"分享此笔记").setIcon(existing?"refresh-cw":"share-2").onClick(()=>this.openShareOptions(file,existing?"update":"create")));if(existing&&existing.url){menu.addItem(item=>item.setTitle("复制分享链接").setIcon("copy").onClick(()=>this.copyUrl(existing.url)));menu.addItem(item=>item.setTitle("取消分享").setIcon("link-2-off").onClick(()=>this.unshareFile(file)));}}));
    this.registerEvent(this.app.vault.on("rename",async(file,oldPath)=>{if(!(file instanceof TFile))return;const existing=this.settings.shares[oldPath];if(!existing)return;delete this.settings.shares[oldPath];this.settings.shares[file.path]=existing;await this.saveData(this.settings);}));
  }
  validateSettings(){const server=normalizeBase(this.settings.serverUrl);if(!server){new Notice("请先在 Private Share 设置里填写分享服务器地址");return null;}if(!this.settings.apiToken){new Notice("请先填写 API Token");return null;}return server;}
  openShareOptions(file,mode){const existing=this.settings.shares[file.path]||null;new ShareOptionsModal(this.app,this,file,mode,existing,async(options)=>{if(mode==="update"&&existing)await this.updateShare(file,options);else await this.shareFile(file,options);}).open();}
  async preparePayload(file,options,existing){
    let markdown=await this.app.vault.read(file);const attachments=[];let assetIndex=0;
    const re=/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;const matches=[...markdown.matchAll(re)];
    for(const match of matches){const raw=match[1].trim(),alias=(match[2]||"").trim();const target=this.app.metadataCache.getFirstLinkpathDest(raw,file.path);if(!(target instanceof TFile)||target.extension==="md")continue;const ext=target.extension?"."+target.extension.toLowerCase():"";const key="asset-"+(++assetIndex)+ext;const binary=await this.app.vault.readBinary(target);const label=alias||target.name;const replacement=isImageName(target.name)?"!["+label+"]({{ASSET_BASE}}/"+key+")":"["+label+"]({{ASSET_BASE}}/"+key+")";markdown=markdown.replace(match[0],replacement);attachments.push({key:key,name:target.name,mime:mimeFromName(target.name),dataBase64:arrayBufferToBase64(binary)});}
    markdown=markdown.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,(_m,target,alias)=>alias||target);
    const po={passwordProtected:!!(options&&options.passwordProtected),password:options&&options.password?options.password:"",expiryMode:options&&options.expiryMode?options.expiryMode:"none"};if(po.expiryMode!=="keep")po.expiresAt=computeExpiry(po.expiryMode);
    return {title:file.basename,sourcePath:file.path,markdown:markdown,attachments:attachments,options:po,clientMeta:{hadPassword:!!(existing&&existing.passwordProtected),previousExpiresAt:existing&&existing.expiresAt?existing.expiresAt:null}};
  }
  async api(apiPath,method,body,editToken){const server=this.validateSettings();if(!server)throw new Error("missing settings");const headers={Authorization:"Bearer "+this.settings.apiToken,"Content-Type":"application/json"};if(editToken)headers["X-Edit-Token"]=editToken;const response=await requestUrl({url:server+apiPath,method:method,headers:headers,body:body?JSON.stringify(body):undefined,throw:false});let data={};try{data=response.json||JSON.parse(response.text||"{}");}catch(_){}if(response.status<200||response.status>=300)throw new Error(data.error||("HTTP "+response.status));return data;}
  async copyUrl(url,showNotice=true){try{await navigator.clipboard.writeText(url);if(showNotice)new Notice("分享链接已复制到剪贴板");}catch(_){new Notice("分享链接："+url,10000);}}
  async shareFile(file,options={}){try{const existing=this.settings.shares[file.path];if(existing)return await this.updateShare(file,options);new Notice("正在生成分享链接...");const data=await this.api("/api/publish","POST",await this.preparePayload(file,options,null));this.settings.shares[file.path]={shareId:data.shareId,editToken:data.editToken,url:data.url,title:file.basename,passwordProtected:!!data.passwordProtected,expiresAt:data.expiresAt||null};await this.saveData(this.settings);await this.copyUrl(data.url);}catch(e){console.error("Private Share publish failed",e);new Notice("分享失败："+(e&&e.message?e.message:e),8000);}}
  async updateShare(file,options={}){try{const existing=this.settings.shares[file.path];if(!existing)return this.shareFile(file,options);new Notice("正在更新分享...");const data=await this.api("/api/update/"+encodeURIComponent(existing.shareId),"PUT",await this.preparePayload(file,options,existing),existing.editToken);if(data.url)existing.url=data.url;existing.title=file.basename;existing.passwordProtected=!!data.passwordProtected;existing.expiresAt=data.expiresAt||null;await this.saveData(this.settings);await this.copyUrl(existing.url);}catch(e){console.error("Private Share update failed",e);new Notice("更新失败："+(e&&e.message?e.message:e),8000);}}
  async unshareByPath(notePath,showNotice=true){try{const existing=this.settings.shares[notePath];if(!existing){if(showNotice)new Notice("这篇笔记没有分享记录");return false;}await this.api("/api/unpublish/"+encodeURIComponent(existing.shareId),"DELETE",null,existing.editToken);delete this.settings.shares[notePath];await this.saveData(this.settings);if(showNotice)new Notice("分享已取消");return true;}catch(e){console.error("Private Share unpublish failed",e);new Notice("取消分享失败："+(e&&e.message?e.message:e),8000);return false;}}
  async unshareFile(file){return this.unshareByPath(file.path,true);}
}

class PrivateShareSettingTab extends PluginSettingTab {
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
  display(){const c=this.containerEl;c.empty();new Setting(c).setName("分享服务器").setDesc("例如 https://share.example.com").addText(t=>t.setPlaceholder("https://share.example.com").setValue(this.plugin.settings.serverUrl||"").onChange(async v=>{this.plugin.settings.serverUrl=v.trim();await this.plugin.saveData(this.plugin.settings);}));new Setting(c).setName("API Token").setDesc("用于发布、更新和取消分享；不会出现在公开链接中").addText(t=>{t.inputEl.type="password";t.setPlaceholder("粘贴服务端 API Token").setValue(this.plugin.settings.apiToken||"").onChange(async v=>{this.plugin.settings.apiToken=v.trim();await this.plugin.saveData(this.plugin.settings);});});const count=Object.keys(this.plugin.settings.shares||{}).length;new Setting(c).setName("本机记录的分享").setDesc("共 "+count+" 篇。").addButton(b=>b.setButtonText("管理分享").onClick(()=>new ShareManagerModal(this.app,this.plugin).open()));c.createEl("h3",{text:"手机端快捷操作"});c.createEl("p",{text:"插件提供“分享当前笔记、复制当前分享链接、更新当前分享、管理所有分享”等命令。手机端可在 Obsidian 的移动工具栏设置中把这些命令加入工具栏。",cls:"private-share-muted"});}
}
module.exports=PrivateSharePlugin;
