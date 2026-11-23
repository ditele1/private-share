const assert = require('node:assert/strict');
const Module = require('node:module');
class TFile {
  constructor(path) {
    this.path = path;
    this.name = path.split('/').pop();
    this.extension = this.name.split('.').pop();
    this.basename = this.name.replace(/\.[^.]+$/, '');
    this.stat = {size: 32, mtime: 50};
  }
}
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === 'obsidian') {
    return {Plugin: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {}, TFile};
  }
  return load.call(this, name, ...args);
};
const Plugin = require('../main.js');
const plugin = new Plugin();
const note = new TFile('notes/test.md');
const files = Object.fromEntries(['test.md', 'new picture.png', 'old.png', 'manual.pdf'].map(name => [name, new TFile(name)]));
const original = [
  '![[new picture.png]]', '[说明](manual.pdf)', '[[manual.pdf|手册]]',
  '![alt](new%20picture.png)', '<img src="new%20picture.png">',
  '![[old.png]]', '<img src="old.png">',
  '![external](https://example.com/file.png)', '[[test.md|笔记]]'
].join('\n');
plugin.app = {
  vault: {
    read: async () => original,
    readBinary: () => {throw Error('Unexpected local attachment binary read');}
  },
  metadataCache: {getFirstLinkpathDest: path => files[path]}
};
plugin.settings = {shares: {}, attachmentAssets: {
  [note.path]: [{originalLocalPath: 'old.png', publicUrl: 'https://example.com/old', localSize: 32, localMtime: 50}]
}};
const expected = [
  '**new picture.png（本地附件）**', '**说明（本地附件）**', '**手册（本地附件）**',
  '**alt（本地附件）**', '**new picture.png（本地附件）**',
  '![old.png](https://example.com/old)', '<img src="https://example.com/old">',
  '![external](https://example.com/file.png)', '笔记'
].join('\n');
const calls = [];
plugin.api = async (path, method, payload) => {
  calls.push({path, method});
  assert.deepEqual(payload.attachments, []);
  assert.equal(payload.markdown, expected);
  assert.equal(payload.options.discussionEnabled, true);
  return {shareId: 'share', editToken: 'edit', url: 'https://example.com/share', discussionEnabled: true};
};
plugin.saveData = async () => {};
plugin.copyUrl = async () => {};
(async () => {
  const opts = {discussionEnabled: true};
  await plugin.shareFile(note, opts, {skipClaim: true});
  await plugin.updateShare(note, opts, {skipClaim: true});
  assert.deepEqual(calls, [{path:'/api/publish', method:'POST'}, {path:'/api/update/share', method:'PUT'}]);
  assert.equal(plugin.settings.shares[note.path].shareId, 'share');
  assert.deepEqual([...plugin.localAttachmentTargets(original, note)].sort(), ['manual.pdf', 'new picture.png', 'old.png']);
  console.log('Publish, update, historical links, and local attachment placeholders passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});

