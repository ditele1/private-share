const {Plugin,PluginSettingTab,Setting,Notice,TFile,requestUrl}=require("obsidian");

const DEF={serverUrl:"",apiToken:"",shares:{}};

function b64(buffer){
  const bytes=new Uint8Array(buffer); let s="";
  for(let i=0;i<bytes.length;i+=32768){
    s+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+32768,bytes.length)));
  }
  return btoa(s);
}
function base(u){return (u||"").trim().replace(/\/+$/,"");}
function isImg(n){return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(n);}
function mime(n){
  const e=(n.split(".").pop()||"").toLowerCase();
  const m={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",pdf:"application/pdf",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",doc:"application/msword",zip:"application/zip"};
  return m[e]||"application/octet-stream";
}

class PrivateShare extends Plugin{
  async onload(){
    this.settings=Object.assign({},DEF,await this.loadData());
    if(!this.settings.shares)this.settings.shares={};
    this.addSettingTab(new Tab(this.app,this));

    this.addCommand({id:"share-current",name:"分享当前笔记",checkCallback:(c)=>{
      const f=this.app.workspace.getActiveFile();
      if(!(f instanceof TFile)||f.extension!=="md")return false;
      if(!c)this.share(f); return true;
    }});
    this.addCommand({id:"update-current",name:"更新当前分享",checkCallback:(c)=>{
      const f=this.app.workspace.getActiveFile();
      if(!(f instanceof TFile)||!this.settings.shares[f.path])return false;
      if(!c)this.update(f); return true;
    }});
    this.addCommand({id:"unshare-current",name:"取消当前分享",checkCallback:(c)=>{
      const f=this.app.workspace.getActiveFile();
      if(!(f instanceof TFile)||!this.settings.shares[f.path])return false;
      if(!c)this.unshare(f); return true;
    }});

    this.registerEvent(this.app.workspace.on("file-menu",(menu,file)=>{
      if(!(file instanceof TFile)||file.extension!=="md")return;
      menu.addSeparator();
      menu.addItem(i=>i.setTitle("分享此笔记").setIcon("share-2").onClick(()=>this.share(file)));
      if(this.settings.shares[file.path]){
        menu.addItem(i=>i.setTitle("更新此分享").setIcon("refresh-cw").onClick(()=>this.update(file)));
        menu.addItem(i=>i.setTitle("取消分享").setIcon("link-2-off").onClick(()=>this.unshare(file)));
      }
    }));
  }

  config(){
    const u=base(this.settings.serverUrl);
    if(!u){new Notice("请先填写 Private Share 服务器地址");return null;}
    if(!this.settings.apiToken){new Notice("请先填写 API Token");return null;}
    return u;
  }

  async payload(file){
    let md=await this.app.vault.read(file);
    const at=[]; let n=0;
    const re=/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
    const matches=[...md.matchAll(re)];
    for(const x of matches){
      const raw=x[1].trim(), alias=(x[2]||"").trim();
      const t=this.app.metadataCache.getFirstLinkpathDest(raw,file.path);
      if(!(t instanceof TFile)||t.extension==="md")continue;
      const key="asset-"+(++n)+"."+(t.extension||"bin").toLowerCase();
      const label=alias||t.name;
      const rep=isImg(t.name) ? "!["+label+"]({{ASSET_BASE}}/"+key+")" : "["+label+"]({{ASSET_BASE}}/"+key+")";
      md=md.replace(x[0],rep);
      at.push({key:key,name:t.name,mime:mime(t.name),dataBase64:b64(await this.app.vault.readBinary(t))});
    }
    md=md.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,(_m,a,b)=>b||a);
    return {title:file.basename,sourcePath:file.path,markdown:md,attachments:at};
  }

  async api(path,method,body,edit){
    const u=this.config(); if(!u)throw new Error("missing settings");
    const h={Authorization:"Bearer "+this.settings.apiToken,"Content-Type":"application/json"};
    if(edit)h["X-Edit-Token"]=edit;
    const r=await requestUrl({url:u+path,method:method,headers:h,body:body?JSON.stringify(body):undefined,throw:false});
    let d={}; try{d=r.json||JSON.parse(r.text||"{}");}catch(_){}
    if(r.status<200||r.status>=300)throw new Error(d.error||("HTTP "+r.status));
    return d;
  }

  async copy(url){
    try{await navigator.clipboard.writeText(url);new Notice("分享链接已复制");}
    catch(_){new Notice("分享成功："+url,10000);}
  }

  async share(file){
    try{
      if(this.settings.shares[file.path])return this.update(file);
      new Notice("正在生成分享链接...");
      const d=await this.api("/api/publish","POST",await this.payload(file));
      this.settings.shares[file.path]={shareId:d.shareId,editToken:d.editToken,url:d.url};
      await this.saveData(this.settings); await this.copy(d.url);
    }catch(e){console.error(e);new Notice("分享失败："+(e.message||e),8000);}
  }

  async update(file){
    try{
      const s=this.settings.shares[file.path]; if(!s)return this.share(file);
      new Notice("正在更新分享...");
      const d=await this.api("/api/update/"+encodeURIComponent(s.shareId),"PUT",await this.payload(file),s.editToken);
      if(d.url)s.url=d.url; await this.saveData(this.settings); await this.copy(s.url);
    }catch(e){console.error(e);new Notice("更新失败："+(e.message||e),8000);}
  }

  async unshare(file){
    try{
      const s=this.settings.shares[file.path]; if(!s)return;
      await this.api("/api/unpublish/"+encodeURIComponent(s.shareId),"DELETE",null,s.editToken);
      delete this.settings.shares[file.path]; await this.saveData(this.settings); new Notice("分享已取消");
    }catch(e){console.error(e);new Notice("取消失败："+(e.message||e),8000);}
  }
}

class Tab extends PluginSettingTab{
  constructor(app,p){super(app,p);this.p=p;}
  display(){
    const c=this.containerEl;c.empty();
    new Setting(c).setName("分享服务器").setDesc("例如 https://share.example.com").addText(t=>t.setValue(this.p.settings.serverUrl||"").onChange(async v=>{this.p.settings.serverUrl=v.trim();await this.p.saveData(this.p.settings);}));
    new Setting(c).setName("API Token").setDesc("只用于发布、更新和取消分享").addText(t=>t.setValue(this.p.settings.apiToken||"").onChange(async v=>{this.p.settings.apiToken=v.trim();await this.p.saveData(this.p.settings);}));
    new Setting(c).setName("本机分享记录").setDesc("共 "+Object.keys(this.p.settings.shares||{}).length+" 篇");
  }
}
module.exports=PrivateShare;
